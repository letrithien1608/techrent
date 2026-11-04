// Dùng chung cho `npm run ai:eval` và `npm run ai:bench`: dựng đúng pipeline
// thật (KnowledgeService + DB + Ollama) trong 1 Nest application context —
// gọi thẳng AiService thay vì qua HTTP để không vướng rate limit 10 câu/phút.
import { Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DEFAULT_BOOKING_TTL_MINUTES } from '../../common/business-policy';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AiModule } from '../ai.module';
import { AiService, type ChatStats } from '../ai.service';
import { buildPolicyValues, formatVnd } from '../knowledge.service';
import {
  calculateLateFeeTable,
  checkLateFeeAnswer,
  type LateFeeCalculation,
} from '../late-fee-calc';
import { normalizeVi } from '../text-utils';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AiModule,
  ],
})
class AiEvalModule {}

export interface EvalQuestion {
  id: string;
  group: string;
  question: string;
  mustInclude: string[];
  mustNotInclude: string[];
  /**
   * Câu tính phí trễ hạn: tổng đúng tính bằng hàm nghiệp vụ (giá thuê lấy từ
   * `pricePerDay` hoặc thiết bị `device` trong DB) → bắt buộc có đúng TỔNG và
   * không được có dòng "tổng" nào ra số khác.
   */
  lateFee?: { days: number; pricePerDay?: number; device?: string };
  lateFeeCalc?: LateFeeCalculation;
}

export interface AskResult {
  answer: string;
  stats: ChatStats | null;
  error: string | null;
}

export const DOCS_DIR = join(__dirname, '..', '..', '..', '..', 'docs');

export async function createContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AiEvalModule, {
    logger: ['error', 'warn'],
  });
}

export async function ask(ai: AiService, message: string): Promise<AskResult> {
  let answer = '';
  let stats: ChatStats | null = null;
  try {
    const stream = await ai.openChat(
      { message },
      undefined,
      new AbortController().signal,
    );
    for await (const event of stream) {
      if (event.type === 'token') answer += event.content;
      else if (event.type === 'done') stats = event.stats;
      else return { answer, stats, error: event.message };
    }
    return { answer, stats, error: null };
  } catch (error) {
    return { answer, stats, error: (error as Error).message };
  }
}

/** Đọc bộ câu hỏi, thay {{...}} bằng số liệu thật (business-policy.ts + DB). */
export async function loadQuestions(
  app: INestApplicationContext,
): Promise<EvalQuestion[]> {
  const raw = JSON.parse(
    readFileSync(join(__dirname, 'questions.json'), 'utf8'),
  ) as { questions: EvalQuestion[] };
  const ttl = Number(
    app.get(ConfigService).get<string>('BOOKING_TTL_MINUTES') ??
      DEFAULT_BOOKING_TTL_MINUTES,
  );
  const policy = buildPolicyValues(ttl);
  const prisma = app.get(PrismaService);
  const stripDong = (value: string) => value.replace(/đ$/, '');

  const resolve = async (keyword: string): Promise<string> => {
    let result = keyword;
    for (const match of keyword.matchAll(
      /\{\{([A-Z_0-9]+)(?::([^}]+))?\}\}/g,
    )) {
      const [token, key, deviceName] = match;
      let value: string;
      if (deviceName) {
        const device = await prisma.device.findFirstOrThrow({
          where: { name: deviceName },
        });
        value =
          key === 'PRICE_PER_DAY'
            ? stripDong(formatVnd(Number(device.pricePerDay)))
            : stripDong(formatVnd(Number(device.originalPrice) / 2));
      } else if (key.endsWith('_NUMBER')) {
        value = stripDong(policy[key.replace(/_NUMBER$/, '')]);
      } else {
        value = policy[key];
      }
      if (value === undefined) throw new Error(`Không có giá trị cho ${token}`);
      result = result.replace(token, value);
    }
    return result;
  };

  const lateFeeCalc = async (
    spec: NonNullable<EvalQuestion['lateFee']>,
  ): Promise<LateFeeCalculation> => {
    if (spec.device) {
      const device = await prisma.device.findFirstOrThrow({
        where: { name: spec.device },
      });
      return calculateLateFeeTable({
        days: spec.days,
        pricePerDay: Number(device.pricePerDay),
        originalPrice: Number(device.originalPrice),
        deviceName: device.name,
      });
    }
    return calculateLateFeeTable({
      days: spec.days,
      pricePerDay: spec.pricePerDay!,
    });
  };

  return Promise.all(
    raw.questions.map(async (q) => {
      const calc = q.lateFee ? await lateFeeCalc(q.lateFee) : undefined;
      const mustInclude = await Promise.all(q.mustInclude.map(resolve));
      if (calc) mustInclude.push(stripDong(formatVnd(calc.total)));
      return {
        ...q,
        mustInclude,
        mustNotInclude: await Promise.all(q.mustNotInclude.map(resolve)),
        lateFeeCalc: calc,
      };
    }),
  );
}

/** Có chữ số → so khớp nguyên văn (không phân biệt hoa thường); toàn chữ → so khớp thêm bản bỏ dấu. */
function containsKeyword(answer: string, keyword: string): boolean {
  const lower = answer.toLowerCase();
  if (lower.includes(keyword.toLowerCase())) return true;
  if (/\d/.test(keyword)) return false;
  return ` ${normalizeVi(answer)} `.includes(` ${normalizeVi(keyword)} `);
}

export function grade(question: EvalQuestion, result: AskResult) {
  const missing = question.mustInclude.filter(
    (keyword) =>
      !keyword
        .split('|')
        .some((option) => containsKeyword(result.answer, option)),
  );
  const forbidden = question.mustNotInclude.filter((keyword) =>
    containsKeyword(result.answer, keyword),
  );
  if (
    question.lateFeeCalc &&
    checkLateFeeAnswer(result.answer, question.lateFeeCalc) === 'wrong-total'
  ) {
    forbidden.push('dòng "tổng" ra số khác tổng đúng');
  }
  const passed =
    !result.error && missing.length === 0 && forbidden.length === 0;
  return { passed, missing, forbidden };
}

export function environmentInfo(model: string): string[] {
  const lines = [`- Model: \`${model}\``];
  try {
    const gpu = execSync(
      'nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader',
      { encoding: 'utf8' },
    ).trim();
    lines.push(`- GPU: ${gpu}`);
  } catch {
    lines.push('- GPU: không đọc được (nvidia-smi không có)');
  }
  try {
    const ps = execSync('ollama ps', { encoding: 'utf8' }).trim().split('\n');
    if (ps[1]) lines.push(`- \`ollama ps\`: \`${ps[1].replace(/\s+/g, ' ')}\``);
  } catch {
    // ollama CLI không có trong PATH — bỏ qua.
  }
  lines.push(`- Node ${process.version}, ${process.platform}`);
  return lines;
}

export function writeDoc(fileName: string, content: string): string {
  const path = join(DOCS_DIR, fileName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

export function escapeCell(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, ' ')
    .trim();
}
