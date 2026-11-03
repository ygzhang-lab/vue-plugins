type LogLevel = "debug" | "info" | "warn" | "error";

const isTest = import.meta.env.MODE === "test";
const enabled =
  !isTest &&
  (import.meta.env.VITE_DEBUG_LOG === "1" || import.meta.env.DEV === true);

/** 只保留可安全落日志的字段，避免把 token / raw 响应打出来 */
export function toLogError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }
  const candidate = error as Record<string, unknown> & {
    name?: unknown;
    message?: unknown;
    kind?: unknown;
    status?: unknown;
    code?: unknown;
  };
  return {
    name: candidate.name,
    message: candidate.message ?? candidate.kind ?? "unknown error",
    kind: candidate.kind,
    status: candidate.status,
    code: candidate.code,
  };
}

function write(
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown,
): void {
  // 生产环境默认关闭 debug/info；warn/error 保留（构建时 VITE_DROP_CONSOLE 可统一移除）
  if (!enabled && level !== "warn" && level !== "error") return;
  if (isTest && import.meta.env.VITE_DEBUG_LOG !== "1") return;

  const args: unknown[] = [`[h5:${scope}] ${message}`];
  if (data !== undefined) args.push(data);
  const method = console[level] ?? console.log;
  method.apply(console, args);
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => write("debug", scope, message, data),
    info: (message, data) => write("info", scope, message, data),
    warn: (message, data) => write("warn", scope, message, data),
    error: (message, data) => write("error", scope, message, data),
  };
}
