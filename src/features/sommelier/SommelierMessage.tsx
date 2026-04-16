"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
      role="status"
      aria-label="Pocket Sommelier is responding"
    >
      <span className="sr-only">Pocket Sommelier is responding</span>
      {[0, 1, 2].map((index) => (
        <span
          // Stagger the pulse to make the waiting state obvious before the first token arrives.
          key={index}
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-accent-secondary)]/80"
          style={{ animationDelay: `${index * 180}ms` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function SommelierMessage({
  role,
  content,
  isStreaming = false,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}) {
  const isAssistant = role === "assistant";

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        style={{
          padding: "10px 13px",
          fontSize: "11px",
          lineHeight: 1.65,
          maxWidth: isAssistant ? "78%" : "88%",
          borderRadius: isAssistant
            ? "14px 14px 14px 3px"
            : "14px 14px 3px 14px",
          ...(isAssistant
            ? {
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }
            : {
                background: "var(--color-accent-primary)",
                color: "var(--color-text-on-accent)",
              }),
        }}
      >
        {isAssistant && isStreaming && content.trim().length === 0 ? (
          <TypingIndicator />
        ) : (
          <div className="text-current">
            <ReactMarkdown
              rehypePlugins={[rehypeSanitize]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-2 text-[1.05rem] font-semibold leading-tight text-[var(--color-text-primary)] last:mb-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-2 text-[0.98rem] font-semibold leading-tight text-[var(--color-text-primary)] last:mb-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-2 text-[0.94rem] font-semibold leading-tight text-[var(--color-text-primary)] last:mb-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
                ),
                li: ({ children }) => <li className="pl-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
                em: ({ children }) => <em className="italic text-[var(--color-text-primary)]">{children}</em>,
                code: ({ children }) => (
                  <code className="rounded-md bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[0.9em] text-[var(--color-accent-secondary)]">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => {
                  const linkClassName =
                    "text-[var(--color-accent-secondary)] underline decoration-[var(--color-accent-secondary)]/40 underline-offset-4 transition hover:text-[var(--color-accent-secondary)]";
                  if (href?.startsWith("/")) {
                    return (
                      <Link href={href} className={linkClassName}>
                        {children}
                      </Link>
                    );
                  }
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={linkClassName}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
