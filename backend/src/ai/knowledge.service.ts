import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  calculateDeposit,
  calculateLateFeeForDays,
  calculateRefundPercentage,
  DEFAULT_BOOKING_TTL_MINUTES,
  DEPOSIT_RATIO,
  formatPercent,
  HOURLY_PRICING_MAX_HOURS,
  LATE_FEE_DAILY_RATIO,
  REFUND_TIERS,
} from '../common/business-policy';
import { DeviceStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  bigrams,
  DEVICE_INTENT_PHRASES,
  estimateTokens,
  NEED_TO_CATEGORY,
  normalizeVi,
  SYNONYM_GROUPS,
  tokenize,
} from './text-utils';

export interface KnowledgeChunk {
  id: string;
  title: string;
  text: string;
  /** Tiêu đề + nội dung đã chuẩn hoá (không dấu, bọc khoảng trắng 2 đầu) để so khớp nhanh. */
  normTitle: string;
  normBody: string;
}

export interface DeviceSuggestion {
  name: string;
  category: string;
  pricePerHour: number;
  pricePerDay: number;
  originalPrice: number;
  deposit: number;
  status: DeviceStatus;
  /** Thông số công khai rút gọn (VD "gpu: RTX 4070, ram: 32GB") để model không gán nhầm cấu hình giữa các máy. */
  specs: string;
}

export interface RetrievalResult {
  core: KnowledgeChunk;
  chunks: KnowledgeChunk[];
}

/** Ngân sách token cho phần kiến thức (gồm cả đoạn tóm tắt cốt lõi). */
export const KNOWLEDGE_TOKEN_BUDGET = 1500;
const MAX_CHUNKS = 5;
const MAX_DEVICES = 5;
const DEVICE_CACHE_TTL_MS = 60_000;
const CORE_CHUNK_TITLE = 'Tóm tắt chính sách cốt lõi';
const LATE_FEE_EXAMPLE_PRICE_PER_DAY = 400_000;
const DEPOSIT_EXAMPLE_PRICE = 30_000_000;

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

/**
 * Giá trị điền vào placeholder `{{...}}` trong kho kiến thức — TÍNH TỪ hằng số/
 * hàm của business-policy.ts, không chép tay, nên đổi chính sách ở code là
 * Trợ lý AI tự nói theo.
 */
export function buildPolicyValues(ttlMinutes: number): Record<string, string> {
  const [fullTier, partialTier] = REFUND_TIERS;
  const examplePrice = LATE_FEE_EXAMPLE_PRICE_PER_DAY;
  const lateFee = (days: number) =>
    formatVnd(calculateLateFeeForDays(days, examplePrice, Number.MAX_VALUE));
  const step = formatPercent(LATE_FEE_DAILY_RATIO);
  return {
    DEPOSIT_RATE: formatPercent(DEPOSIT_RATIO),
    DEPOSIT_EXAMPLE_PRICE: formatVnd(DEPOSIT_EXAMPLE_PRICE),
    DEPOSIT_EXAMPLE_AMOUNT: formatVnd(calculateDeposit(DEPOSIT_EXAMPLE_PRICE)),
    BOOKING_TTL_MINUTES: String(ttlMinutes),
    HOURLY_PRICING_MAX_HOURS: String(HOURLY_PRICING_MAX_HOURS),
    REFUND_FULL_HOURS: String(fullTier.minHoursBeforeStart),
    REFUND_FULL_PERCENT: `${fullTier.percentage}%`,
    REFUND_PARTIAL_HOURS: String(partialTier.minHoursBeforeStart),
    REFUND_PARTIAL_PERCENT: `${partialTier.percentage}%`,
    LATE_FEE_RULE:
      `ngày trễ thứ N phạt N × ${step} giá thuê/ngày (ngày thứ 1 phạt ${step}, ` +
      `ngày thứ 2 phạt ${formatPercent(LATE_FEE_DAILY_RATIO * 2)}, ngày thứ 3 phạt ` +
      `${formatPercent(LATE_FEE_DAILY_RATIO * 3)}...); tổng phí trễ hạn là cộng dồn ` +
      'mức phạt của tất cả các ngày trễ, tối đa bằng giá trị thiết bị.',
    REFUND_EXAMPLES: [30, 10, 3]
      .map((hours) => {
        const percent = calculateRefundPercentage(hours, false);
        return `còn ${hours} giờ (${hours} tiếng) tới giờ nhận máy thì ${percent > 0 ? `hoàn ${percent}% tiền cọc` : 'không được hoàn cọc'}`;
      })
      .join('; '),
    LATE_FEE_EXAMPLE_PRICE_PER_DAY: formatVnd(examplePrice),
    LATE_FEE_EXAMPLE_1DAY: lateFee(1),
    LATE_FEE_EXAMPLE_2DAYS: lateFee(2),
    LATE_FEE_EXAMPLE_3DAYS: lateFee(3),
  };
}

