import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, DeviceStatus } from '../src/generated/prisma/client';
import { UploadService } from '../src/upload/upload.service';
import {
  buildSpecSheet,
  flattenSpecSheet,
  type SpecTemplateGroup,
} from '../src/devices/spec-sheet.util';
import { readFileSync } from 'fs';
import { join } from 'path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// UploadService chỉ cần một object có .get(key) giống ConfigService — không cần bootstrap
// toàn bộ Nest app chỉ để chạy script seed.
const uploadService = new UploadService({
  get: (key: string) => process.env[key],
} as any);

function readSeedData<T>(file: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'seed-data', file), 'utf-8')) as T;
}

// Mẫu thông số theo danh mục + thông số THẬT từng thiết bị (tra từ trang hãng/
// trang review, đối chiếu ≥2 nguồn — danh sách nguồn ở docs/device-sources.md).
// Thông số không chắc chắn được để trống, KHÔNG điền đoán.
const SPEC_TEMPLATES = readSeedData<Record<string, SpecTemplateGroup[] | string>>(
  'spec-templates.json',
);
const DEVICE_SPECS = readSeedData<
  Record<string, { previousNames?: string[]; sources: string[]; specs: Record<string, string> }>
>('device-specs.json');

function templateFor(categoryName: string): SpecTemplateGroup[] | null {
  const template = SPEC_TEMPLATES[categoryName];
  return Array.isArray(template) ? template : null;
}

interface CategorySeed {
  name: string;
  description: string;
  devices: DeviceSeed[];
}

interface DeviceSeed {
  name: string;
  pricePerHour: number;
  pricePerDay: number;
  /** Giá gốc/giá trị tài sản (VNĐ) — ước tính giá bán lẻ thật, dùng tính cọc 50%. */
  originalPrice: number;
  /** Mô tả dài: tình trạng máy, phụ kiện kèm theo, năm sản xuất, bảo hành còn lại. */
  detailedDescription: string;
  status?: DeviceStatus;
  /**
   * Ảnh thật (Unsplash/Pexels, link CDN trực tiếp) khớp đúng model/loại thiết
   * bị — xem CLAUDE.md mục "Đã hoàn thành" buổi mở rộng seed data để biết
   * cách đã chọn ảnh (ưu tiên đúng model, fallback đúng loại nếu không có
   * ảnh model cụ thể). Tuỳ chọn: thiết bị mới chưa có thì để trống, ảnh bổ
   * sung bằng backend/scripts/device-images/.
   */
  imageUrl?: string;
}

/** Format câu mô tả chi tiết đồng nhất cho mọi thiết bị — tránh lặp cấu trúc văn bản tay 45 lần. */
function desc(opts: {
  condition: string;
  accessories: string;
  year: number;
  warrantyMonths: number;
}): string {
  return `${opts.condition}. Kèm theo ${opts.accessories}. Sản xuất năm ${opts.year}, còn bảo hành ${opts.warrantyMonths} tháng từ TechRent.`;
}

