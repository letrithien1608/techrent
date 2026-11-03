import { moneyInWords, numberToVietnameseWords } from './vietnamese-number';

describe('numberToVietnameseWords / moneyInWords (số tiền bằng chữ)', () => {
  it.each([
    [0, 'không'],
    [5, 'năm'],
    [10, 'mười'],
    [15, 'mười lăm'],
    [21, 'hai mươi mốt'],
    [25, 'hai mươi lăm'],
    [105, 'một trăm linh năm'],
    [110, 'một trăm mười'],
    [1_005, 'một nghìn không trăm linh năm'],
    [80_000, 'tám mươi nghìn'],
    [450_000, 'bốn trăm năm mươi nghìn'],
    [1_320_000, 'một triệu ba trăm hai mươi nghìn'],
    [29_000_000, 'hai mươi chín triệu'],
    [58_000_000, 'năm mươi tám triệu'],
    [1_000_050, 'một triệu không trăm năm mươi'],
    [2_000_000_000, 'hai tỷ'],
    [1_250_500_000, 'một tỷ hai trăm năm mươi triệu năm trăm nghìn'],
  ])('%d → "%s"', (value, words) => {
    expect(numberToVietnameseWords(value)).toBe(words);
  });

  it('viết hoa chữ đầu và kèm "đồng"', () => {
    expect(moneyInWords(1_320_000)).toBe(
      'Một triệu ba trăm hai mươi nghìn đồng',
    );
    expect(moneyInWords(0)).toBe('Không đồng');
  });
});
