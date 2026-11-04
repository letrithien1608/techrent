import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import {
  calculateDeposit,
  calculateLateFeeForDays,
  DEPOSIT_RATIO,
  formatPercent,
  REFUND_TIERS,
} from '../common/business-policy';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPolicyValues,
  fillPlaceholders,
  formatDevice,
  formatVnd,
  KnowledgeService,
  KNOWLEDGE_TOKEN_BUDGET,
  splitIntoChunks,
} from './knowledge.service';
import { estimateTokens } from './text-utils';

const DEVICE_ROWS = [
  {
    name: 'MacBook Pro 14" M3 Pro',
    status: 'available',
    pricePerHour: 60000,
    pricePerDay: 400000,
    originalPrice: 52000000,
    category: { name: 'Laptop' },
    specs: {
      cpu: 'Apple M3 Pro',
      ram: '18GB',
      storage: '512GB SSD',
      screen: '14.2"',
      battery: '70Wh',
    },
  },
  {
    name: 'DJI Mini 4 Pro',
    status: 'rented',
    specs: { legacy: 'không dùng khi đã có bảng thông số' },
    specSheet: [
      { group: 'Camera', label: 'Cảm biến', value: '1/1.3 inch CMOS 48MP' },
      { group: 'Camera', label: 'Video', value: '4K 100fps' },
      { group: 'Bay', label: 'Thời gian bay', value: '34 phút' },
    ],
    pricePerHour: 50000,
    pricePerDay: 350000,
    originalPrice: 20000000,
    category: { name: 'Flycam' },
  },
  {
    name: 'Shure SM7B',
    status: 'available',
    pricePerHour: 20000,
    pricePerDay: 120000,
    originalPrice: 10000000,
    category: { name: 'Thiết bị thu âm' },
  },
];

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let prisma: { device: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { device: { findMany: jest.fn().mockResolvedValue(DEVICE_ROWS) } };
    const config = { get: jest.fn().mockReturnValue('5') };
    service = new KnowledgeService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    service.load(join(__dirname, 'knowledge'));
  });

  const titlesFor = (query: string) =>
    service.retrieve(query).chunks.map((chunk) => chunk.title);

  describe('nạp kho kiến thức', () => {
    it('điền hết placeholder bằng số liệu từ business-policy.ts', () => {
      const { core } = service.retrieve('cọc');
      expect(core.text).not.toContain('{{');
      expect(core.text).toContain(formatPercent(DEPOSIT_RATIO));
      expect(core.text).toContain(`${REFUND_TIERS[0].minHoursBeforeStart} giờ`);
      expect(core.text).toContain('5 phút');
    });

    it('buildPolicyValues tính ví dụ bằng chính hàm nghiệp vụ, không chép tay', () => {
      const values = buildPolicyValues(5);
      expect(values.DEPOSIT_RATE).toBe(formatPercent(DEPOSIT_RATIO));
      expect(values.DEPOSIT_EXAMPLE_AMOUNT).toBe(
        formatVnd(calculateDeposit(30_000_000)),
      );
      expect(values.LATE_FEE_EXAMPLE_2DAYS).toBe(
        formatVnd(calculateLateFeeForDays(2, 400_000, Number.MAX_VALUE)),
      );
      expect(values.LATE_FEE_EXAMPLE_2DAYS).toBe('240.000đ');
    });

    it('fillPlaceholders báo lỗi nếu có placeholder chưa định nghĩa', () => {
      expect(() => fillPlaceholders('{{KHONG_TON_TAI}}', {})).toThrow(
        'KHONG_TON_TAI',
      );
    });

    it('cắt markdown theo tiêu đề ##, gắn tiêu đề tài liệu vào từng đoạn', () => {
      const chunks = splitIntoChunks(
        'demo.md',
        '# Tài liệu\nmở đầu\n## Phần A\nnội dung A\n## Phần B\nnội dung B',
      );
      expect(chunks).toHaveLength(2);
      expect(chunks[0].title).toBe('Tài liệu — Phần A');
      expect(chunks[1].text).toBe('nội dung B');
    });

    it('nạp đủ 15 danh mục thiết bị', () => {
      expect(service.chunkCount).toBeGreaterThanOrEqual(15 * 4);
    });
  });

  describe('chọn đoạn liên quan', () => {
    it('câu hỏi về cọc → đoạn tiền đặt cọc / hoàn cọc', () => {
      const titles = titlesFor('Tiền đặt cọc được hoàn lại thế nào?');
      expect(titles.join('|')).toMatch(/cọc/i);
      expect(
        titles.some(
          (t) =>
            t.includes('Huỷ đơn và hoàn cọc') || t.includes('Tiền đặt cọc'),
        ),
      ).toBe(true);
    });

    it('câu hỏi trả máy muộn (không dùng chữ "trễ") vẫn ra đoạn phí trễ hạn nhờ đồng nghĩa', () => {
      expect(titlesFor('Nếu mình trả máy muộn thì bị phạt sao?')[0]).toMatch(
        /trễ/,
      );
    });

    it('câu hỏi máy lỗi khi đang thuê → đoạn xử lý sự cố', () => {
      const titles = titlesFor(
        'Máy không lên nguồn khi đang thuê thì làm sao?',
      );
      expect(
        titles.some((t) => t.includes('Xử lý khi thiết bị gặp sự cố')),
      ).toBe(true);
    });

    it('câu hỏi về flycam → đoạn của danh mục Flycam', () => {
      expect(titlesFor('Flycam báo lỗi la bàn')[0]).toContain('Flycam');
    });

    it('luôn kèm đoạn tóm tắt cốt lõi và không vượt ngân sách token', () => {
      const { core, chunks } = service.retrieve(
        'cọc trễ hạn huỷ đơn hợp đồng lỗi',
      );
      expect(core.title).toContain('Tóm tắt chính sách cốt lõi');
      expect(chunks.length).toBeLessThanOrEqual(5);
      const tokens = [core, ...chunks].reduce(
        (sum, c) => sum + estimateTokens(`### ${c.title}\n${c.text}`),
        0,
      );
      expect(tokens).toBeLessThanOrEqual(KNOWLEDGE_TOKEN_BUDGET);
    });
  });

  describe('gợi ý thiết bị từ DB', () => {
    it('nhu cầu "đồ họa" → laptop, kèm tiền cọc tính bằng business-policy', async () => {
      const devices = await service.findDevices('Gợi ý máy để làm đồ họa');
      expect(devices?.[0].name).toContain('MacBook');
      expect(devices?.[0].deposit).toBe(calculateDeposit(52_000_000));
    });

    it('chỉ truy vấn trường công khai của thiết bị', async () => {
      await service.findDevices('thuê flycam');
      const select = prisma.device.findMany.mock.calls[0][0].select;
      expect(Object.keys(select).sort()).toEqual(
        [
          'avgRating',
          'category',
          'name',
          'originalPrice',
          'pricePerDay',
          'pricePerHour',
          'reviewCount',
          'specs',
          'specSheet',
          'status',
        ].sort(),
      );
    });

    it('hỏi giá thiết bị không có trong hệ thống → mảng rỗng (không bịa)', async () => {
      await expect(
        service.findDevices('Giá thuê iPhone 15 bao nhiêu?'),
      ).resolves.toEqual([]);
    });

    it('câu hỏi không liên quan thiết bị → null', async () => {
      await expect(
        service.findDevices('Hợp đồng gồm những điều khoản nào?'),
      ).resolves.toBeNull();
    });

    it('findDeviceByName: chỉ trả 1 máy khi nhắc tên rõ ràng, chỉ nhắc danh mục thì null', async () => {
      await expect(
        service.findDeviceByName('Thuê DJI Mini 4 Pro trả trễ 2 ngày'),
      ).resolves.toMatchObject({ name: 'DJI Mini 4 Pro', pricePerDay: 350000 });
      await expect(
        service.findDeviceByName('Thuê flycam trả trễ 2 ngày'),
      ).resolves.toBeNull();
      await expect(
        service.findDeviceByName('Thuê máy Pro trả trễ 2 ngày'),
      ).resolves.toBeNull();
    });

    it('formatDevice ghi rõ giá, cọc và tình trạng', async () => {
      const [device] = (await service.findDevices('flycam DJI Mini 4 Pro'))!;
      const line = formatDevice(device);
      expect(line).toContain('Giá thuê: 350.000đ/ngày; 50.000đ/giờ');
      expect(line).toContain('Tiền cọc: 10.000.000đ');
      expect(line).toContain('đang có khách thuê');
    });

    it('formatDevice kèm tối đa 4 thông số công khai', async () => {
      const [device] = (await service.findDevices('MacBook Pro'))!;
      expect(formatDevice(device)).toContain(
        'Thông số: cpu: Apple M3 Pro, ram: 18GB, storage: 512GB SSD, screen: 14.2"',
      );
      expect(formatDevice(device)).not.toContain('battery');
    });

    it('formatDevice ưu tiên bảng thông số có cấu trúc (specSheet) hơn specs cũ', async () => {
      const [device] = (await service.findDevices('flycam DJI Mini 4 Pro'))!;
      const text = formatDevice(device);
      expect(text).toContain(
        'Thông số: Cảm biến: 1/1.3 inch CMOS 48MP; Video: 4K 100fps; Thời gian bay: 34 phút',
      );
      expect(text).not.toContain('legacy');
    });
  });
});
