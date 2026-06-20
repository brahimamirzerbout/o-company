// =============================================================================
// o.company · logger
// =============================================================================
// One JSON-lines logger for the whole company. Every line includes the
// service name, the request id (when in a request context), the actor
// (when known), and the message. Output is structured so we can ship
// straight to any aggregator (Loki, Datadog, CloudWatch).
//
// In development we pretty-print to stdout. In production we JSON-line it.

type Level = "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  [key: string]: unknown;
}

const SERVICE = process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "o-company";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
  fatal: 4,
};

const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(level: Level, msg: string, context: LogContext = {}) {
  if (!shouldLog(level)) return;
  const line = {
    ts:    new Date().toISOString(),
    level,
    service: SERVICE,
    env:   process.env.NODE_ENV ?? "development",
    msg,
    ...context,
  };
  if (process.env.NODE_ENV === "production") {
    process.stdout.write(JSON.stringify(line) + "\n");
  } else {
    const color = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", fatal: "\x1b[35m" }[level];
    process.stdout.write(`${color}[${level.toUpperCase()}]\x1b[0m ${line.ts} ${line.msg} ${Object.keys(context).length ? JSON.stringify(context) : ""}\n`);
  }
}

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
  fatal(msg: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function makeLogger(bound: LogContext): Logger {
  return {
    debug: (m, c) => emit("debug", m, { ...bound, ...c }),
    info:  (m, c) => emit("info",  m, { ...bound, ...c }),
    warn:  (m, c) => emit("warn",  m, { ...bound, ...c }),
    error: (m, c) => emit("error", m, { ...bound, ...c }),
    fatal: (m, c) => emit("fatal", m, { ...bound, ...c }),
    child: (c) => makeLogger({ ...bound, ...c }),
  };
}

export const logger: Logger = makeLogger({});

/** Time an operation and log the duration. */
export async function timed<T>(label: string, fn: () => Promise<T>, ctx?: LogContext): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.debug(`${label} ok`, { ...ctx, durationMs: Date.now() - start });
    return result;
  } catch (e) {
    logger.error(`${label} failed`, { ...ctx, durationMs: Date.now() - start, err: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
