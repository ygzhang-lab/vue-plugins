import type { NormalizedError } from "@/base/http";

/** 从已归一化的 HTTP 错误中提取可展示文案 */
export function toErrorText(error: unknown): string {
  const normalized = error as Partial<NormalizedError> | null;
  if (normalized && typeof normalized.message === "string" && normalized.message) {
    return normalized.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "操作失败，请稍后重试";
}
