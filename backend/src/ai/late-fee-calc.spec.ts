import { calculateLateFeeForDays } from '../common/business-policy';
import {
  calculateLateFeeTable,
  checkLateFeeAnswer,
  extractLateFeeQuery,
  formatLateFeeReference,
  lateFeeTemplateReply,
  moneyMatches,
} from './late-fee-calc';

describe('extractLateFeeQuery', () => {
  it.each([
    [
      'giá thuê 400.000đ/ngày, trả trễ 2 ngày thì bị phạt bao nhiêu?',
      2,
      400_000,
    ],
    ['Thuê máy 400k/ngày mà trễ 3 ngày thì sao', 3, 400_000],
    ['trả trễ hai ngày, giá 400 nghìn một ngày', 2, 400_000],
    ['máy 250k mỗi ngày, quá hạn 1 hôm thì mất bao nhiêu', 1, 250_000],
    ['trễ 2 hôm với giá thuê 400000 thì phạt sao', 2, 400_000],
    ['giá thuê 1,5 triệu/ngày trả muộn ba ngày', 3, 1_500_000],
    ['GIÁ THUÊ 400.000 Đ / NGÀY, TRỄ 2 NGÀY', 2, 400_000],
  ])('"%s" → %d ngày, %d đ/ngày', (message, days, price) => {
    expect(extractLateFeeQuery(message)).toMatchObject({
      days,
      pricePerDay: price,
    });
  });

  it('thuê N ngày + trễ M ngày → lấy đúng số ngày TRỄ', () => {
    expect(
      extractLateFeeQuery('Mình thuê 5 ngày giá 400k/ngày, trả trễ 2 ngày'),
    ).toMatchObject({ days: 2, pricePerDay: 400_000 });
  });

  it('"400 nghìn một ngày, trả muộn ba ngày" → 3 ngày (câu F3 từng trích sai)', () => {
    expect(
      extractLateFeeQuery(
        'Mình thuê thiết bị giá 400 nghìn một ngày, trả muộn ba ngày thì tổng phí trễ hạn là bao nhiêu?',
      ),
    ).toMatchObject({ days: 3, pricePerDay: 400_000 });
    expect(
      extractLateFeeQuery('400k 1 ngày, trễ 2 ngày phạt bao nhiêu'),
    ).toMatchObject({ days: 2, pricePerDay: 400_000 });
  });

  it('câu hỏi pha trộn (cọc, bồi thường, hoàn tiền) → mixed, chỉ hỏi phí trễ → không mixed', () => {
    expect(
      extractLateFeeQuery(
        'Mình cọc 15.000.000đ, trả máy trễ 1 ngày (giá thuê 400.000đ/ngày) và làm trầy máy bị tính bồi thường 1.000.000đ thì được hoàn lại bao nhiêu tiền cọc?',
      ),
    ).toMatchObject({ days: 1, pricePerDay: 400_000, mixed: true });
    expect(
      extractLateFeeQuery(
        'Giá thuê 400.000đ/ngày, trả trễ 2 ngày thì tổng phạt bao nhiêu?',
      )?.mixed,
    ).toBe(false);
  });

  it('"400k/1 ngày" không bị hiểu là trễ 1 ngày', () => {
    expect(
      extractLateFeeQuery('giá 400k/1 ngày, trễ 3 ngày phạt bao nhiêu'),
    ).toMatchObject({ days: 3, pricePerDay: 400_000 });
  });

  it('không nêu giá → pricePerDay null (lấy từ tên thiết bị nếu có)', () => {
    expect(
      extractLateFeeQuery('Thuê Sony A7 IV trả trễ 2 ngày thì phạt bao nhiêu?'),
    ).toEqual({
      days: 2,
      pricePerDay: null,
      originalPrice: null,
      mixed: false,
    });
  });

  it('nêu cả giá trị máy → tách đúng giá thuê và giá trị', () => {
    expect(
      extractLateFeeQuery(
        'máy giá trị 2 triệu, giá thuê 400k/ngày, trễ 10 ngày phạt bao nhiêu',
      ),
    ).toEqual({
      days: 10,
      pricePerDay: 400_000,
      originalPrice: 2_000_000,
      mixed: false,
    });
  });

  it('không chắc chắn → null hoặc không có giá', () => {
    // Không nói trễ hạn ("muốn" không phải "muộn").
    expect(extractLateFeeQuery('Mình muốn thuê 2 ngày giá 400k')).toBeNull();
    // Không có số ngày.
    expect(extractLateFeeQuery('Trả trễ thì bị phạt thế nào?')).toBeNull();
    // 2 số ngày trễ mâu thuẫn.
    expect(
      extractLateFeeQuery(
        'trễ 2 ngày hoặc trễ 3 ngày thì phạt bao nhiêu, 400k/ngày',
      ),
    ).toBeNull();
    // 2 mức giá khác nhau → không đoán giá.
    expect(
      extractLateFeeQuery('máy 300k hay 400k, trả trễ 2 ngày')?.pricePerDay,
    ).toBeNull();
    // Số ngày vô lý.
    expect(extractLateFeeQuery('trễ 500 ngày 400k/ngày')).toBeNull();
  });
});

