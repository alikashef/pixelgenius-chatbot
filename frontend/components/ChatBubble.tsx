"use client";

interface Props {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble({ role, content }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex items-end gap-2.5 mb-4 ${isUser ? "justify-start" : "justify-end"}`}>
      {!isUser && (
        <span className="mb-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[--violet] text-[10px] font-black text-white shadow-lg shadow-[--violet-glow]">
          AI
        </span>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap ${
          isUser
            ? "bg-[--violet] text-white rounded-tr-sm shadow-md shadow-[--violet-glow]"
            : "bg-[--surface-2] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] rounded-tl-sm"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
