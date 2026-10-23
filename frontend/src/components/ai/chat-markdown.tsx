import { Fragment, type ReactNode } from "react";

/**
 * Render markdown TỐI GIẢN cho câu trả lời của trợ lý: **in đậm**, gạch đầu
 * dòng ("- ", "* ", "1. ") và xuống dòng. Dựng thẳng thành phần tử React —
 * KHÔNG dùng dangerouslySetInnerHTML, nên model có sinh ra thẻ HTML thì cũng
 * chỉ hiện dưới dạng chữ, không thể chèn script/HTML vào trang.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="ml-4 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-4 list-disc space-y-0.5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    if (line) {
      blocks.push(<p key={blocks.length}>{renderInline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flushList();

  return <div className="space-y-2 break-words">{blocks}</div>;
}

function renderInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
