import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-2 text-sm text-zinc-300"
      role="status"
      aria-label="Pocket Sommelier is responding"
    >
      <span className="sr-only">Pocket Sommelier is responding</span>
      {[0, 1, 2].map((index) => (
        <span
          // Stagger the pulse to make the waiting state obvious before the first token arrives.
          key={index}
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-200/80"
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
        className={`max-w-3xl rounded-[1.75rem] border px-5 py-4 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.9)] ${
          isAssistant
            ? "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] text-zinc-100"
            : "border-amber-300/35 bg-[linear-gradient(180deg,rgba(251,191,36,0.20),rgba(146,64,14,0.20))] text-amber-50"
        }`}
      >
        <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-zinc-400">
          {isAssistant ? "Pocket Sommelier" : "You"}
        </p>
        {isAssistant && isStreaming && content.trim().length === 0 ? (
          <TypingIndicator />
        ) : (
          <div className="text-sm leading-7 text-current">
            <ReactMarkdown
              rehypePlugins={[rehypeSanitize]}
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
                ),
                li: ({ children }) => <li className="pl-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-zinc-50">{children}</strong>,
                em: ({ children }) => <em className="italic text-zinc-100">{children}</em>,
                code: ({ children }) => (
                  <code className="rounded-md bg-black/30 px-1.5 py-0.5 text-[0.9em] text-amber-100">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-200 underline decoration-amber-200/40 underline-offset-4 transition hover:text-amber-100"
                  >
                    {children}
                  </a>
                ),
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