// 8 danh mục GỐC (Tuần 5) — GIỮ NGUYÊN tên/thứ tự thiết bị, KHÔNG xoá/đổi gì
// để không phá dữ liệu booking/review đang gắn với các thiết bị này. CHỈ đổi
// `imageUrl` từ picsum.photos (ngẫu nhiên) sang ảnh thật khớp đúng tên/loại.
const CATEGORIES: CategorySeed[] = [
  {
    name: 'Laptop',
    description: 'Laptop văn phòng, gaming, đồ hoạ',
    devices: [
      {
        name: 'MacBook Pro 14" M3 Pro 18GB/512GB',
        pricePerHour: 60000,
        pricePerDay: 400000,
        originalPrice: 52000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 95%, không trầy xước đáng kể, pin còn 92% dung lượng gốc',
          accessories: 'sạc gốc 96W, hộp đựng, khăn lau màn hình',
          year: 2024,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Dell XPS 15 9530 i7-13700H/RTX 4070 OLED',
        pricePerHour: 55000,
        pricePerDay: 380000,
        originalPrice: 45000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, có vài vết xước nhỏ ở viền dưới, hoạt động ổn định',
          accessories: 'sạc gốc 130W, túi chống sốc',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'ASUS ROG Zephyrus G14 (2024) R9 8945HS/RTX 4070',
        pricePerHour: 65000,
        pricePerDay: 420000,
        originalPrice: 42000000,
        detailedDescription: desc({
          condition: 'Máy mới 97%, đã test hiệu năng gaming/render ổn định, tản nhiệt tốt',
          accessories: 'sạc gốc 240W, túi đựng chuyên dụng',
          year: 2024,
          warrantyMonths: 9,
        }),
        status: DeviceStatus.rented,
        imageUrl: 'https://images.unsplash.com/photo-1698512475067-74ed7c956c8d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Lenovo ThinkPad X1 Carbon Gen 12 Ultra 7/16GB/512GB',
        pricePerHour: 45000,
        pricePerDay: 300000,
        originalPrice: 38000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 93%, bàn phím gõ êm, bản lề chắc chắn',
          accessories: 'sạc gốc USB-C 65W',
          year: 2024,
          warrantyMonths: 8,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1770932327451-63bb8530f607?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy ảnh',
    description: 'Máy ảnh mirrorless, DSLR cho quay chụp chuyên nghiệp',
    devices: [
      {
        name: 'Sony Alpha A7 IV (body)',
        pricePerHour: 70000,
        pricePerDay: 450000,
        originalPrice: 58000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 94%, shutter count thấp (~8.000 lần chụp), cảm biến sạch',
          accessories: '1 pin gốc + 1 pin phụ, sạc, dây đeo, thẻ nhớ 64GB',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Canon EOS R6 Mark II (body)',
        pricePerHour: 68000,
        pricePerDay: 440000,
        originalPrice: 62000000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, màn hình/kính ngắm không trầy, chống rung IBIS hoạt động tốt',
          accessories: 'pin gốc, sạc, dây đeo, thẻ nhớ 128GB',
          year: 2024,
          warrantyMonths: 9,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Fujifilm X-T5 (body)',
        pricePerHour: 50000,
        pricePerDay: 330000,
        originalPrice: 42000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, đang gửi bảo trì định kỳ, dự kiến hoạt động lại sau vài ngày',
          accessories: 'pin gốc, sạc, dây đeo',
          year: 2023,
          warrantyMonths: 6,
        }),
        status: DeviceStatus.maintenance,
        imageUrl: 'https://images.unsplash.com/photo-1536632087471-3cf3f2986328?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Flycam',
    description: 'Drone quay phim, chụp ảnh trên không',
    devices: [
      {
        name: 'DJI Mavic 3 Pro',
        pricePerHour: 80000,
        pricePerDay: 500000,
        originalPrice: 48000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 95%, cánh quạt/gimbal còn mới, đã bay thử ổn định',
          accessories: '3 pin gốc, sạc đa năng, túi đựng, bộ cánh dự phòng',
          year: 2024,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1473186639016-1451879a06f0?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Mini 4 Pro',
        pricePerHour: 45000,
        pricePerDay: 280000,
        originalPrice: 18000000,
        detailedDescription: desc({
          condition: 'Máy mới 97%, nhẹ nhàng, phù hợp người mới bay',
          accessories: '2 pin gốc, sạc, tay cầm điều khiển, túi đựng',
          year: 2024,
          warrantyMonths: 8,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1487304655522-c039cc299c9d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Air 3',
        pricePerHour: 55000,
        pricePerDay: 350000,
        originalPrice: 28000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 92%, camera kép hoạt động tốt, cảm biến tránh vật cản đầy đủ',
          accessories: '2 pin gốc, sạc, tay cầm điều khiển',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1631052941794-2a6e26d4ac17?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy chiếu',
    description: 'Máy chiếu cho hội nghị, sự kiện, xem phim',
    devices: [
      {
        name: 'Epson EB-X06',
        pricePerHour: 25000,
        pricePerDay: 150000,
        originalPrice: 9000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 88%, bóng đèn còn khoảng 70% tuổi thọ, hình ảnh rõ nét',
          accessories: 'dây nguồn, dây HDMI, remote, túi đựng',
          year: 2022,
          warrantyMonths: 4,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'BenQ TK850',
        pricePerHour: 40000,
        pricePerDay: 250000,
        originalPrice: 22000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 92%, hình ảnh 4K sắc nét, phù hợp phòng chiếu tối',
          accessories: 'dây nguồn, dây HDMI, remote',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Xiaomi Mi Smart Projector 2',
        pricePerHour: 20000,
        pricePerDay: 120000,
        originalPrice: 7500000,
        detailedDescription: desc({
          condition: 'Máy mới 94%, gọn nhẹ, phù hợp xem phim/trình chiếu gia đình',
          accessories: 'dây nguồn, remote, giá đỡ mini',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1589113050289-1c654e7e305d?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Thiết bị âm thanh',
    description: 'Loa di động, loa sự kiện',
    devices: [
      {
        name: 'JBL PartyBox 310',
        pricePerHour: 30000,
        pricePerDay: 180000,
        originalPrice: 11000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, loa/bass còn nguyên, đèn LED hoạt động đầy đủ',
          accessories: 'dây nguồn, micro không dây đi kèm',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1589256469067-ea99122bbdc4?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Bose SoundLink Max',
        pricePerHour: 28000,
        pricePerDay: 170000,
        originalPrice: 9500000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, chống nước tốt, pin trâu, phù hợp đi biển/cắm trại',
          accessories: 'dây nguồn, dây đeo vai',
          year: 2023,
          warrantyMonths: 7,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1594501432907-91214bfdd928?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Marshall Stanmore III',
        pricePerHour: 22000,
        pricePerDay: 140000,
        originalPrice: 13000000,
        detailedDescription: desc({
          condition: 'Thiết bị đang hỏng, chờ sửa — loa bị rè ở âm lượng lớn, đã báo kỹ thuật xử lý',
          accessories: 'dây nguồn',
          year: 2021,
          warrantyMonths: 0,
        }),
        status: DeviceStatus.broken,
        imageUrl: 'https://images.unsplash.com/photo-1699567364860-cf5e05224338?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy chơi game',
    description: 'Console chơi game tại nhà, sự kiện',
    devices: [
      {
        name: 'PlayStation 5 Slim (bản có ổ đĩa) 1TB',
        pricePerHour: 35000,
        pricePerDay: 220000,
        originalPrice: 13500000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, quạt tản nhiệt hoạt động êm, đĩa đọc tốt',
          accessories: '1 tay cầm DualSense, dây nguồn, dây HDMI 2.1',
          year: 2024,
          warrantyMonths: 8,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Xbox Series X 1TB',
        pricePerHour: 33000,
        pricePerDay: 210000,
        originalPrice: 13000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 93%, hoạt động ổn định, không lỗi vặt',
          accessories: '1 tay cầm Xbox, dây nguồn, dây HDMI',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Nintendo Switch OLED 64GB',
        pricePerHour: 20000,
        pricePerDay: 130000,
        originalPrice: 8500000,
        detailedDescription: desc({
          condition: 'Máy đẹp 91%, màn hình OLED không điểm chết, joy-con không lỗi trôi',
          accessories: 'dock TV, 2 joy-con, dây sạc, dây HDMI',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1612036781124-847f8939b154?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Thiết bị mạng',
    description: 'Router, thiết bị mạng cho sự kiện, văn phòng tạm',
    devices: [
      {
        name: 'Ubiquiti UniFi Dream Machine Pro (UDM-Pro)',
        pricePerHour: 30000,
        pricePerDay: 190000,
        originalPrice: 15000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, đã cấu hình sẵn cơ bản, hoạt động ổn định 24/7',
          accessories: 'dây nguồn, cáp mạng Cat6',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'TP-Link Archer AX90 (AX6600)',
        pricePerHour: 18000,
        pricePerDay: 110000,
        originalPrice: 5500000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, tốc độ WiFi 6 ổn định, phù hợp văn phòng tạm/sự kiện',
          accessories: 'dây nguồn, cáp mạng',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1645725677294-ed0843b97d5c?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Cisco Meraki MX67',
        pricePerHour: 40000,
        pricePerDay: 260000,
        originalPrice: 20000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 89%, bảo mật mạng ổn định, phù hợp doanh nghiệp nhỏ/sự kiện',
          accessories: 'dây nguồn, cáp mạng',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1691435828932-911a7801adfb?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Kính thực tế ảo',
    description: 'Kính VR/AR cho trải nghiệm, sự kiện công nghệ',
    devices: [
      {
        name: 'Meta Quest 3 128GB',
        pricePerHour: 35000,
        pricePerDay: 230000,
        originalPrice: 13000000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, mặt kính không trầy, dây đeo đầu còn chắc',
          accessories: '2 tay cầm điều khiển, dây sạc, vải lau mặt kính',
          year: 2024,
          warrantyMonths: 7,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1780547292624-8bc828bdae07?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Apple Vision Pro 256GB',
        pricePerHour: 120000,
        pricePerDay: 800000,
        originalPrice: 95000000,
        detailedDescription: desc({
          condition: 'Máy mới 97%, màn hình Micro-OLED hoàn hảo, đã test đầy đủ tính năng',
          accessories: 'dây đeo đầu Solo/Dual Loop, pin ngoài, hộp đựng cao cấp',
          year: 2024,
          warrantyMonths: 9,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1707228773518-7ca0492d0c4d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'PICO 4 128GB',
        pricePerHour: 30000,
        pricePerDay: 190000,
        originalPrice: 9500000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, dây đeo thoải mái, hoạt động ổn định',
          accessories: '2 tay cầm điều khiển, dây sạc',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },

  // ---- 7 danh mục MỚI (mở rộng 22/10) — xem CLAUDE.md để biết lý do chọn 7
  // danh mục này (đa dạng, không trùng ý nghĩa với 8 danh mục gốc, phù hợp
  // mô hình cho thuê kiểu cyber net/cửa hàng công nghệ: gamer/streamer/làm
  // việc di động) ----
  {
    name: 'Camera hành động',
    description: 'Action cam, camera 360 độ cho thể thao, du lịch, vlog',
    devices: [
      {
        name: 'GoPro HERO12 Black',
        pricePerHour: 35000,
        pricePerDay: 220000,
        originalPrice: 11500000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, chống nước nguyên vẹn, chống rung hoạt động tốt',
          accessories: 'pin gốc + pin phụ, sạc, gậy selfie, khung gắn',
          year: 2024,
          warrantyMonths: 7,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1685615359827-aa31d97578e7?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Osmo Action 4',
        pricePerHour: 32000,
        pricePerDay: 200000,
        originalPrice: 9800000,
        detailedDescription: desc({
          condition: 'Máy đẹp 92%, cảm biến lớn quay đêm tốt, pin trâu',
          accessories: '2 pin gốc, sạc, khung nổi, dây đeo cổ tay',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1484506399805-c273b8e91dce?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Insta360 X4',
        pricePerHour: 38000,
        pricePerDay: 240000,
        originalPrice: 13000000,
        detailedDescription: desc({
          condition: 'Máy mới 94%, 2 mắt camera 360° không trầy, stitch hình mượt',
          accessories: 'que tự xoá tay cầm (invisible selfie stick), pin gốc, sạc',
          year: 2024,
          warrantyMonths: 7,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1618482914248-29272d021005?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Thiết bị livestream',
    description: 'Webcam, capture card, stream deck, đèn livestream cho streamer/content creator',
    devices: [
      {
        name: 'Elgato Stream Deck MK.2',
        pricePerHour: 15000,
        pricePerDay: 90000,
        originalPrice: 4500000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, phím LCD hiển thị rõ, bấm nhạy',
          accessories: 'dây USB-C, chân đế',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1656646549607-8fda5837a4ca?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Logitech StreamCam',
        pricePerHour: 18000,
        pricePerDay: 110000,
        originalPrice: 2800000,
        detailedDescription: desc({
          condition: 'Máy đẹp 91%, hình ảnh nét, lấy nét tự động nhanh',
          accessories: 'dây USB-C, kẹp laptop/chân máy mini',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Elgato Key Light Air',
        pricePerHour: 12000,
        pricePerDay: 75000,
        originalPrice: 2500000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, ánh sáng đều, điều khiển qua app ổn định',
          accessories: 'chân đế, dây nguồn',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1673196649671-eb09066ad6c1?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Phụ kiện gaming',
    description: 'Bàn phím, chuột, tay cầm, tai nghe gaming rời',
    devices: [
      {
        name: 'Logitech G Pro X Superlight 2',
        pricePerHour: 15000,
        pricePerDay: 90000,
        originalPrice: 3200000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, chuột nhạy, không lỗi double-click',
          accessories: 'dongle USB, dây sạc, viên pin AA dự phòng',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Razer BlackWidow V4 Pro (Green Switch)',
        pricePerHour: 20000,
        pricePerDay: 130000,
        originalPrice: 4800000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, switch gõ clicky rõ ràng, đèn RGB đầy đủ 16.8 triệu màu',
          accessories: 'dây USB-C bọc dù, kê tay',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'SteelSeries Arctis Nova Pro Wireless',
        pricePerHour: 25000,
        pricePerDay: 160000,
        originalPrice: 9500000,
        detailedDescription: desc({
          condition: 'Máy mới 94%, chống ồn ANC hiệu quả, 2 pin hoán đổi dùng liên tục không ngắt',
          accessories: '2 pin, trạm sạc, dongle không dây, dây 3.5mm',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1560419015-7c427e8ae5ba?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy tính bảng',
    description: 'iPad, tablet Android/Windows cho công việc, giải trí, vẽ',
    devices: [
      {
        name: 'iPad Pro 13" M4 256GB Wi-Fi',
        pricePerHour: 70000,
        pricePerDay: 450000,
        originalPrice: 34000000,
        detailedDescription: desc({
          condition: 'Máy mới 97%, màn hình OLED không điểm chết, không trầy mặt kính',
          accessories: 'sạc gốc, cáp USB-C, ốp lưng bảo vệ',
          year: 2024,
          warrantyMonths: 8,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1662893170097-d6563d0093d3?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Samsung Galaxy Tab S9 Ultra 12GB/256GB',
        pricePerHour: 60000,
        pricePerDay: 390000,
        originalPrice: 28000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 92%, màn hình AMOLED lớn sắc nét, chống nước IP68',
          accessories: 'sạc gốc, cáp USB-C, ốp lưng',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1620288650879-20db0eb38c05?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Microsoft Surface Pro 9 i7/16GB/256GB',
        pricePerHour: 55000,
        pricePerDay: 350000,
        originalPrice: 29000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, bàn phím type cover đi kèm còn tốt, bút cảm ứng nhạy',
          accessories: 'sạc gốc, bàn phím Type Cover, bút Surface Pen',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1544603396-2af4865ec92e?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Thiết bị thu âm',
    description: 'Microphone, mixer, audio interface cho podcast, thu âm, livestream',
    devices: [
      {
        name: 'Shure SM7B',
        pricePerHour: 30000,
        pricePerDay: 190000,
        originalPrice: 10500000,
        detailedDescription: desc({
          condition: 'Máy đẹp 93%, màng lọc âm còn nguyên, âm thanh trong, không nhiễu',
          accessories: 'giá đỡ chống sốc, dây XLR',
          year: 2022,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1589903308904-1010c2294adc?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Rode NT-USB+',
        pricePerHour: 22000,
        pricePerDay: 140000,
        originalPrice: 4200000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, plug-and-play, âm thanh rõ, phù hợp podcast/thu âm nhanh',
          accessories: 'dây USB-C, chân đế để bàn, pop filter',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1660631228116-b3643559f611?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Focusrite Scarlett 2i2 (4th Gen)',
        pricePerHour: 20000,
        pricePerDay: 130000,
        originalPrice: 4800000,
        detailedDescription: desc({
          condition: 'Máy mới 94%, preamp sạch, độ trễ thấp, hoạt động ổn định',
          accessories: 'dây USB-C, nguồn gốc',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1588800347304-ec7e6f353327?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Màn hình di động',
    description: 'Màn hình ngoài di động cho laptop, làm việc di động, trình chiếu nhỏ',
    devices: [
      {
        name: 'ASUS ZenScreen Go MB16AHP',
        pricePerHour: 25000,
        pricePerDay: 160000,
        originalPrice: 4500000,
        detailedDescription: desc({
          condition: 'Máy đẹp 90%, màn cảm ứng nhạy, viền mỏng gọn nhẹ',
          accessories: 'dây USB-C, bao da đứng màn hình',
          year: 2022,
          warrantyMonths: 5,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1551645120-d70bfe84c826?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Samsung Smart Monitor M8 32" (LS32BM80)',
        pricePerHour: 35000,
        pricePerDay: 220000,
        originalPrice: 10500000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, màn 4K sắc nét, sạc ngược 65W cho laptop qua USB-C',
          accessories: 'remote, dây nguồn, dây USB-C',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'LG gram +view 16MQ70',
        pricePerHour: 20000,
        pricePerDay: 130000,
        originalPrice: 9000000,
        detailedDescription: desc({
          condition: 'Máy đẹp 92%, màn WQXGA sắc nét, rất nhẹ tiện mang theo',
          accessories: 'dây USB-C, bao da kiêm chân đế',
          year: 2023,
          warrantyMonths: 6,
        }),
        imageUrl: 'https://images.unsplash.com/photo-1577375729152-4c8b5fcda381?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  // 2 danh mục MỚI (23/10 buổi 3) thay cho "PC & Mini PC" đã bỏ (máy để bàn
  // cồng kềnh, phải lắp đặt màn hình/bàn phím, khó kiểm tra khi giao nhận).
  // Ảnh do backend/scripts/device-images/ bổ sung (Phần 4) — chưa có thì để trống.
  {
    name: 'Gimbal & chống rung',
    description: 'Gimbal cầm tay chống rung cho máy ảnh và điện thoại — quay phim, vlog, sự kiện',
    devices: [
      {
        name: 'DJI RS 4',
        pricePerHour: 40000,
        pricePerDay: 250000,
        originalPrice: 12990000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, 3 trục chạy êm, đã cân chỉnh sẵn',
          accessories: 'tay cầm pin BG30, tấm gắn máy ảnh, chân tripod nhựa, cáp sạc, túi đựng',
          year: 2024,
          warrantyMonths: 9,
        }),
      },
      {
        name: 'DJI RS 3 Mini',
        pricePerHour: 30000,
        pricePerDay: 180000,
        originalPrice: 8490000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, nhỏ gọn phù hợp máy ảnh mirrorless kèm ống kính gọn nhẹ',
          accessories: 'tấm gắn máy ảnh, chân tripod nhựa, cáp sạc USB-C, túi đựng',
          year: 2023,
          warrantyMonths: 6,
        }),
      },
      {
        name: 'DJI Osmo Mobile 6',
        pricePerHour: 15000,
        pricePerDay: 80000,
        originalPrice: 3290000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, gậy nối dài và kẹp điện thoại nam châm hoạt động tốt',
          accessories: 'kẹp điện thoại nam châm, chân tripod mini, cáp sạc, túi đựng',
          year: 2023,
          warrantyMonths: 6,
        }),
      },
      {
        name: 'Zhiyun Crane-M3S',
        pricePerHour: 25000,
        pricePerDay: 130000,
        originalPrice: 5990000,
        detailedDescription: desc({
          condition: 'Máy mới 94%, có đèn LED tích hợp, dùng được cho máy ảnh nhỏ, action cam và điện thoại',
          accessories: 'tấm gắn nhanh, kẹp điện thoại, chân tripod, cáp sạc, túi đựng',
          year: 2024,
          warrantyMonths: 8,
        }),
      },
    ],
  },
  {
    name: 'Máy chơi game cầm tay',
    description: 'Máy chơi game PC cầm tay — chơi game AAA mọi nơi, đi du lịch, giải trí cuối tuần',
    devices: [
      {
        name: 'Steam Deck OLED 512GB',
        pricePerHour: 40000,
        pricePerDay: 250000,
        originalPrice: 15500000,
        detailedDescription: desc({
          condition: 'Máy mới 96%, màn hình OLED không điểm chết, nút và cần analog nhạy',
          accessories: 'sạc 45W, bao đựng chống sốc',
          year: 2024,
          warrantyMonths: 9,
        }),
      },
      {
        name: 'ASUS ROG Ally X 24GB/1TB',
        pricePerHour: 50000,
        pricePerDay: 320000,
        originalPrice: 21990000,
        detailedDescription: desc({
          condition: 'Máy mới 97%, chạy Windows 11, pin 80Wh dùng lâu',
          accessories: 'sạc 65W, bao đựng',
          year: 2024,
          warrantyMonths: 10,
        }),
      },
      {
        name: 'Lenovo Legion Go 16GB/512GB',
        pricePerHour: 45000,
        pricePerDay: 280000,
        originalPrice: 17990000,
        detailedDescription: desc({
          condition: 'Máy mới 95%, tay cầm tháo rời hoạt động tốt, có chế độ chuột FPS',
          accessories: 'sạc 65W, bao đựng, chân đỡ',
          year: 2024,
          warrantyMonths: 8,
        }),
      },
    ],
  },
];

async function findOrCreateCategory(input: { name: string; description: string }) {
  const specTemplate = (templateFor(input.name) ?? undefined) as unknown as Prisma.InputJsonValue | undefined;
  const existing = await prisma.category.findFirst({ where: { name: input.name } });
  if (existing) {
    return prisma.category.update({ where: { id: existing.id }, data: { specTemplate } });
  }
  return prisma.category.create({ data: { ...input, specTemplate } });
}

// Chuyển tên thiết bị thành 1 public_id Cloudinary ổn định (chỉ chữ thường,
// số, gạch ngang) — dùng để chạy lại script NHIỀU LẦN mà không tạo ảnh trùng
// (xem UploadService.uploadFromUrl, tham số publicId mới thêm).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seedDevice(categoryId: string, categoryName: string, device: DeviceSeed) {
  const publicId = `device-${slugify(device.name)}`;
  const researched = DEVICE_SPECS[device.name];
  if (!researched) throw new Error(`Thiếu thông số đã tra cứu cho "${device.name}" trong device-specs.json`);

  const specSheet = buildSpecSheet(templateFor(categoryName), researched.specs);
  const specFields = {
    specs: flattenSpecSheet(specSheet) as Prisma.InputJsonValue,
    specSheet: specSheet as unknown as Prisma.InputJsonValue,
    originalPrice: device.originalPrice,
    detailedDescription: device.detailedDescription,
  };

  // Tìm cả theo tên cũ: một số thiết bị được đổi tên cho đúng cấu hình thật
  // (VD iPad Pro 12.9 inch M4 → iPad Pro 13 inch M4 256GB Wi-Fi) — cập nhật đúng
  // dòng đang có (giữ nguyên lịch sử đơn/đánh giá), không tạo thiết bị mới.
  const existing = await prisma.device.findFirst({
    where: { name: { in: [device.name, ...(researched.previousNames ?? [])] } },
  });

  if (existing) {
    // Đã có ảnh Cloudinary thì giữ nguyên (ảnh do backend/scripts/device-images/ quản lý).
    const hasHostedImage = existing.images.some((url) => url.includes('res.cloudinary.com'));
    const images =
      !hasHostedImage && device.imageUrl
        ? [await uploadService.uploadFromUrl(device.imageUrl, publicId)]
        : undefined;
    await prisma.device.update({
      where: { id: existing.id },
      data: { name: device.name, ...specFields, ...(images ? { images } : {}) },
    });
    const renamed = existing.name !== device.name ? ` (đổi tên từ "${existing.name}")` : '';
    console.log(`  🔄 Đồng bộ ${device.name}${renamed} — ${specSheet.length} thông số`);
    return;
  }

  const imageUrl = device.imageUrl ? await uploadService.uploadFromUrl(device.imageUrl, publicId) : null;
  await prisma.device.create({
    data: {
      name: device.name,
      categoryId,
      ...specFields,
      pricePerHour: device.pricePerHour,
      pricePerDay: device.pricePerDay,
      status: device.status ?? DeviceStatus.available,
      images: imageUrl ? [imageUrl] : [],
    },
  });
  console.log(`  ✅ ${device.name} — ${specSheet.length} thông số`);
}

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu categories + devices...\n');

  for (const category of CATEGORIES) {
    console.log(`📁 Danh mục: ${category.name}`);
    const created = await findOrCreateCategory({
      name: category.name,
      description: category.description,
    });

    for (const device of category.devices) {
      await seedDevice(created.id, category.name, device);
    }
    console.log('');
  }

  const totalDevices = await prisma.device.count();
  const totalCategories = await prisma.category.count();
  console.log(`🎉 Hoàn tất! Tổng: ${totalCategories} danh mục, ${totalDevices} thiết bị.`);
}

main()
  .catch((error) => {
    console.error('❌ Seed thất bại:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
