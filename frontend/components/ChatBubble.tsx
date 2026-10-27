"use client";

import { Fragment, ReactNode } from "react";
import { IconFileText, IconSparkles } from "@tabler/icons-react";
import { OrderFile } from "@/lib/api";

interface Props {
  role: "user" | "assistant";
  content: string;
  attachments?: OrderFile[];
}

function isImage(file: OrderFile) {
  return file.content_type?.startsWith("image/");
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-bold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const LIST_ITEM = /^\s*(?:[-•*]|[0-9۰-۹]+[.)])\s+(.*)$/;

function renderRichText(content: string): ReactNode[] {
  const blocks = content.split(/\n{2,}/);
  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim());
    const items = lines.map((line) => line.match(LIST_ITEM));
    if (lines.length > 0 && items.every(Boolean)) {
      const numbered = /^\s*[0-9۰-۹]+[.)]/.test(lines[0]);
      const Tag = numbered ? "ol" : "ul";
      return (
        <Tag key={blockIndex} className={`space-y-1.5 pr-5 ${numbered ? "list-decimal" : "list-disc"} marker:text-violet-400`}>
          {items.map((m, i) => (
            <li key={i}>{renderInline(m![1])}</li>
          ))}
        </Tag>
      );
    }
    return (
      <p key={blockIndex} className="whitespace-pre-wrap">
        {renderInline(block)}
      </p>
    );
  });
}

export default function ChatBubble({ role, content, attachments = [] }: Props) {
  const isUser = role === "user";
  return (
    <div
      className={`mb-5 flex items-end gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 ${
        isUser ? "justify-start" : "justify-end"
      }`}
    >
      {!isUser && (
        <span
          aria-hidden="true"
          className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[--violet] text-white shadow-lg shadow-[--violet-glow]"
        >
          <IconSparkles size={15} stroke={2.2} />
        </span>
      )}
      <div
        className={`max-w-[85%] overflow-hidden rounded-2xl text-[15px] leading-7 sm:max-w-[78%] ${
          isUser
            ? "rounded-br-md bg-[--violet] text-white shadow-md shadow-[--violet-glow]"
            : "rounded-bl-md border border-[hsl(var(--border))] bg-[--surface-2] text-[hsl(var(--foreground))]"
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
                className={`block overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
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
        {content && (
          <div className="space-y-3 px-4 py-3">{isUser ? <p className="whitespace-pre-wrap">{content}</p> : renderRichText(content)}</div>
        )}
      </div>
    </div>
  );
}
