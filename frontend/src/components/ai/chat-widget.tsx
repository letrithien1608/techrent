"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageCircle, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { AiChatError, fetchAiHealth, streamAiChat, type ChatTurn } from "@/lib/ai-chat-api";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "./chat-markdown";

interface ChatMessage extends ChatTurn {
  id: string;
  /** Tin nhắn báo lỗi (429/503/mất mạng) — hiện khác màu và KHÔNG gửi lại làm lịch sử. */
  isError?: boolean;
}

const STORAGE_KEY = "techrent-ai-chat";
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_TURNS = 6;
const QUICK_QUESTIONS = [
  "Cọc được hoàn lại thế nào?",
  "Trả máy trễ bị phạt bao nhiêu?",
  "Máy bị lỗi khi đang thuê thì sao?",
  "Cần giấy tờ gì để thuê?",
  "Gợi ý laptop để làm đồ họa",
];
/** Trang không hiện nút chat: khu quản trị và các trang đăng nhập/đăng ký (form ngắn, nút nổi dễ che). */
const HIDDEN_PREFIXES = ["/admin", "/login", "/register", "/forgot-password", "/reset-password"];

// sessionStorage có thể bị chặn (chế độ riêng tư, chặn cookie) — luôn bọc try/catch.
function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Không lưu được thì thôi — lịch sử chỉ là tiện ích trong phiên.
  }
}

const newId = () => Math.random().toString(36).slice(2);

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const health = useQuery({
    queryKey: ["ai-health"],
    queryFn: fetchAiHealth,
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });
  const unavailable = health.data ? !health.data.available : health.isError;

  useEffect(() => {
    saveMessages(messages);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Đóng panel/chuyển trang khác thì huỷ câu trả lời đang chạy.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;
  // Trang chi tiết thiết bị có thanh đặt thuê cố định ở đáy màn hình mobile — đẩy nút lên trên nó.
  const raised = /^\/devices\/[^/]+$/.test(pathname ?? "");

  async function send(text: string) {
    const message = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message || streaming) return;

    const history: ChatTurn[] = messages
      .filter((m) => !m.isError && m.content)
      .slice(-HISTORY_TURNS)
      .map(({ role, content }) => ({ role, content }));
    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: message },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? patch(m) : m)));

    try {
      await streamAiChat({
        message,
        history,
        signal: controller.signal,
        onToken: (token) => update((m) => ({ ...m, content: m.content + token })),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        update((m) => ({ ...m, content: m.content ? `${m.content}\n\n(đã dừng)` : "(đã dừng)" }));
      } else {
        const text =
          error instanceof AiChatError ? error.message : "Trợ lý gặp sự cố, bạn thử lại sau nhé.";
        update((m) => ({ ...m, content: text, isError: true }));
        void health.refetch();
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
  }

  const last = messages[messages.length - 1];
  const waitingFirstToken = streaming && last?.role === "assistant" && !last.content;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="chat-fab"
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpen(true)}
            aria-label="Mở Trợ lý AI TechRent"
            className={cn(
              "fixed right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 sm:right-6",
              raised ? "bottom-24 lg:bottom-6" : "bottom-4 sm:bottom-6",
            )}
          >
            <MessageCircle className="size-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            key="chat-panel"
            role="dialog"
            aria-label="Trợ lý AI TechRent"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-0 z-[60] flex flex-col bg-background sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(620px,calc(100vh-6rem))] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl sm:shadow-black/30"
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-400 text-primary-foreground">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Trợ lý TechRent</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      unavailable ? "bg-amber-400" : health.data ? "bg-emerald-400" : "bg-muted-foreground",
                    )}
                  />
                  {unavailable ? "Đang bảo trì" : health.data ? "Sẵn sàng tư vấn" : "Đang kết nối..."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                disabled={messages.length === 0}
                aria-label="Xoá hội thoại"
              >
                <Trash2 />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Đóng trợ lý">
                <X />
              </Button>
            </header>

            <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
              <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5">
                Chào bạn 👋 Mình là trợ lý AI của TechRent. Mình có thể giải đáp về tiền cọc, phí trễ hạn,
                quy trình thuê, xử lý sự cố và gợi ý thiết bị phù hợp.
              </div>

              {unavailable && (
                <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-amber-200">
                  <Wrench className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Trợ lý đang bảo trì. Bạn vui lòng liên hệ nhân viên TechRent để được hỗ trợ trực tiếp nhé.
                  </span>
                </div>
              )}

              {messages.length === 0 && !unavailable && (
                <div className="flex flex-wrap gap-2">
                  {QUICK_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void send(question)}
                      className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-primary/15"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) =>
                message.role === "user" ? (
                  <div
                    key={message.id}
                    className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 whitespace-pre-wrap text-primary-foreground"
                  >
                    {message.content}
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className={cn(
                      "w-fit max-w-[92%] rounded-2xl rounded-tl-sm px-3.5 py-2.5",
                      message.isError
                        ? "border border-destructive/40 bg-destructive/10 text-destructive"
                        : "bg-muted/60",
                    )}
                  >
                    {message.content ? (
                      <ChatMarkdown text={message.content} />
                    ) : (
                      <TypingDots />
                    )}
                  </div>
                ),
              )}

              {streaming && !waitingFirstToken && (
                <p className="animate-pulse text-xs text-muted-foreground">Trợ lý đang trả lời...</p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-border px-3 pt-3 pb-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={1}
                  disabled={unavailable}
                  placeholder={unavailable ? "Trợ lý đang bảo trì" : "Hỏi về thuê thiết bị..."}
                  aria-label="Câu hỏi cho trợ lý"
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/25 disabled:opacity-50 field-sizing-content"
                />
                {streaming ? (
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="outline"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Dừng trả lời"
                  >
                    <Square className="fill-current" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon-lg" disabled={!input.trim() || unavailable} aria-label="Gửi câu hỏi">
                    <Send />
                  </Button>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Trợ lý AI có thể nhầm lẫn, vui lòng xác nhận với nhân viên cho các vấn đề quan trọng.
                </span>
                {input.length > MAX_MESSAGE_LENGTH - 100 && (
                  <span className="shrink-0">
                    {input.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="Đang trả lời">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
