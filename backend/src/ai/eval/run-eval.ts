// npm run ai:eval [-- --label "mô tả lần chạy"] [-- --repeat 3]
// Chạy toàn bộ questions.json với Ollama thật, chấm đạt/không đạt theo từ khoá,
// xuất docs/ai-eval-result.md. `--repeat N` hỏi mỗi câu N lần (model có tính
// ngẫu nhiên — temperature > 0 — nên 1 lượt đơn lẻ dao động ±1-2 câu). Lịch sử
// các lần chạy lưu ở docs/ai-eval-history.json để so sánh trước–sau khi chỉnh
// prompt/kiến thức.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AI_CONFIG, type AiConfig } from '../ai.config';
import { AiService } from '../ai.service';
import {
  ask,
  type AskResult,
  createContext,
  DOCS_DIR,
  environmentInfo,
  escapeCell,
  grade,
  loadQuestions,
  writeDoc,
} from './eval-common';

const AMOUNT_PATTERN = /\d{1,3}(?:\.\d{3})+/g;

function findUnknownAmounts(answer: string, allowedSource: string): string[] {
  const allowed = new Set(allowedSource.match(AMOUNT_PATTERN) ?? []);
  return [...new Set(answer.match(AMOUNT_PATTERN) ?? [])].filter(
    (amount) => !allowed.has(amount),
  );
}

