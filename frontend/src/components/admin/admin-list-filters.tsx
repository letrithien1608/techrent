"use client";

import { cn } from "cn";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { SearchX, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Ô tìm có debounce. Giá trị gốc nằm trên URL (`value`): khi URL đổi từ bên
 * ngoài (Xoá bộ lọc, nút Back) thì ô tìm theo, trừ khi người dùng đang gõ dở.
 */
export function AdminSearchInput({
  value,
  onSearch,
  placeholder,
  className,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (text.trim() === syncedValue) setText(value);
  }
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === value) return;
    const timer = setTimeout(() => onSearchRef.current(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        maxLength={100}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          aria-label="Xoá từ khoá"
          onClick={() => {
            setText("");
            onSearchRef.current("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Bộ lọc: hiện thẳng trên màn hình rộng, gom vào nút "Bộ lọc" (hộp thoại)
 * trên điện thoại. `children` render ở cả 2 chỗ — giá trị lấy từ URL nên
 * luôn khớp nhau.
 */
export function AdminFilterPanel({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 md:flex">{children}</div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button variant="outline" size="sm" className="h-9 md:hidden" />}
        >
          <SlidersHorizontal />
          Bộ lọc
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bộ lọc</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 [&_[data-slot=select-trigger]]:w-full [&_input]:w-full">
            {children}
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Xoá bộ lọc
            </Button>
            <Button onClick={() => setOpen(false)}>Xem kết quả</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Công tắc bật/tắt 1 bộ lọc (VD "Chỉ đơn còn nợ"). */
export function FilterSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-9 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/60 px-3 text-sm whitespace-nowrap">
      {label}
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/** "Tìm thấy N đơn" + nút "Xoá bộ lọc" (chỉ hiện khi đang lọc). */
export function ResultSummary({
  total,
  unit,
  loading,
  filtered,
  onClear,
}: {
  total: number | undefined;
  unit: string;
  loading: boolean;
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {loading || total === undefined ? (
          "Đang tìm..."
        ) : (
          <>
            {filtered ? "Tìm thấy " : "Tổng cộng "}
            <span className="font-semibold text-foreground">
              {total.toLocaleString("vi-VN")}
            </span>{" "}
            {unit}
          </>
        )}
      </p>
      {filtered && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Xoá bộ lọc
        </Button>
      )}
    </div>
  );
}

/** Trạng thái trống khi đang lọc mà không có kết quả. */
export function NoResults({ message, onClear }: { message: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <SearchX className="size-10 text-muted-foreground/40" />
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onClear}>
        Xoá bộ lọc
      </Button>
    </div>
  );
}

/** Chuỗi so khớp: bỏ dấu (kể cả đ), chữ thường — giống f_unaccent ở backend. */
function fold(char: string): string {
  return char
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function searchTokens(query: string): string[] {
  const text = query.trim();
  if (!text) return [];
  const compact = text.replace(/[\s.\-()]/g, "");
  if (/^\+?\d{3,}$/.test(compact)) {
    return [compact.startsWith("+84") ? `0${compact.slice(3)}` : compact.replace(/^\+/, "")];
  }
  return text
    .split(/\s+/)
    .map((token) => fold(token.replace(/^#/, "")))
    .filter(Boolean);
}

/** Tô sáng từ khoá trong `text`, không phân biệt hoa thường + dấu. */
export function HighlightText({ text, query }: { text: string | null | undefined; query: string }) {
  if (!text) return null;
  const tokens = searchTokens(query);
  if (!tokens.length) return <>{text}</>;

  const chars = Array.from(text);
  const starts: number[] = [];
  let folded = "";
  for (const char of chars) {
    starts.push(folded.length);
    folded += fold(char);
  }
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const token of tokens) {
    // Từ rất ngắn ("an") chỉ tô khi đứng đầu 1 từ, tránh tô lốm đốm giữa chữ ("Canon").
    const wordStartOnly = token.length < 3;
    let from = folded.indexOf(token);
    while (from !== -1) {
      const to = from + token.length;
      if (!wordStartOnly || from === 0 || !/[\p{L}\p{N}]/u.test(folded[from - 1])) {
        chars.forEach((char, i) => {
          if (starts[i] < to && starts[i] + fold(char).length > from) marked[i] = true;
        });
      }
      from = folded.indexOf(token, from + 1);
    }
  }
  if (!marked.includes(true)) return <>{text}</>;

  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((char, i) => {
    const last = parts[parts.length - 1];
    if (last && last.mark === marked[i]) last.text += char;
    else parts.push({ text: char, mark: marked[i] });
  });
  return (
    <>
      {parts.map((part, i) =>
        part.mark ? (
          <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
