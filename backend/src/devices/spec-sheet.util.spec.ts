import {
  buildSpecSheet,
  flattenSpecSheet,
  OTHER_SPEC_GROUP,
  parseSpecSheet,
} from './spec-sheet.util';

describe('spec-sheet.util', () => {
  const template = [
    { group: 'Hiệu năng', fields: ['CPU', 'RAM'] },
    { group: 'Màn hình', fields: ['Kích thước', 'Tần số quét'] },
  ];

  it('xếp thông số theo đúng thứ tự mẫu, không phụ thuộc thứ tự nhập', () => {
    const sheet = buildSpecSheet(template, {
      'Tần số quét': '120Hz',
      CPU: 'Apple M3 Pro',
      RAM: '18GB',
    });
    expect(sheet).toEqual([
      { group: 'Hiệu năng', label: 'CPU', value: 'Apple M3 Pro' },
      { group: 'Hiệu năng', label: 'RAM', value: '18GB' },
      { group: 'Màn hình', label: 'Tần số quét', value: '120Hz' },
    ]);
  });

  it('bỏ qua ô trống thay vì lưu giá trị rỗng', () => {
    const sheet = buildSpecSheet(template, { CPU: '  ', RAM: '16GB' });
    expect(sheet.map((entry) => entry.label)).toEqual(['RAM']);
  });

  it('thông số ngoài mẫu đưa vào nhóm "Thông số khác", không bị mất', () => {
    const sheet = buildSpecSheet(template, { CPU: 'i7', 'Bút cảm ứng': 'Có' });
    expect(sheet.at(-1)).toEqual({
      group: OTHER_SPEC_GROUP,
      label: 'Bút cảm ứng',
      value: 'Có',
    });
  });

  it('danh mục chưa có mẫu → toàn bộ vào nhóm "Thông số khác"', () => {
    expect(buildSpecSheet(null, { CPU: 'i7' })).toEqual([
      { group: OTHER_SPEC_GROUP, label: 'CPU', value: 'i7' },
    ]);
  });

  it('flattenSpecSheet trả về map label → giá trị', () => {
    expect(
      flattenSpecSheet([{ group: 'A', label: 'CPU', value: 'i7' }]),
    ).toEqual({ CPU: 'i7' });
  });

  it('parseSpecSheet loại bỏ dữ liệu sai dạng', () => {
    expect(parseSpecSheet(null)).toEqual([]);
    expect(parseSpecSheet({ cpu: 'i7' })).toEqual([]);
    expect(
      parseSpecSheet([
        { group: 'A', label: 'CPU', value: 'i7' },
        { group: 'A', label: 'RAM', value: 16 },
      ]),
    ).toEqual([{ group: 'A', label: 'CPU', value: 'i7' }]);
  });
});
