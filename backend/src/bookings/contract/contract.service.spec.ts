import { BookingStatus } from '../../generated/prisma/client';
import { ContractService } from './contract.service';

describe('ContractService', () => {
  const booking = {
    id: 'ab12cd34-0000-4000-8000-000000000000',
    userId: 'user-1',
    status: BookingStatus.ongoing,
    startTime: new Date('2026-11-05T02:00:00Z'),
    endTime: new Date('2026-11-07T11:00:00Z'),
    totalPrice: '1350000',
    depositAmount: '29000000',
    confirmedById: 'admin-1',
    rentalPaid: true,
    rentalPaymentMethod: 'cash',
    rentalPaidAt: new Date('2026-11-05T02:00:00Z'),
    returnedAt: null,
    lateFeeAmount: '0',
    damageFeeAmount: '0',
    repairFeeAmount: '0',
    depositRefundAmount: '0',
    rentalRefundAmount: '0',
    amountOwed: '0',
    device: {
      name: 'Dell XPS 15',
      brand: 'Dell',
      serialNumber: 'SN-NEW',
      originalPrice: '45000000',
      pricePerHour: '60000',
      pricePerDay: '450000',
      accessories: [{ name: 'Bộ sạc', quantity: 1 }],
      category: { name: 'Laptop' },
    },
    user: {
      name: 'Nguyễn Văn An',
      email: 'an@example.com',
      phone: '0901234567',
      cccdMasked: '********1234',
    },
    inspections: [],
    issueReports: [
      {
        deviceId: 'dev-old',
        replacementDeviceId: 'dev-new',
        resolution: 'swapped',
        description: 'Máy tự tắt nguồn',
        resolutionNote: null,
        resolvedById: 'admin-1',
        resolvedAt: new Date('2026-11-06T02:00:00Z'),
        createdAt: new Date('2026-11-06T01:00:00Z'),
      },
    ],
    payments: [{ transactionId: 'TXN-1', paidAt: new Date() }],
  };

  let prisma: any;
  let usersService: { revealCccd: jest.Mock };
  let pdfService: { render: jest.Mock };
  let service: ContractService;

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue(booking),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ totalPrice: booking.totalPrice }),
        update: jest.fn(),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'admin-1', name: 'Trần Minh Quân' }]),
      },
      device: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'dev-old', name: 'Lenovo ThinkPad X1', serialNumber: 'SN-OLD' },
          { id: 'dev-new', name: 'Dell XPS 15', serialNumber: 'SN-NEW' },
        ]),
      },
    };
    usersService = { revealCccd: jest.fn().mockResolvedValue('079204001234') };
    pdfService = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
    service = new ContractService(
      prisma,
      usersService as any,
      { get: jest.fn().mockReturnValue('key') } as any,
      pdfService as any,
    );
  });

  it('bản lưu DB: CCCD che, KHÔNG giải mã, không nhúng font', async () => {
    await service.saveSnapshot(booking.id);
    expect(usersService.revealCccd).not.toHaveBeenCalled();
    const html: string =
      prisma.booking.update.mock.calls[0][0].data.contractContent;
    expect(html).toContain('********1234');
    expect(html).not.toContain('079204001234');
    expect(html).not.toContain('@font-face');
  });

  it('bản in: CCCD đầy đủ, font Noto Serif nhúng, nhân viên lập = người in', async () => {
    const html = await service.renderForPrint(booking.id, 'admin-1');
    expect(html).toContain('079204001234');
    expect(html).toContain("font-family:'Noto Serif'");
    expect(html).toContain('Trần Minh Quân');
  });

  it('bản cho chủ đơn (fullCccd: false): CCCD che, không giải mã, vẫn nhúng font', async () => {
    const html = await service.renderForPrint(booking.id, undefined, {
      fullCccd: false,
    });
    expect(usersService.revealCccd).not.toHaveBeenCalled();
    expect(html).toContain('********1234');
    expect(html).not.toContain('079204001234');
    expect(html).toContain("font-family:'Noto Serif'");
  });

  it('PDF cho chủ đơn: HTML đưa vào Chromium là bản CCCD che', async () => {
    await service.renderPdf(booking.id, undefined, { fullCccd: false });
    const html: string = pdfService.render.mock.calls[0][0];
    expect(html).toContain('********1234');
    expect(html).not.toContain('079204001234');
  });

  it('nạp đúng máy cũ/máy mới cho Phụ lục đổi thiết bị', async () => {
    const data = await service.buildData(booking.id, { fullCccd: false });
    expect(data.swaps).toEqual([
      expect.objectContaining({
        oldDevice: { name: 'Lenovo ThinkPad X1', serialNumber: 'SN-OLD' },
        newDevice: { name: 'Dell XPS 15', serialNumber: 'SN-NEW' },
        reason: 'Máy tự tắt nguồn',
        staffName: 'Trần Minh Quân',
      }),
    ]);
    expect(data.device.accessories).toEqual([{ name: 'Bộ sạc', quantity: 1 }]);
    expect(data.deposit.txnRef).toBe('TXN-1');
  });

  it('PDF: dựng HTML bản in rồi giao cho Chromium', async () => {
    await expect(service.renderPdf(booking.id, 'admin-1')).resolves.toEqual(
      Buffer.from('%PDF'),
    );
    expect(pdfService.render).toHaveBeenCalledWith(
      expect.stringContaining('HỢP ĐỒNG THUÊ TÀI SẢN'),
    );
  });
});
