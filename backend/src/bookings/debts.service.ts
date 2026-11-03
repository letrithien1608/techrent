import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DebtPayment, Prisma } from '../generated/prisma/client';
import { formatVnd } from '../notifications/notification-templates';
import { BookingsService } from './bookings.service';
import { CollectDebtDto } from './dto/collect-debt.dto';

const debtBooking = {
  include: {
    device: { select: { id: true, name: true, images: true } },
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isBlacklisted: true,
      },
    },
    debtPayments: { orderBy: { createdAt: 'asc' } },
  },
} satisfies Prisma.BookingDefaultArgs;

type DebtBooking = Prisma.BookingGetPayload<typeof debtBooking>;

export interface DebtLine {
  bookingId: string;
  status: string;
  device: DebtBooking['device'];
  amountOwed: number;
  debtPaidAmount: number;
  outstanding: number;
  payments: DebtPayment[];
}

function toLine(booking: DebtBooking): DebtLine {
  const amountOwed = Number(booking.amountOwed);
  const debtPaidAmount = Number(booking.debtPaidAmount);
  return {
    bookingId: booking.id,
    status: booking.status,
    device: booking.device,
    amountOwed,
    debtPaidAmount,
    outstanding: Math.max(amountOwed - debtPaidAmount, 0),
    payments: booking.debtPayments,
  };
}

/**
 * Công nợ của khách: phát sinh khi quyết toán trả máy ra số âm hoặc khi xác
 * nhận mất thiết bị. Khách còn nợ bị chặn đặt thuê (BookingsService.create());
 * nhân viên thu nợ tại cửa hàng và bấm "Đã thu nợ".
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  /** Nợ của chính khách đang đăng nhập — hiện ở trang tài khoản/đơn thuê. */
  async findMine(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId, amountOwed: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      ...debtBooking,
    });
    const lines = bookings.map(toLine).filter((line) => line.outstanding > 0);
    return {
      total: lines.reduce((sum, line) => sum + line.outstanding, 0),
      bookings: lines,
    };
  }

  /** Danh sách khách đang nợ (staff/admin), nợ nhiều nhất trước. */
  async findDebtors() {
    const bookings = await this.prisma.booking.findMany({
      where: { amountOwed: { gt: 0 }, isDemo: false },
      orderBy: { createdAt: 'desc' },
      ...debtBooking,
    });
    const byUser = new Map<
      string,
      { user: DebtBooking['user']; total: number; bookings: DebtLine[] }
    >();
    for (const booking of bookings) {
      const line = toLine(booking);
      if (line.outstanding <= 0) continue;
      const entry = byUser.get(booking.userId) ?? {
        user: booking.user,
        total: 0,
        bookings: [],
      };
      entry.total += line.outstanding;
      entry.bookings.push(line);
      byUser.set(booking.userId, entry);
    }
    return [...byUser.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * Nhân viên thu nợ cho 1 đơn (có thể thu 1 phần). Khoá dòng booking
   * (FOR UPDATE) để 2 lần bấm cùng lúc không thu vượt số nợ.
   */
  async collect(
    bookingId: string,
    actorId: string,
    dto: CollectDebtDto,
  ): Promise<DebtPayment> {
    const { payment, booking, remaining } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id::text = ${bookingId} FOR UPDATE`;
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
        });
        if (!booking) throw new NotFoundException('Không tìm thấy đơn thuê');
        const outstanding =
          Number(booking.amountOwed) - Number(booking.debtPaidAmount);
        if (outstanding <= 0) {
          throw new BadRequestException('Đơn này không còn khoản nợ nào');
        }
        if (dto.amount > outstanding) {
          throw new BadRequestException(
            `Số tiền thu vượt quá số nợ còn lại (${formatVnd(outstanding)})`,
          );
        }
        const payment = await tx.debtPayment.create({
          data: {
            bookingId,
            userId: booking.userId,
            amount: dto.amount,
            method: dto.method,
            note: dto.note?.trim() || null,
            collectedById: actorId,
          },
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: { debtPaidAmount: { increment: dto.amount } },
        });
        return { payment, booking, remaining: outstanding - dto.amount };
      },
    );
    await this.bookingsService.notifyCustomer(booking, {
      kind: 'debt_paid',
      amount: dto.amount,
      remaining,
    });
    return payment;
  }
}
