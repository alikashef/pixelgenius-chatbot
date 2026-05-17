"use client";

interface Props {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble({ role, content }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-white border border-border text-slate-900 shadow-sm"
            : "bg-emerald-600 text-white font-medium shadow-sm"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
