"use client";

import { IconFileText } from "@tabler/icons-react";
import { OrderFile } from "@/lib/api";

interface Props {
  role: "user" | "assistant";
  content: string;
  attachments?: OrderFile[];
}

function isImage(file: OrderFile) {
  return file.content_type?.startsWith("image/");
}

export default function ChatBubble({ role, content, attachments = [] }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex items-end gap-2.5 mb-4 ${isUser ? "justify-start" : "justify-end"}`}>
      {!isUser && (
        <span className="mb-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[--violet] text-[10px] font-black text-white shadow-lg shadow-[--violet-glow]">
          AI
        </span>
      )}
      <div
        className={`max-w-[78%] overflow-hidden rounded-2xl text-sm leading-7 ${
          isUser
            ? "bg-[--violet] text-white rounded-tr-sm shadow-md shadow-[--violet-glow]"
            : "bg-[--surface-2] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] rounded-tl-sm"
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex max-w-full flex-col gap-2 p-2 pb-0">
            {attachments.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className={`block overflow-hidden rounded-xl ${
                  isImage(file) ? "border border-white/15 bg-black/10" : "border border-white/15 bg-black/10 px-3 py-2"
                }`}
              >
                {isImage(file) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt={file.name} className="max-h-56 w-full object-cover" />
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    <IconFileText size={18} className="shrink-0" />
                    <span className="truncate text-xs font-semibold">{file.name}</span>
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
        {content && <div className="whitespace-pre-wrap px-4 py-3">{content}</div>}
      </div>
    </div>
  );
}