describe('moneyMatches', () => {
  it.each([
    ['400.000đ', 400_000],
    ['400,000', 400_000],
    ['400000', 400_000],
    ['400k', 400_000],
    ['400 nghin', 400_000],
    ['1,5 trieu', 1_500_000],
    ['1.5tr', 1_500_000],
    ['80.000 d', 80_000],
  ])('%s → %d', (text, value) => {
    expect(moneyMatches(text).map((m) => m.value)).toEqual([value]);
  });

  it('số nhỏ không đơn vị (số ngày, %) không phải tiền', () => {
    expect(moneyMatches('tre 2 ngay phat 40%')).toEqual([]);
  });
});

describe('calculateLateFeeTable', () => {
  it('leo thang đúng hàm nghiệp vụ: 400k × 2 ngày = 80k + 160k = 240k', () => {
    const calc = calculateLateFeeTable({ days: 2, pricePerDay: 400_000 });
    expect(calc.perDay.map((d) => d.fee)).toEqual([80_000, 160_000]);
    expect(calc.total).toBe(240_000);
    expect(calc.total).toBe(calculateLateFeeForDays(2, 400_000, Infinity));
    expect(calc.capped).toBe(false);
  });

  it.each([
    [1, 250_000, 50_000],
    [3, 250_000, 300_000],
    [3, 400_000, 480_000],
  ])('%d ngày × %d → %d', (days, price, total) => {
    expect(calculateLateFeeTable({ days, pricePerDay: price }).total).toBe(
      total,
    );
  });

  it('chặn trần bằng giá trị thiết bị', () => {
    const calc = calculateLateFeeTable({
      days: 10,
      pricePerDay: 400_000,
      originalPrice: 2_000_000,
    });
    expect(calc.uncappedTotal).toBe(4_400_000);
    expect(calc.total).toBe(2_000_000);
    expect(calc.capped).toBe(true);
  });

  it('bảng tham khảo + câu dựng sẵn có từng ngày và đúng tổng', () => {
    const calc = calculateLateFeeTable({ days: 2, pricePerDay: 400_000 });
    const reference = formatLateFeeReference(calc);
    expect(reference).toContain('KẾT QUẢ TÍNH SẴN');
    expect(reference).toContain('Ngày trễ 1: 80.000đ (20% giá thuê/ngày)');
    expect(reference).toContain('Ngày trễ 2: 160.000đ (40% giá thuê/ngày)');
    expect(reference).toContain('TỔNG PHÍ TRỄ 2 NGÀY: 240.000đ (bằng 60%');
    const reply = lateFeeTemplateReply(calc);
    expect(reply).toContain('**Tổng phí trễ hạn: 240.000đ**');
    expect(checkLateFeeAnswer(reply, calc)).toBeNull();
  });

  it('câu dựng sẵn khi chạm trần vẫn qua được kiểm tra', () => {
    const calc = calculateLateFeeTable({
      days: 10,
      pricePerDay: 400_000,
      originalPrice: 2_000_000,
      deviceName: 'Máy A',
    });
    expect(formatLateFeeReference(calc)).toContain(
      'TỔNG PHÍ TRỄ 10 NGÀY: 2.000.000đ',
    );
    expect(checkLateFeeAnswer(lateFeeTemplateReply(calc), calc)).toBeNull();
  });
});

describe('checkLateFeeAnswer', () => {
  const calc = calculateLateFeeTable({ days: 2, pricePerDay: 400_000 });

  it('đúng tổng → hợp lệ (nhiều cách viết số)', () => {
    expect(
      checkLateFeeAnswer(
        'Ngày 1 phạt 80.000đ, ngày 2 phạt 160.000đ. Tổng phí trễ hạn là 240.000đ.',
        calc,
      ),
    ).toBeNull();
    expect(
      checkLateFeeAnswer('Tổng cộng bạn bị phạt 240k nhé.', calc),
    ).toBeNull();
  });

  it('sai tổng (lỗi thật đã gặp) → wrong-total', () => {
    expect(checkLateFeeAnswer('Trễ 2 ngày tổng phạt 160.000đ.', calc)).toBe(
      'wrong-total',
    );
    expect(checkLateFeeAnswer('2 ngày phạt tổng 40%.', calc)).toBe(
      'wrong-total',
    );
    // Có số đúng ở chỗ khác nhưng dòng tổng vẫn sai.
    expect(checkLateFeeAnswer('Ngày 2: 240.000đ. Tổng: 320.000đ.', calc)).toBe(
      'wrong-total',
    );
  });

  it('"tổng" của khoản khác (khấu trừ, tiền hoàn) không bị coi là tổng phí trễ', () => {
    expect(
      checkLateFeeAnswer(
        'Phí trễ hạn 240.000đ. Tổng khấu trừ 1.240.000đ, bạn được hoàn 13.760.000đ.',
        calc,
      ),
    ).toBeNull();
  });

  it('không có số tổng ở đâu → missing-total', () => {
    expect(
      checkLateFeeAnswer('Ngày 1 phạt 80.000đ, ngày 2 phạt 160.000đ.', calc),
    ).toBe('missing-total');
  });
});
