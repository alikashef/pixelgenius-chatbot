"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import ChatBubble from "@/components/ChatBubble";
import { sendChat, Message, Proposal } from "@/lib/api";

const WELCOME: Message = {
  role: "assistant",
  content:
    "سلام! خوش اومدید 👋\nمن مشاور هوشمند تیم توسعه وب هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      // Only send non-welcome messages to API
      const apiMessages = newMessages.filter((m) => !(m === WELCOME));
      const reply = await sendChat(apiMessages);

      // Check if reply is a proposal JSON
      const trimmed = reply.trim();
      if (trimmed.startsWith("{") && trimmed.includes('"type": "proposal"')) {
        try {
          const proposal: Proposal = JSON.parse(trimmed);
          localStorage.setItem("proposal", JSON.stringify(proposal));
          router.push("/proposal");
          return;
        } catch {
          // not valid JSON, treat as normal message
        }
      }

      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
        <span className="font-semibold text-gray-100">مشاور پروژه</span>
        <span className="text-muted text-xs mr-auto">آنلاین</span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl w-full mx-auto">
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}
        {loading && (
          <div className="flex justify-end mb-4">
            <div className="bg-accent rounded-2xl px-5 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-black opacity-60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="text-red-400 text-center text-sm mb-4">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-4 md:px-8 py-4 max-w-3xl w-full mx-auto"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="پیام خود را بنویسید..."
            disabled={loading}
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-muted outline-none focus:border-accent transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-xl px-5 py-3 text-sm transition-colors"
          >
            ارسال
          </button>
        </div>
      </form>
    </div>
  );
}