export function fillPlaceholders(
  text: string,
  values: Record<string, string>,
  source = 'knowledge',
): string {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key: string) => {
    if (!(key in values)) {
      throw new Error(`Placeholder {{${key}}} trong ${source} chưa có giá trị`);
    }
    return values[key];
  });
}

const pad = (text: string) => ` ${text} `;

/** Cắt 1 file markdown thành các đoạn theo tiêu đề `##` (bỏ phần trước `##` đầu tiên). */
export function splitIntoChunks(
  source: string,
  markdown: string,
): KnowledgeChunk[] {
  const docTitle = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? source;
  const sections = markdown.split(/^##\s+/m).slice(1);
  return sections.map((section, index) => {
    const newline = section.indexOf('\n');
    const heading = (newline < 0 ? section : section.slice(0, newline)).trim();
    const body = newline < 0 ? '' : section.slice(newline + 1).trim();
    const title = heading.toLowerCase().includes(docTitle.toLowerCase())
      ? heading
      : `${docTitle} — ${heading}`;
    return {
      id: `${source}#${index}`,
      title,
      text: body,
      normTitle: pad(normalizeVi(title)),
      normBody: pad(normalizeVi(body)),
    };
  });
}

/** 1 "ý" tìm kiếm: các cụm tương đương nhau (1 âm tiết, 1 cặp từ, hoặc 1 nhóm đồng nghĩa). */
export interface QueryTerm {
  phrases: string[];
  weight: number;
}

/**
 * Từ khoá tìm kiếm: âm tiết đơn (trọng số 1), cặp từ liền nhau (2), nhóm đồng
 * nghĩa (2). Mỗi nhóm đồng nghĩa là MỘT term — tính điểm theo cụm khớp tốt
 * nhất chứ không cộng dồn mọi cụm, để nhóm nhiều cụm (VD "lỗi/hỏng/sự cố...")
 * không lấn át từ khoá cụ thể như tên danh mục.
 */
export function buildQueryTerms(query: string): QueryTerm[] {
  const normalized = normalizeVi(query);
  const padded = pad(normalized);
  const terms: QueryTerm[] = tokenize(normalized).map((token) => ({
    phrases: [token],
    weight: 1,
  }));
  // Cặp từ lấy từ âm tiết GỐC (giữ "la ban" dù "la" là stopword), chỉ bỏ cặp toàn stopword.
  const raw = normalized.split(' ').filter(Boolean);
  const meaningful = new Set(tokenize(normalized));
  for (const pair of bigrams(raw)) {
    const [first, second] = pair.split(' ');
    if (meaningful.has(first) || meaningful.has(second)) {
      terms.push({ phrases: [pair], weight: 2 });
    }
  }
  for (const group of SYNONYM_GROUPS) {
    if (group.some((phrase) => padded.includes(pad(phrase)))) {
      terms.push({ phrases: group, weight: 2 });
    }
  }
  return terms;
}

export function scoreChunk(chunk: KnowledgeChunk, terms: QueryTerm[]): number {
  let score = 0;
  for (const { phrases, weight } of terms) {
    let best = 0;
    for (const phrase of phrases) {
      const needle = pad(phrase);
      const value =
        (chunk.normTitle.includes(needle) ? 3 * weight : 0) +
        (chunk.normBody.includes(needle) ? weight : 0);
      best = Math.max(best, value);
    }
    score += best;
  }
  return score;
}

const GENERIC_NAME_TOKENS = new Set(
  'pro max plus mini air black slim series smart gen th ultra the x'.split(' '),
);

/**
 * RAG đơn giản không cần vector DB: kho markdown nạp 1 lần lúc khởi động,
 * mỗi câu hỏi chấm điểm từ khoá (có bảng đồng nghĩa) để chọn vài đoạn liên quan.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);
  private chunks: KnowledgeChunk[] = [];
  private core!: KnowledgeChunk;
  private deviceCache?: { at: number; devices: DeviceSuggestion[] };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.load(join(__dirname, 'knowledge'));
  }

  /** Tách riêng để unit test nạp đúng thư mục kiến thức thật. */
  load(directory: string): void {
    const ttl = Number(
      this.configService.get<string>('BOOKING_TTL_MINUTES') ??
        DEFAULT_BOOKING_TTL_MINUTES,
    );
    const values = buildPolicyValues(ttl);
    const chunks: KnowledgeChunk[] = [];
    for (const file of listMarkdownFiles(directory)) {
      const source = relative(directory, file).replace(/\\/g, '/');
      const content = fillPlaceholders(
        readFileSync(file, 'utf8'),
        values,
        source,
      );
      chunks.push(...splitIntoChunks(source, content));
    }
    const core = chunks.find((chunk) => chunk.title.includes(CORE_CHUNK_TITLE));
    if (!core) {
      throw new Error(`Kho kiến thức thiếu đoạn "${CORE_CHUNK_TITLE}"`);
    }
    this.core = core;
    this.chunks = chunks.filter((chunk) => chunk !== core);
    this.logger.log(`Đã nạp ${chunks.length} đoạn kiến thức từ ${directory}`);
  }

  get chunkCount(): number {
    return this.chunks.length + 1;
  }

  retrieve(query: string): RetrievalResult {
    const terms = buildQueryTerms(query);
    const scored = this.chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const threshold = Math.max(2, (scored[0]?.score ?? 0) * 0.35);
    let budget =
      KNOWLEDGE_TOKEN_BUDGET - estimateTokens(formatChunk(this.core));
    const selected: KnowledgeChunk[] = [];
    for (const { chunk, score } of scored) {
      if (selected.length >= MAX_CHUNKS || score < threshold) break;
      const cost = estimateTokens(formatChunk(chunk));
      if (cost > budget) continue;
      selected.push(chunk);
      budget -= cost;
    }
    return { core: this.core, chunks: selected };
  }

  /**
   * Câu hỏi có nhắc tới thiết bị/danh mục/nhu cầu thuê → lấy tối đa 5 thiết bị
   * công khai phù hợp từ DB (giá thật, không để model tự nghĩ). Trả `null` nếu
   * câu hỏi không liên quan tới thiết bị.
   */
  async findDevices(query: string): Promise<DeviceSuggestion[] | null> {
    const padded = pad(normalizeVi(query));
    const devices = await this.loadDevices();

    const scored = devices
      .map((device) => ({ device, score: scoreDevice(device, padded) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.device.status === DeviceStatus.available) -
            Number(a.device.status === DeviceStatus.available),
      )
      .slice(0, MAX_DEVICES)
      .map((entry) => entry.device);

    if (scored.length > 0) return scored;
    const hasIntent = DEVICE_INTENT_PHRASES.some((phrase) =>
      padded.includes(pad(phrase)),
    );
    return hasIntent ? [] : null;
  }

  async listCategoryNames(): Promise<string[]> {
    const devices = await this.loadDevices();
    return [...new Set(devices.map((device) => device.category))];
  }

  private async loadDevices(): Promise<DeviceSuggestion[]> {
    if (
      this.deviceCache &&
      Date.now() - this.deviceCache.at < DEVICE_CACHE_TTL_MS
    ) {
      return this.deviceCache.devices;
    }
    // CHỈ chọn trường công khai của thiết bị — không đụng bảng users/bookings.
    const rows = await this.prisma.device.findMany({
      // Thiết bị ngừng kinh doanh không được gợi ý cho khách.
      where: { isDiscontinued: false },
      select: {
        name: true,
        status: true,
        specs: true,
        pricePerHour: true,
        pricePerDay: true,
        originalPrice: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const devices = rows.map((row) => ({
      name: row.name,
      category: row.category.name,
      pricePerHour: Number(row.pricePerHour),
      pricePerDay: Number(row.pricePerDay),
      originalPrice: Number(row.originalPrice),
      deposit: calculateDeposit(Number(row.originalPrice)),
      status: row.status,
      specs: summarizeSpecs(row.specs),
    }));
    this.deviceCache = { at: Date.now(), devices };
    return devices;
  }
}

function scoreDevice(device: DeviceSuggestion, paddedQuery: string): number {
  let score = 0;
  const name = normalizeVi(device.name);
  if (paddedQuery.includes(pad(name))) score += 20;
  for (const token of name.split(' ')) {
    if (token.length < 2 || !paddedQuery.includes(pad(token))) continue;
    score += GENERIC_NAME_TOKENS.has(token) ? 0.5 : 3;
  }
  // Chỉ khớp vài từ chung chung (VD "pro") thì không tính là nhắc tới thiết bị.
  if (score < 3) score = 0;

  const category = normalizeVi(device.category);
  if (paddedQuery.includes(pad(category))) score += 8;
  for (const [need, categories] of Object.entries(NEED_TO_CATEGORY)) {
    if (categories.includes(category) && paddedQuery.includes(pad(need))) {
      // Danh mục đầu tiên trong danh sách là phù hợp nhất với nhu cầu đó — nặng
      // hơn việc chỉ nhắc tên danh mục khác (VD "gimbal cho máy ảnh" → gimbal).
      score += categories[0] === category ? 9 : 3;
    }
  }
  return score;
}

export function formatChunk(chunk: KnowledgeChunk): string {
  return `### ${chunk.title}\n${chunk.text}`;
}

const DEVICE_STATUS_TEXT: Record<DeviceStatus, string> = {
  available: 'sẵn sàng cho thuê',
  rented: 'đang có khách thuê (vẫn đặt được nếu chọn khung giờ khác còn trống)',
  maintenance: 'đang bảo trì, tạm không đặt được',
  broken: 'đang hỏng, tạm không đặt được',
};

const MAX_SPEC_ENTRIES = 4;
/** Thông số quyết định "máy nào mạnh hơn" đưa lên trước, phần còn lại giữ thứ tự gốc. */
const PRIORITY_SPECS = ['cpu', 'chip', 'gpu', 'ram', 'sensor', 'video'];
const specPriority = (key: string) => {
  const index = PRIORITY_SPECS.indexOf(key);
  return index < 0 ? PRIORITY_SPECS.length : index;
};

function summarizeSpecs(specs: unknown): string {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return '';
  return Object.entries(specs as Record<string, unknown>)
    .filter(
      ([, value]) => typeof value === 'string' || typeof value === 'number',
    )
    .sort(([a], [b]) => specPriority(a) - specPriority(b))
    .slice(0, MAX_SPEC_ENTRIES)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

/**
 * Mỗi thiết bị 1 khối nhiều dòng có nhãn rõ ràng — khi dồn hết lên 1 dòng,
 * model 7B từng lấy nhầm "45.000" của giá trị tài sản 45.000.000đ làm giá/giờ.
 */
export function formatDevice(device: DeviceSuggestion): string {
  const lines = [
    `- ${device.name} (danh mục ${device.category})`,
    `  + Giá thuê: ${formatVnd(device.pricePerDay)}/ngày; ${formatVnd(device.pricePerHour)}/giờ`,
    `  + Tiền cọc: ${formatVnd(device.deposit)}`,
    `  + Tình trạng: ${DEVICE_STATUS_TEXT[device.status]}`,
    `  + Giá trị tài sản (dùng để tính cọc): ${formatVnd(device.originalPrice)}`,
  ];
  if (device.specs) lines.splice(1, 0, `  + Thông số: ${device.specs}`);
  return lines.join('\n');
}

function listMarkdownFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...listMarkdownFiles(full));
    else if (entry.endsWith('.md')) files.push(full);
  }
  return files;
}
