import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, DeviceStatus } from '../src/generated/prisma/client';
import { UploadService } from '../src/upload/upload.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// UploadService chỉ cần một object có .get(key) giống ConfigService — không cần bootstrap
// toàn bộ Nest app chỉ để chạy script seed.
const uploadService = new UploadService({
  get: (key: string) => process.env[key],
} as any);

interface CategorySeed {
  name: string;
  description: string;
  devices: DeviceSeed[];
}

interface DeviceSeed {
  name: string;
  specs: Record<string, unknown>;
  pricePerHour: number;
  pricePerDay: number;
  status?: DeviceStatus;
  /**
   * Ảnh thật (Unsplash/Pexels, link CDN trực tiếp) khớp đúng model/loại thiết
   * bị — xem CLAUDE.md mục "Đã hoàn thành" buổi mở rộng seed data để biết
   * cách đã chọn ảnh (ưu tiên đúng model, fallback đúng loại nếu không có
   * ảnh model cụ thể).
   */
  imageUrl: string;
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
        name: 'MacBook Pro 14" M3 Pro',
        specs: { cpu: 'Apple M3 Pro', ram: '18GB', storage: '512GB SSD', screen: '14.2" Liquid Retina XDR' },
        pricePerHour: 60000,
        pricePerDay: 400000,
        imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Dell XPS 15 9530',
        specs: { cpu: 'Intel Core i7-13700H', ram: '32GB', storage: '1TB SSD', screen: '15.6" OLED 3.5K' },
        pricePerHour: 55000,
        pricePerDay: 380000,
        imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'ASUS ROG Zephyrus G14',
        specs: { cpu: 'AMD Ryzen 9 8945HS', gpu: 'RTX 4070', ram: '32GB', storage: '1TB SSD' },
        pricePerHour: 65000,
        pricePerDay: 420000,
        status: DeviceStatus.rented,
        imageUrl: 'https://images.unsplash.com/photo-1698512475067-74ed7c956c8d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Lenovo ThinkPad X1 Carbon Gen 12',
        specs: { cpu: 'Intel Core Ultra 7', ram: '16GB', storage: '512GB SSD', screen: '14" 2.8K OLED' },
        pricePerHour: 45000,
        pricePerDay: 300000,
        imageUrl: 'https://images.unsplash.com/photo-1770932327451-63bb8530f607?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy ảnh',
    description: 'Máy ảnh mirrorless, DSLR cho quay chụp chuyên nghiệp',
    devices: [
      {
        name: 'Sony Alpha A7 IV',
        specs: { sensor: 'Full-frame 33MP', video: '4K 60fps', mount: 'Sony E' },
        pricePerHour: 70000,
        pricePerDay: 450000,
        imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Canon EOS R6 Mark II',
        specs: { sensor: 'Full-frame 24.2MP', video: '4K 60fps', mount: 'Canon RF' },
        pricePerHour: 68000,
        pricePerDay: 440000,
        imageUrl: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Fujifilm X-T5',
        specs: { sensor: 'APS-C 40.2MP', video: '6.2K 30fps', mount: 'Fujifilm X' },
        pricePerHour: 50000,
        pricePerDay: 330000,
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
        specs: { camera: 'Triple-camera Hasselblad', video: '5.1K', flightTime: '43 phút' },
        pricePerHour: 80000,
        pricePerDay: 500000,
        imageUrl: 'https://images.unsplash.com/photo-1473186639016-1451879a06f0?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Mini 4 Pro',
        specs: { weight: '249g', video: '4K 60fps', flightTime: '34 phút' },
        pricePerHour: 45000,
        pricePerDay: 280000,
        imageUrl: 'https://images.unsplash.com/photo-1487304655522-c039cc299c9d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Air 3',
        specs: { camera: 'Dual-camera', video: '4K 60fps HDR', flightTime: '46 phút' },
        pricePerHour: 55000,
        pricePerDay: 350000,
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
        specs: { brightness: '3600 lumens', resolution: 'XGA 1024x768' },
        pricePerHour: 25000,
        pricePerDay: 150000,
        imageUrl: 'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'BenQ TK850',
        specs: { brightness: '3000 lumens', resolution: '4K UHD' },
        pricePerHour: 40000,
        pricePerDay: 250000,
        imageUrl: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Xiaomi Mi Smart Projector 2',
        specs: { brightness: '1300 ANSI lumens', resolution: 'Full HD 1080p' },
        pricePerHour: 20000,
        pricePerDay: 120000,
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
        specs: { power: '240W', battery: '18 giờ', bluetooth: '5.1' },
        pricePerHour: 30000,
        pricePerDay: 180000,
        imageUrl: 'https://images.unsplash.com/photo-1589256469067-ea99122bbdc4?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Bose SoundLink Max',
        specs: { power: 'Bass boost', battery: '20 giờ', waterproof: 'IP67' },
        pricePerHour: 28000,
        pricePerDay: 170000,
        imageUrl: 'https://images.unsplash.com/photo-1594501432907-91214bfdd928?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Marshall Stanmore III',
        specs: { power: '80W', bluetooth: '5.2', style: 'Retro' },
        pricePerHour: 22000,
        pricePerDay: 140000,
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
        name: 'PlayStation 5 Slim',
        specs: { storage: '1TB SSD', resolution: '4K 120fps' },
        pricePerHour: 35000,
        pricePerDay: 220000,
        imageUrl: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Xbox Series X',
        specs: { storage: '1TB SSD', resolution: '4K 120fps' },
        pricePerHour: 33000,
        pricePerDay: 210000,
        imageUrl: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Nintendo Switch OLED',
        specs: { screen: '7" OLED', storage: '64GB', mode: 'TV/Handheld' },
        pricePerHour: 20000,
        pricePerDay: 130000,
        imageUrl: 'https://images.unsplash.com/photo-1612036781124-847f8939b154?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Thiết bị mạng',
    description: 'Router, thiết bị mạng cho sự kiện, văn phòng tạm',
    devices: [
      {
        name: 'Ubiquiti UniFi Dream Machine Pro',
        specs: { ports: '8x 1G + 1x 10G SFP+', wifi: 'WiFi 6' },
        pricePerHour: 30000,
        pricePerDay: 190000,
        imageUrl: 'https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'TP-Link Archer AX90',
        specs: { wifi: 'WiFi 6 AX6600', ports: '4x Gigabit LAN' },
        pricePerHour: 18000,
        pricePerDay: 110000,
        imageUrl: 'https://images.unsplash.com/photo-1645725677294-ed0843b97d5c?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Cisco Meraki MX67',
        specs: { type: 'Security Gateway', throughput: '450 Mbps' },
        pricePerHour: 40000,
        pricePerDay: 260000,
        imageUrl: 'https://images.unsplash.com/photo-1691435828932-911a7801adfb?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Kính thực tế ảo',
    description: 'Kính VR/AR cho trải nghiệm, sự kiện công nghệ',
    devices: [
      {
        name: 'Meta Quest 3',
        specs: { storage: '128GB', tracking: 'Inside-out 6DOF' },
        pricePerHour: 35000,
        pricePerDay: 230000,
        imageUrl: 'https://images.unsplash.com/photo-1780547292624-8bc828bdae07?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Apple Vision Pro',
        specs: { storage: '256GB', display: 'Micro-OLED 4K/eye' },
        pricePerHour: 120000,
        pricePerDay: 800000,
        imageUrl: 'https://images.unsplash.com/photo-1707228773518-7ca0492d0c4d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'PICO 4',
        specs: { storage: '128GB', tracking: 'Inside-out 6DOF' },
        pricePerHour: 30000,
        pricePerDay: 190000,
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
        specs: { resolution: '5.3K60', waterproof: '10m không cần ốp', stabilization: 'HyperSmooth 6.0' },
        pricePerHour: 35000,
        pricePerDay: 220000,
        imageUrl: 'https://images.unsplash.com/photo-1685615359827-aa31d97578e7?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'DJI Osmo Action 4',
        specs: { resolution: '4K120', sensor: '1/1.3"', battery: '160 phút' },
        pricePerHour: 32000,
        pricePerDay: 200000,
        imageUrl: 'https://images.unsplash.com/photo-1484506399805-c273b8e91dce?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Insta360 X4',
        specs: { type: '360° camera', resolution: '8K30 360°', waterproof: '10m' },
        pricePerHour: 38000,
        pricePerDay: 240000,
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
        specs: { buttons: '15 phím LCD', connect: 'USB-C' },
        pricePerHour: 15000,
        pricePerDay: 90000,
        imageUrl: 'https://images.unsplash.com/photo-1656646549607-8fda5837a4ca?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Logitech StreamCam',
        specs: { resolution: '1080p60', sensor: 'Full HD CMOS', mount: 'Tripod/laptop clip' },
        pricePerHour: 18000,
        pricePerDay: 110000,
        imageUrl: 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Elgato Key Light Air',
        specs: { brightness: '1400 lumens', control: 'App/Stream Deck', colorTemp: '2900K-7000K' },
        pricePerHour: 12000,
        pricePerDay: 75000,
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
        specs: { type: 'Chuột gaming', weight: '60g', sensor: 'HERO 2 32000 DPI', connect: 'Wireless LIGHTSPEED' },
        pricePerHour: 15000,
        pricePerDay: 90000,
        imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Razer BlackWidow V4 Pro',
        specs: { type: 'Bàn phím cơ', switch: 'Green Clicky', backlight: 'Chroma RGB', connect: 'Wired' },
        pricePerHour: 20000,
        pricePerDay: 130000,
        imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'SteelSeries Arctis Nova Pro Wireless',
        specs: { type: 'Tai nghe gaming', connect: 'Wireless 2.4GHz + Bluetooth', anc: 'Có', battery: '2 pin hoán đổi' },
        pricePerHour: 25000,
        pricePerDay: 160000,
        imageUrl: 'https://images.unsplash.com/photo-1560419015-7c427e8ae5ba?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Máy tính bảng',
    description: 'iPad, tablet Android/Windows cho công việc, giải trí, vẽ',
    devices: [
      {
        name: 'iPad Pro 12.9" M4',
        specs: { chip: 'Apple M4', storage: '256GB', screen: '13" Ultra Retina XDR' },
        pricePerHour: 70000,
        pricePerDay: 450000,
        imageUrl: 'https://images.unsplash.com/photo-1662893170097-d6563d0093d3?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Samsung Galaxy Tab S9 Ultra',
        specs: { chip: 'Snapdragon 8 Gen 2', ram: '12GB', storage: '256GB', screen: '14.6" Dynamic AMOLED' },
        pricePerHour: 60000,
        pricePerDay: 390000,
        imageUrl: 'https://images.unsplash.com/photo-1620288650879-20db0eb38c05?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Microsoft Surface Pro 9',
        specs: { cpu: 'Intel Core i7-1255U', ram: '16GB', storage: '256GB SSD', screen: '13" PixelSense' },
        pricePerHour: 55000,
        pricePerDay: 350000,
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
        specs: { type: 'Microphone thu âm', pattern: 'Cardioid', connect: 'XLR' },
        pricePerHour: 30000,
        pricePerDay: 190000,
        imageUrl: 'https://images.unsplash.com/photo-1589903308904-1010c2294adc?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Rode NT-USB+',
        specs: { type: 'Microphone thu âm', connect: 'USB-C', pattern: 'Cardioid' },
        pricePerHour: 22000,
        pricePerDay: 140000,
        imageUrl: 'https://images.unsplash.com/photo-1660631228116-b3643559f611?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Focusrite Scarlett 2i2 (4th Gen)',
        specs: { type: 'Audio Interface', inputs: '2x XLR/Combo', connect: 'USB-C' },
        pricePerHour: 20000,
        pricePerDay: 130000,
        imageUrl: 'https://images.unsplash.com/photo-1588800347304-ec7e6f353327?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'Màn hình di động',
    description: 'Màn hình ngoài di động cho laptop, làm việc di động, trình chiếu nhỏ',
    devices: [
      {
        name: 'ASUS ZenScreen MB16AHP',
        specs: { screen: '15.6" FHD IPS', touch: 'Có', connect: 'USB-C/Mini-HDMI' },
        pricePerHour: 25000,
        pricePerDay: 160000,
        imageUrl: 'https://images.unsplash.com/photo-1551645120-d70bfe84c826?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'Samsung Smart Monitor M8',
        specs: { screen: '27" 4K UHD', smartTv: 'Có Tizen OS', connect: 'USB-C 65W' },
        pricePerHour: 35000,
        pricePerDay: 220000,
        imageUrl: 'https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'LG gram +view 16MQ70',
        specs: { screen: '16" WQXGA IPS', touch: 'Không', connect: 'USB-C' },
        pricePerHour: 20000,
        pricePerDay: 130000,
        imageUrl: 'https://images.unsplash.com/photo-1577375729152-4c8b5fcda381?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
  {
    name: 'PC & Mini PC',
    description: 'Máy tính để bàn, mini PC, PC workstation cho gaming/dựng phim di động',
    devices: [
      {
        name: 'Apple Mac mini M4',
        specs: { chip: 'Apple M4', ram: '16GB', storage: '512GB SSD' },
        pricePerHour: 50000,
        pricePerDay: 320000,
        imageUrl: 'https://images.unsplash.com/photo-1738834909158-970e8853052c?w=800&q=80&auto=format&fit=crop',
      },
      {
        name: 'ASUS ROG NUC 2024',
        specs: { cpu: 'Intel Core Ultra 9', gpu: 'RTX 4070', ram: '32GB', storage: '1TB SSD' },
        pricePerHour: 75000,
        pricePerDay: 480000,
        imageUrl: 'https://images.unsplash.com/photo-1626218174358-7769486c4b79?w=800&q=80&auto=format&fit=crop',
      },
    ],
  },
];

async function findOrCreateCategory(input: { name: string; description: string }) {
  const existing = await prisma.category.findFirst({ where: { name: input.name } });
  if (existing) return existing;
  return prisma.category.create({ data: input });
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

async function seedDevice(categoryId: string, device: DeviceSeed) {
  const publicId = `device-${slugify(device.name)}`;
  const existing = await prisma.device.findFirst({ where: { name: device.name } });

  if (existing) {
    // Đã migrate đúng ảnh thật của buổi này rồi (public_id khớp) — khỏi upload lại.
    const alreadyMigrated = existing.images[0]?.includes(`techrent/devices/${publicId}`);
    if (alreadyMigrated) {
      console.log(`  ⏭  Bỏ qua (đã có ảnh thật đúng): ${device.name}`);
      return;
    }

    console.log(`  🔄 Cập nhật ảnh thật cho thiết bị đã có: ${device.name}...`);
    const imageUrl = await uploadService.uploadFromUrl(device.imageUrl, publicId);
    await prisma.device.update({
      where: { id: existing.id },
      data: { images: [imageUrl] },
    });
    console.log(`  ✅ Đã cập nhật ảnh ${device.name} (${imageUrl})`);
    return;
  }

  console.log(`  ⬆  Upload ảnh cho: ${device.name}...`);
  const imageUrl = await uploadService.uploadFromUrl(device.imageUrl, publicId);

  await prisma.device.create({
    data: {
      name: device.name,
      categoryId,
      specs: device.specs as Prisma.InputJsonValue,
      pricePerHour: device.pricePerHour,
      pricePerDay: device.pricePerDay,
      status: device.status ?? DeviceStatus.available,
      images: [imageUrl],
    },
  });
  console.log(`  ✅ ${device.name} (${imageUrl})`);
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
      await seedDevice(created.id, device);
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
