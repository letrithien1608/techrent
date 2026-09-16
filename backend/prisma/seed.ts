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
  imageSeed: string;
}

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
        imageSeed: 'macbook-pro-14',
      },
      {
        name: 'Dell XPS 15 9530',
        specs: { cpu: 'Intel Core i7-13700H', ram: '32GB', storage: '1TB SSD', screen: '15.6" OLED 3.5K' },
        pricePerHour: 55000,
        pricePerDay: 380000,
        imageSeed: 'dell-xps-15',
      },
      {
        name: 'ASUS ROG Zephyrus G14',
        specs: { cpu: 'AMD Ryzen 9 8945HS', gpu: 'RTX 4070', ram: '32GB', storage: '1TB SSD' },
        pricePerHour: 65000,
        pricePerDay: 420000,
        status: DeviceStatus.rented,
        imageSeed: 'asus-rog-g14',
      },
      {
        name: 'Lenovo ThinkPad X1 Carbon Gen 12',
        specs: { cpu: 'Intel Core Ultra 7', ram: '16GB', storage: '512GB SSD', screen: '14" 2.8K OLED' },
        pricePerHour: 45000,
        pricePerDay: 300000,
        imageSeed: 'thinkpad-x1',
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
        imageSeed: 'sony-a7iv',
      },
      {
        name: 'Canon EOS R6 Mark II',
        specs: { sensor: 'Full-frame 24.2MP', video: '4K 60fps', mount: 'Canon RF' },
        pricePerHour: 68000,
        pricePerDay: 440000,
        imageSeed: 'canon-r6ii',
      },
      {
        name: 'Fujifilm X-T5',
        specs: { sensor: 'APS-C 40.2MP', video: '6.2K 30fps', mount: 'Fujifilm X' },
        pricePerHour: 50000,
        pricePerDay: 330000,
        status: DeviceStatus.maintenance,
        imageSeed: 'fujifilm-xt5',
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
        imageSeed: 'dji-mavic-3-pro',
      },
      {
        name: 'DJI Mini 4 Pro',
        specs: { weight: '249g', video: '4K 60fps', flightTime: '34 phút' },
        pricePerHour: 45000,
        pricePerDay: 280000,
        imageSeed: 'dji-mini-4-pro',
      },
      {
        name: 'DJI Air 3',
        specs: { camera: 'Dual-camera', video: '4K 60fps HDR', flightTime: '46 phút' },
        pricePerHour: 55000,
        pricePerDay: 350000,
        imageSeed: 'dji-air-3',
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
        imageSeed: 'epson-ebx06',
      },
      {
        name: 'BenQ TK850',
        specs: { brightness: '3000 lumens', resolution: '4K UHD' },
        pricePerHour: 40000,
        pricePerDay: 250000,
        imageSeed: 'benq-tk850',
      },
      {
        name: 'Xiaomi Mi Smart Projector 2',
        specs: { brightness: '1300 ANSI lumens', resolution: 'Full HD 1080p' },
        pricePerHour: 20000,
        pricePerDay: 120000,
        imageSeed: 'xiaomi-projector-2',
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
        imageSeed: 'jbl-partybox-310',
      },
      {
        name: 'Bose SoundLink Max',
        specs: { power: 'Bass boost', battery: '20 giờ', waterproof: 'IP67' },
        pricePerHour: 28000,
        pricePerDay: 170000,
        imageSeed: 'bose-soundlink-max',
      },
      {
        name: 'Marshall Stanmore III',
        specs: { power: '80W', bluetooth: '5.2', style: 'Retro' },
        pricePerHour: 22000,
        pricePerDay: 140000,
        status: DeviceStatus.broken,
        imageSeed: 'marshall-stanmore-3',
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
        imageSeed: 'ps5-slim',
      },
      {
        name: 'Xbox Series X',
        specs: { storage: '1TB SSD', resolution: '4K 120fps' },
        pricePerHour: 33000,
        pricePerDay: 210000,
        imageSeed: 'xbox-series-x',
      },
      {
        name: 'Nintendo Switch OLED',
        specs: { screen: '7" OLED', storage: '64GB', mode: 'TV/Handheld' },
        pricePerHour: 20000,
        pricePerDay: 130000,
        imageSeed: 'switch-oled',
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
        imageSeed: 'unifi-dream-machine',
      },
      {
        name: 'TP-Link Archer AX90',
        specs: { wifi: 'WiFi 6 AX6600', ports: '4x Gigabit LAN' },
        pricePerHour: 18000,
        pricePerDay: 110000,
        imageSeed: 'tplink-archer-ax90',
      },
      {
        name: 'Cisco Meraki MX67',
        specs: { type: 'Security Gateway', throughput: '450 Mbps' },
        pricePerHour: 40000,
        pricePerDay: 260000,
        imageSeed: 'cisco-meraki-mx67',
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
        imageSeed: 'meta-quest-3',
      },
      {
        name: 'Apple Vision Pro',
        specs: { storage: '256GB', display: 'Micro-OLED 4K/eye' },
        pricePerHour: 120000,
        pricePerDay: 800000,
        imageSeed: 'apple-vision-pro',
      },
      {
        name: 'PICO 4',
        specs: { storage: '128GB', tracking: 'Inside-out 6DOF' },
        pricePerHour: 30000,
        pricePerDay: 190000,
        imageSeed: 'pico-4',
      },
    ],
  },
];

async function findOrCreateCategory(input: { name: string; description: string }) {
  const existing = await prisma.category.findFirst({ where: { name: input.name } });
  if (existing) return existing;
  return prisma.category.create({ data: input });
}

async function seedDevice(categoryId: string, device: DeviceSeed) {
  const existing = await prisma.device.findFirst({ where: { name: device.name } });
  if (existing) {
    console.log(`  ⏭  Bỏ qua (đã tồn tại): ${device.name}`);
    return;
  }

  console.log(`  ⬆  Upload ảnh cho: ${device.name}...`);
  const imageUrl = await uploadService.uploadFromUrl(
    `https://picsum.photos/seed/${device.imageSeed}/800/600`,
  );

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
