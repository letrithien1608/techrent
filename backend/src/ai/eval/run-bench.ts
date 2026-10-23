// npm run ai:bench [-- --runs 3]
// Chạy mỗi câu trong questions.json N lần (mặc định 3) với Ollama thật, đo
// TTFT, tổng thời gian, token/giây (eval_count/eval_duration do Ollama trả về),
// xuất docs/ai-benchmark.md kèm thông tin GPU/model.
import { AI_CONFIG, type AiConfig } from '../ai.config';
import { AiService } from '../ai.service';
import {
  ask,
  createContext,
  environmentInfo,
  escapeCell,
  loadQuestions,
  writeDoc,
} from './eval-common';

interface Sample {
  ttftMs: number;
  totalMs: number;
  tokensPerSecond: number;
  evalCount: number;
  promptTokens: number;
}

function summarize(values: number[]) {
  if (values.length === 0) return { avg: NaN, min: NaN, max: NaN };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

const fmt = (value: number, digits = 0) =>
  Number.isNaN(value)
    ? '—'
    : value.toLocaleString('vi-VN', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });

async function main() {
  const runsIndex = process.argv.indexOf('--runs');
  const runs = runsIndex > 0 ? Number(process.argv[runsIndex + 1]) : 3;
  const app = await createContext();
  const ai = app.get(AiService);
  const config = app.get<AiConfig>(AI_CONFIG);
  const questions = await loadQuestions(app);

  // Lần gọi đầu có thể phải nạp model vào GPU — làm nóng trước, không tính vào số đo.
  console.log(`Làm nóng model ${config.model}...`);
  const warm = await ask(ai, 'Xin chào');
  console.log(`Lần gọi làm nóng: ${warm.stats?.totalMs ?? '?'}ms`);

  const all: Sample[] = [];
  const rows: string[] = [];
  let failures = 0;
  for (const question of questions) {
    const samples: Sample[] = [];
    for (let i = 0; i < runs; i++) {
      const { stats, error } = await ask(ai, question.question);
      if (
        error ||
        !stats ||
        stats.ttftMs === null ||
        stats.tokensPerSecond === null
      ) {
        failures++;
        continue;
      }
      samples.push({
        ttftMs: stats.ttftMs,
        totalMs: stats.totalMs,
        tokensPerSecond: stats.tokensPerSecond,
        evalCount: stats.evalCount,
        promptTokens: stats.promptTokens ?? 0,
      });
    }
    all.push(...samples);
    const ttft = summarize(samples.map((s) => s.ttftMs));
    const total = summarize(samples.map((s) => s.totalMs));
    const tps = summarize(samples.map((s) => s.tokensPerSecond));
    const tokens = summarize(samples.map((s) => s.evalCount));
    const prompt = summarize(samples.map((s) => s.promptTokens));
    console.log(
      `${question.id}: TTFT ${fmt(ttft.avg)}ms, tổng ${fmt(total.avg)}ms, ${fmt(tps.avg, 1)} tok/s`,
    );
    rows.push(
      `| ${question.id} | ${escapeCell(question.question)} | ${samples.length}/${runs} | ${fmt(prompt.avg)} | ${fmt(ttft.avg)} (${fmt(ttft.min)}–${fmt(ttft.max)}) | ${fmt(total.avg)} (${fmt(total.min)}–${fmt(total.max)}) | ${fmt(tokens.avg)} | ${fmt(tps.avg, 1)} (${fmt(tps.min, 1)}–${fmt(tps.max, 1)}) |`,
    );
  }

  const overall = {
    ttft: summarize(all.map((s) => s.ttftMs)),
    total: summarize(all.map((s) => s.totalMs)),
    tps: summarize(all.map((s) => s.tokensPerSecond)),
    tokens: summarize(all.map((s) => s.evalCount)),
    prompt: summarize(all.map((s) => s.promptTokens)),
  };
  const doc = [
    '# Đo hiệu năng Trợ lý AI TechRent (LLM local qua Ollama)',
    '',
    `Sinh tự động bởi \`npm run ai:bench\` lúc ${new Date().toLocaleString('vi-VN')}. Mỗi câu trong \`src/ai/eval/questions.json\` chạy ${runs} lần, tuần tự (1 request tại 1 thời điểm), model đã được làm nóng trước. Đo trong-process (gọi thẳng AiService, gồm cả bước tra kiến thức + DB), không tính độ trễ mạng HTTP tới trình duyệt.`,
    '',
    ...environmentInfo(config.model),
    `- Tham số: temperature=${config.temperature}, num_ctx=${config.numCtx}, num_predict=512, keep_alive=${config.keepAlive}`,
    '',
    '- **TTFT** (time to first token): từ lúc nhận câu hỏi tới khi có chữ đầu tiên — gồm tra kiến thức, truy vấn DB và Ollama xử lý prompt.',
    '- **Tổng thời gian**: tới khi câu trả lời kết thúc.',
    '- **Token/giây**: `eval_count / eval_duration` do Ollama trả về (chỉ tính giai đoạn sinh chữ).',
    '',
    `## Tổng hợp (${all.length} lượt hợp lệ, ${failures} lượt lỗi hoặc do lớp chặn server trả lời cố định (không qua model) bị loại)`,
    '',
    '| Chỉ số | Trung bình | Nhỏ nhất | Lớn nhất |',
    '| --- | --- | --- | --- |',
    `| TTFT (ms) | ${fmt(overall.ttft.avg)} | ${fmt(overall.ttft.min)} | ${fmt(overall.ttft.max)} |`,
    `| Tổng thời gian (ms) | ${fmt(overall.total.avg)} | ${fmt(overall.total.min)} | ${fmt(overall.total.max)} |`,
    `| Token/giây | ${fmt(overall.tps.avg, 1)} | ${fmt(overall.tps.min, 1)} | ${fmt(overall.tps.max, 1)} |`,
    `| Số token sinh ra | ${fmt(overall.tokens.avg)} | ${fmt(overall.tokens.min)} | ${fmt(overall.tokens.max)} |`,
    `| Số token prompt | ${fmt(overall.prompt.avg)} | ${fmt(overall.prompt.min)} | ${fmt(overall.prompt.max)} |`,
    '',
    '## Chi tiết từng câu — trung bình (min–max)',
    '',
    '| ID | Câu hỏi | Lượt hợp lệ | Token prompt | TTFT ms | Tổng ms | Token sinh | Token/giây |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  const path = writeDoc('ai-benchmark.md', doc);
  console.log(
    `\nTTFT TB ${fmt(overall.ttft.avg)}ms, tổng TB ${fmt(overall.total.avg)}ms, ${fmt(overall.tps.avg, 1)} tok/s → ${path}`,
  );
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