interface HistoryEntry {
  at: string;
  label: string;
  passed: number;
  total: number;
  /** Số lượt hỏi mỗi câu (không có ở các lần chạy cũ = 1). */
  repeat?: number;
  failedIds: string[];
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const percent = (passed: number, total: number) =>
  `${((passed / total) * 100).toFixed(1)}%`;

async function main() {
  const label = argValue('--label') ?? 'không ghi chú';
  const repeat = Math.max(1, Number(argValue('--repeat') ?? 1));
  const app = await createContext();
  const ai = app.get(AiService);
  const config = app.get<AiConfig>(AI_CONFIG);
  const questions = await loadQuestions(app);

  console.log(`Làm nóng model ${config.model}...`);
  await ask(ai, 'Xin chào');

  const rows: string[] = [];
  const details: string[] = [];
  const byGroup = new Map<string, { passed: number; total: number }>();
  const failedIds: string[] = [];
  let passed = 0;
  let attemptsWithUnknownAmounts = 0;

  for (const question of questions) {
    const { references } = await ai.buildReferences(question.question);
    let questionPassed = 0;
    let shown: { result: AskResult; note: string; passed: boolean } | null =
      null;
    const notes: string[] = [];
    const unknownAmounts = new Set<string>();
    let totalMs = 0;

    for (let attempt = 0; attempt < repeat; attempt++) {
      const result = await ask(ai, question.question);
      totalMs += result.stats?.totalMs ?? 0;
      // Chỉ số phụ (không tính vào đạt/trượt): số tiền trong câu trả lời nhưng
      // KHÔNG có trong phần tham khảo/câu hỏi — dấu hiệu model tự tính hoặc lẫn số.
      const unknown = findUnknownAmounts(
        result.answer,
        `${references}\n${question.question}`,
      );
      unknown.forEach((amount) => unknownAmounts.add(amount));
      if (unknown.length > 0) attemptsWithUnknownAmounts++;

      const verdict = grade(question, result);
      const note = [
        result.error ? `lỗi: ${result.error}` : '',
        verdict.missing.length ? `thiếu: ${verdict.missing.join(', ')}` : '',
        verdict.forbidden.length
          ? `có từ cấm: ${verdict.forbidden.join(', ')}`
          : '',
        result.stats?.guardrail
          ? `lớp chặn server: ${result.stats.guardrail}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');
      if (verdict.passed) questionPassed++;
      if (note) notes.push(note);
      // Ưu tiên giữ lại 1 câu trả lời TRƯỢT để xem lỗi, không có thì lấy lượt đầu.
      if (!shown || (!verdict.passed && shown.passed)) {
        shown = { result, note, passed: verdict.passed };
      }
    }

    passed += questionPassed;
    if (questionPassed < repeat)
      failedIds.push(`${question.id} (${questionPassed}/${repeat})`);
    const group = byGroup.get(question.group) ?? { passed: 0, total: 0 };
    group.total += repeat;
    group.passed += questionPassed;
    byGroup.set(question.group, group);

    const uniqueNotes = [...new Set(notes)].join(' / ');
    console.log(
      `${question.id}: ${questionPassed}/${repeat} đạt ${uniqueNotes}`,
    );
    rows.push(
      `| ${question.id} | ${question.group} | ${escapeCell(question.question)} | ${questionPassed === repeat ? '✅' : questionPassed === 0 ? '❌' : '⚠️'} ${questionPassed}/${repeat} | ${escapeCell(uniqueNotes) || '—'} | ${[...unknownAmounts].join(', ') || '—'} | ${Math.round(totalMs / repeat)} |`,
    );
    details.push(
      `### ${question.id} — ${question.question}\n\n` +
        `- Bắt buộc có: ${question.mustInclude.map((k) => `\`${k}\``).join(', ') || '—'}\n` +
        `- Cấm có: ${question.mustNotInclude.map((k) => `\`${k}\``).join(', ') || '—'}\n` +
        `- Kết quả: ${questionPassed}/${repeat} lượt đạt. Câu trả lời ${shown!.passed ? 'mẫu' : `của 1 lượt trượt (${shown!.note})`}:\n\n` +
        `> ${(shown!.result.answer || shown!.result.error || '(trống)').replace(/\n/g, '\n> ')}\n`,
    );
  }

  const total = questions.length * repeat;
  const historyPath = join(DOCS_DIR, 'ai-eval-history.json');
  const history: HistoryEntry[] = existsSync(historyPath)
    ? (JSON.parse(readFileSync(historyPath, 'utf8')) as HistoryEntry[])
    : [];
  history.push({
    at: new Date().toISOString(),
    label,
    passed,
    total,
    repeat,
    failedIds,
  });
  writeDoc('ai-eval-history.json', `${JSON.stringify(history, null, 2)}\n`);

  const doc = [
    '# Đánh giá chất lượng Trợ lý AI TechRent',
    '',
    `Sinh tự động bởi \`npm run ai:eval\` lúc ${new Date().toLocaleString('vi-VN')}. Chấm theo từ khoá: câu trả lời phải chứa MỌI từ khoá bắt buộc (\`a|b\` = một trong các cách diễn đạt) và KHÔNG chứa từ khoá cấm. Số liệu tiền/% được lấy từ \`business-policy.ts\` và DB lúc chạy, không chép tay. Mỗi câu hỏi ${repeat} lượt.`,
    '',
    ...environmentInfo(config.model),
    `- Tham số: temperature=${config.temperature}, num_ctx=${config.numCtx}, top_p=0.9, repeat_penalty=1.1, num_predict=512`,
    '',
    `## Tổng kết: ${passed}/${total} lượt đạt (${percent(passed, total)}) — ${questions.length} câu × ${repeat} lượt`,
    '',
    `Chỉ số phụ: ${attemptsWithUnknownAmounts}/${total} lượt trả lời có số tiền KHÔNG xuất hiện trong phần tham khảo (model tự tính hoặc lẫn số — xem cột tương ứng bên dưới; không tính vào đạt/trượt vì có thể là phép tính đúng, VD phạt riêng ngày thứ 2).`,
    '',
    '| Nhóm | Đạt | Tỷ lệ |',
    '| --- | --- | --- |',
    ...[...byGroup].map(
      ([name, g]) =>
        `| ${name} | ${g.passed}/${g.total} | ${percent(g.passed, g.total)} |`,
    ),
    '',
    '## Lịch sử các lần chạy (trước – sau khi tinh chỉnh)',
    '',
    '| Thời điểm | Ghi chú | Lượt/câu | Kết quả | Câu trượt |',
    '| --- | --- | --- | --- | --- |',
    ...history.map(
      (h) =>
        `| ${new Date(h.at).toLocaleString('vi-VN')} | ${escapeCell(h.label)} | ${h.repeat ?? 1} | ${h.passed}/${h.total} (${percent(h.passed, h.total)}) | ${h.failedIds.join(', ') || '—'} |`,
    ),
    '',
    '## Kết quả từng câu',
    '',
    '| ID | Nhóm | Câu hỏi | Đạt | Ghi chú (các lượt trượt) | Số tiền không có trong tham khảo | Thời gian TB (ms) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Câu trả lời chi tiết',
    '',
    ...details,
  ].join('\n');
  const path = writeDoc('ai-eval-result.md', doc);
  console.log(
    `\nTỷ lệ đạt: ${passed}/${total} (${percent(passed, total)}) → ${path}`,
  );
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
