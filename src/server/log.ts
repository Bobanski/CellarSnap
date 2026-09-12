/**
 * Tiny leveled logger — a single place to attach real error monitoring
 * (e.g. Sentry) later without touching every call site again.
 *
 * Today this is console-based, matching Vercel's own Runtime Logs, which
 * already capture stdout/stderr with no extra setup (eng audit M3, step 1).
 * A full Sentry install is deliberately deferred — see
 * docs/audits/overhaul-plan.md "Deferred" (full Sentry setup needs an
 * account/DSN) — but every call here funnels through `report()`, which is
 * the one place that hook would be added, env-gated behind SENTRY_DSN.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
};

function report(entry: LogEntry) {
  // Placeholder hook for future crash reporting. Intentionally a no-op:
  // wiring `@sentry/nextjs` here behind `process.env.SENTRY_DSN` is the
  // planned next step once an account/DSN exists.
  void entry;
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context } : {}),
  };

  switch (level) {
    case "debug":
      // Keep debug noise out of production logs unless explicitly enabled.
      if (process.env.DEBUG) {
        console.debug(`[debug] ${message}`, context ?? "");
      }
      break;
    case "info":
      console.log(`[info] ${message}`, context ?? "");
      break;
    case "warn":
      console.warn(`[warn] ${message}`, context ?? "");
      break;
    case "error":
      console.error(`[error] ${message}`, context ?? "");
      break;
  }

  report(entry);
}

export const log = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
