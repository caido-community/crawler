export type LogLevel = "info" | "success" | "warning" | "error";

const LOG_LEVELS: LogLevel[] = ["info", "success", "warning", "error"];

function isLogLevel(s: string): s is LogLevel {
  return LOG_LEVELS.includes(s as LogLevel);
}

export function normalizeLogLevel(level: string | undefined): LogLevel {
  if (level !== undefined && isLogLevel(level)) return level;
  return "info";
}

export function getLogLineClass(level: string | undefined): string {
  const n = normalizeLogLevel(level);
  switch (n) {
    case "success":
      return "text-success-400";
    case "warning":
      return "text-yellow-400";
    case "error":
      return "text-red-400";
    default:
      return "text-surface-200";
  }
}

export function getLogLabel(level: string | undefined): string {
  const n = normalizeLogLevel(level);
  return n.toUpperCase();
}
