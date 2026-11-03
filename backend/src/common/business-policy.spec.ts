import {
  addBusinessDays,
  calculateLostDeviceDebt,
  calculateUnusedRentalRefund,
  isEquivalentValue,
  calculateDeposit,
  calculateDepositSettlement,
  depositRefundDueAt,
  calculateLateFee,
  calculateLateFeeForDays,
  calculateRefundPercentage,
  calculateRentalPrice,
  DAY_MS,
  HOUR_MS,
} from './business-policy';

describe('business-policy', () => {
  it('cọc = 50% giá gốc thiết bị', () => {
    expect(calculateDeposit(30_000_000)).toBe(15_000_000);
  });

  it('hoàn cọc theo bậc 24h/6h, lỗi cửa hàng luôn 100%', () => {
    expect(calculateRefundPercentage(30, false)).toBe(100);
    expect(calculateRefundPercentage(24, false)).toBe(100);
    expect(calculateRefundPercentage(10, false)).toBe(50);
    expect(calculateRefundPercentage(2, false)).toBe(0);
    expect(calculateRefundPercentage(2, true)).toBe(100);
  });

  it('phí trễ hạn leo thang cộng dồn, không phải phẳng', () => {
    // 400k/ngày, trễ 2 ngày: 80k + 160k = 240k (khác 2 × 80k)
    expect(calculateLateFeeForDays(2, 400_000, 50_000_000)).toBe(240_000);
    expect(calculateLateFeeForDays(3, 400_000, 50_000_000)).toBe(480_000);
  });

  it('phí trễ hạn chặn trên ở giá trị thiết bị', () => {
    expect(calculateLateFeeForDays(30, 400_000, 1_000_000)).toBe(1_000_000);
  });

  it('trễ vài giờ vẫn làm tròn lên 1 ngày, trả đúng hạn thì 0', () => {
    const end = new Date('2026-10-01T10:00:00Z');
    expect(
      calculateLateFee(
        new Date(end.getTime() + 3 * HOUR_MS),
        end,
        400_000,
        9e9,
      ),
    ).toBe(80_000);
    expect(calculateLateFee(end, end, 400_000, 9e9)).toBe(0);
  });

  it('≤ 24 giờ tính theo giờ, > 24 giờ tính theo ngày (làm tròn lên)', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    expect(
      calculateRentalPrice(
        50_000,
        300_000,
        start,
        new Date(start.getTime() + 3 * HOUR_MS),
      ),
    ).toBe(150_000);
    expect(
      calculateRentalPrice(
        50_000,
        300_000,
        start,
        new Date(start.getTime() + DAY_MS + HOUR_MS),
      ),
    ).toBe(600_000);
  });

  describe('calculateDepositSettlement (tiền hoàn = cọc − phí trễ hạn − phí hư hỏng)', () => {
    it('trả nguyên vẹn, đúng hạn → hoàn đủ cọc', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 15_000_000,
          lateFee: 0,
          damageFee: 0,
        }),
      ).toEqual({
        totalDeductions: 0,
        refundAmount: 15_000_000,
        amountOwed: 0,
      });
    });

    it('chỉ trễ hạn → trừ phí trễ hạn', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 15_000_000,
          lateFee: 240_000,
          damageFee: 0,
        }),
      ).toEqual({
        totalDeductions: 240_000,
        refundAmount: 14_760_000,
        amountOwed: 0,
      });
    });

    it('chỉ hư hỏng → trừ phí hư hỏng', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 15_000_000,
          lateFee: 0,
          damageFee: 2_000_000,
        }),
      ).toEqual({
        totalDeductions: 2_000_000,
        refundAmount: 13_000_000,
        amountOwed: 0,
      });
    });

    it('vừa trễ hạn vừa hư hỏng → trừ cả hai', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 15_000_000,
          lateFee: 240_000,
          damageFee: 2_000_000,
        }),
      ).toEqual({
        totalDeductions: 2_240_000,
        refundAmount: 12_760_000,
        amountOwed: 0,
      });
    });

    it('khấu trừ vượt tiền cọc → hoàn 0, phần thiếu thành tiền khách còn nợ', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 1_000_000,
          lateFee: 300_000,
          damageFee: 1_500_000,
        }),
      ).toEqual({
        totalDeductions: 1_800_000,
        refundAmount: 0,
        amountOwed: 800_000,
      });
    });

    it('khấu trừ đúng bằng tiền cọc → hoàn 0, không nợ', () => {
      expect(
        calculateDepositSettlement({
          depositAmount: 1_000_000,
          lateFee: 0,
          damageFee: 1_000_000,
        }),
      ).toEqual({ totalDeductions: 1_000_000, refundAmount: 0, amountOwed: 0 });
    });
  });

  describe('addBusinessDays / depositRefundDueAt (giờ Việt Nam)', () => {
    it('thứ Hai + 3 ngày làm việc → thứ Năm', () => {
      // 10:00 thứ Hai 02/11/2026 giờ VN
      const monday = new Date('2026-11-02T03:00:00Z');
      expect(addBusinessDays(monday, 3).toISOString()).toBe(
        '2026-11-05T03:00:00.000Z',
      );
    });

    it('thứ Sáu + 3 ngày làm việc → bỏ qua T7, CN → thứ Tư tuần sau', () => {
      const friday = new Date('2026-11-06T03:00:00Z');
      expect(depositRefundDueAt(friday).toISOString()).toBe(
        '2026-11-11T03:00:00.000Z',
      );
    });

    it('xác định cuối tuần theo giờ VN, không theo UTC', () => {
      // 23:30 thứ Sáu UTC = 06:30 thứ Bảy giờ VN → T2, T3, T4 → 06:30 thứ Tư giờ VN
      const saturdayVn = new Date('2026-11-06T23:30:00Z');
      expect(addBusinessDays(saturdayVn, 3).toISOString()).toBe(
        '2026-11-10T23:30:00.000Z',
      );
    });
  });

  it('quyết toán cọc trừ thêm chi phí sửa đã ghi khi báo lỗi (lỗi do khách)', () => {
    expect(
      calculateDepositSettlement({
        depositAmount: 10_000_000,
        lateFee: 0,
        damageFee: 0,
        repairFee: 1_500_000,
      }),
    ).toEqual({
      totalDeductions: 1_500_000,
      refundAmount: 8_500_000,
      amountOwed: 0,
    });
  });

  describe('calculateUnusedRentalRefund (kết thúc sớm)', () => {
    const startTime = new Date('2026-11-01T00:00:00Z');
    const endTime = new Date('2026-11-05T00:00:00Z'); // 4 ngày

    it('dùng 1/4 thời gian → hoàn 3/4 tiền thuê, làm tròn xuống nghìn', () => {
      expect(
        calculateUnusedRentalRefund({
          totalPrice: 1_000_500,
          startTime,
          endTime,
          endedAt: new Date('2026-11-02T00:00:00Z'),
        }),
      ).toBe(750_000);
    });

    it('báo lỗi trước giờ bắt đầu → hoàn toàn bộ; sau hạn trả → hoàn 0', () => {
      expect(
        calculateUnusedRentalRefund({
          totalPrice: 800_000,
          startTime,
          endTime,
          endedAt: new Date('2026-10-31T00:00:00Z'),
        }),
      ).toBe(800_000);
      expect(
        calculateUnusedRentalRefund({
          totalPrice: 800_000,
          startTime,
          endTime,
          endedAt: new Date('2026-11-06T00:00:00Z'),
        }),
      ).toBe(0);
    });
  });

  describe('calculateLostDeviceDebt (mất thiết bị)', () => {
    it('nợ = giá trị máy − cọc + phí trễ hạn', () => {
      expect(
        calculateLostDeviceDebt({
          originalPrice: 20_000_000,
          depositAmount: 10_000_000,
          lateFee: 1_000_000,
        }),
      ).toEqual({ lateFee: 1_000_000, amountOwed: 11_000_000 });
    });

    it('tổng đòi (cọc + nợ) không vượt 150% giá trị máy', () => {
      expect(
        calculateLostDeviceDebt({
          originalPrice: 20_000_000,
          depositAmount: 10_000_000,
          lateFee: 20_000_000,
        }),
      ).toEqual({ lateFee: 10_000_000, amountOwed: 20_000_000 });
    });
  });

  it('máy thay thế tương đương: lệch giá trị tối đa ±20%', () => {
    expect(isEquivalentValue(20_000_000, 24_000_000)).toBe(true);
    expect(isEquivalentValue(20_000_000, 16_000_000)).toBe(true);
    expect(isEquivalentValue(20_000_000, 24_000_001)).toBe(false);
  });
});
