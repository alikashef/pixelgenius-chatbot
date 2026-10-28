"use client";

import { Fragment, ReactNode } from "react";
import { IconFileText } from "@tabler/icons-react";
import { BrandMark } from "@/components/Brand";
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
      <strong key={i} className="font-bold text-foreground">
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
        <Tag key={blockIndex} className={`space-y-1.5 pr-5 ${numbered ? "list-decimal" : "list-disc"} marker:text-brand`}>
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
  const files = attachments.length > 0 && (
    <div className={`flex max-w-full flex-col gap-2 ${isUser ? "p-2 pb-0" : "mb-3"}`}>
      {attachments.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className={`block overflow-hidden rounded-lg border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isImage(file) ? "" : "px-3 py-2"
          }`}
        >
          {isImage(file) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt={file.name} className="max-h-56 w-full object-cover" />
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <IconFileText size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-xs font-bold">{file.name}</span>
            </span>
          )}
        </a>
      ))}
    </div>
  );

  if (isUser) {
    return (
      <div className="mb-6 flex justify-start motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
        <div className="max-w-[85%] overflow-hidden rounded-2xl rounded-tr-md bg-surface-2 text-[15px] leading-7 text-foreground sm:max-w-[75%]">
          {files}
          {content && <p className="whitespace-pre-wrap px-4 py-2.5">{content}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-7 flex items-start gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <BrandMark size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-3 pt-1 text-[15px] leading-8 text-foreground">
        {files}
        {content && renderRichText(content)}
      </div>
    </div>
  );
}
