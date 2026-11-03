import { BadRequestException } from '@nestjs/common';
import { RentalPaymentMethod } from '../generated/prisma/client';
import { DebtsService } from './debts.service';

describe('DebtsService', () => {
  const owedBooking = {
    id: 'booking-1',
    userId: 'user-1',
    status: 'completed',
    amountOwed: '1216000',
    debtPaidAmount: '0',
    device: { id: 'd', name: 'Sony A7 IV', images: [] },
    user: {
      id: 'user-1',
      name: 'Khách A',
      email: 'a@x.vn',
      phone: null,
      isBlacklisted: false,
    },
    debtPayments: [],
  };

  let tx: any;
  let prisma: any;
  let bookingsService: { notifyCustomer: jest.Mock };
  let service: DebtsService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      booking: {
        findUnique: jest.fn().mockResolvedValue(owedBooking),
        update: jest.fn(),
      },
      debtPayment: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'pay-1', ...data })),
      },
    };
    prisma = {
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
      booking: { findMany: jest.fn().mockResolvedValue([owedBooking]) },
    };
    bookingsService = { notifyCustomer: jest.fn() };
    service = new DebtsService(prisma, bookingsService as any);
  });

  it('thu 1 phần: ghi lịch sử thu, cộng dồn số đã trả, báo khách số còn nợ', async () => {
    await service.collect('booking-1', 'staff-1', {
      amount: 1_000_000,
      method: RentalPaymentMethod.cash,
      note: ' Thu tại quầy ',
    });

    expect(tx.$queryRaw).toHaveBeenCalled(); // khoá dòng đơn trước khi đọc số nợ
    expect(tx.debtPayment.create).toHaveBeenCalledWith({
      data: {
        bookingId: 'booking-1',
        userId: 'user-1',
        amount: 1_000_000,
        method: RentalPaymentMethod.cash,
        note: 'Thu tại quầy',
        collectedById: 'staff-1',
      },
    });
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { debtPaidAmount: { increment: 1_000_000 } },
    });
    expect(bookingsService.notifyCustomer).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'debt_paid', amount: 1_000_000, remaining: 216_000 },
    );
  });

  it('thu vượt số nợ còn lại → chặn, không ghi gì', async () => {
    await expect(
      service.collect('booking-1', 'staff-1', {
        amount: 2_000_000,
        method: RentalPaymentMethod.bank_transfer,
      }),
    ).rejects.toThrow('vượt quá số nợ còn lại (1.216.000đ)');
    expect(tx.debtPayment.create).not.toHaveBeenCalled();
  });

  it('đơn đã trả hết nợ → chặn', async () => {
    tx.booking.findUnique.mockResolvedValue({
      ...owedBooking,
      debtPaidAmount: '1216000',
    });
    await expect(
      service.collect('booking-1', 'staff-1', {
        amount: 1000,
        method: RentalPaymentMethod.cash,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('danh sách khách nợ: gộp theo khách, bỏ đơn đã trả hết', async () => {
    prisma.booking.findMany.mockResolvedValue([
      owedBooking,
      {
        ...owedBooking,
        id: 'booking-2',
        amountOwed: '500000',
        debtPaidAmount: '500000',
      },
      { ...owedBooking, id: 'booking-3', amountOwed: '300000' },
    ]);
    const debtors = await service.findDebtors();
    expect(debtors).toHaveLength(1);
    expect(debtors[0].total).toBe(1_516_000);
    expect(debtors[0].bookings.map((b) => b.bookingId)).toEqual([
      'booking-1',
      'booking-3',
    ]);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { amountOwed: { gt: 0 }, isDemo: false },
      }),
    );
  });
});
