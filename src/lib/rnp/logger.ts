/**
 * Structured server-side logging for the RNP Digital scraper pipeline.
 * Logs are emitted to stdout (Node console) and forwarded to an optional
 * NDJSON stream callback so API routes can stream progress to clients.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

const SCOPES = new Set<string>();
let stream: ((entry: LogEntry) => void) | null = null;

export function setLogStream(fn: ((entry: LogEntry) => void) | null) {
  stream = fn;
}

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  meta?: Record<string, unknown>
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    meta,
  };

  // Always persist to server stdout
  const line = `[RNP] [${entry.timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${
    meta ? ` ${JSON.stringify(meta)}` : ""
  }`;
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }

  // Forward to attached NDJSON stream (clients)
  if (stream) {
    try {
      stream(entry);
    } catch (e) {
      console.error("[RNP] Failed to forward log to stream:", e);
    }
  }
}

export function registerScope(scope: string) {
  SCOPES.add(scope);
}

export function getActiveScopes() {
  return Array.from(SCOPES);
}

export const logger = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    log("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    log("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    log("error", scope, message, meta),
  debug: (scope: string, message: string, meta?: Record<string, unknown>) =>
    log("debug", scope, message, meta),
};