/**
 * 手机号脱敏：13800138000 → 138****8000
 */
export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

/**
 * 只对站内路径做跳转，避免 ?redirect=//evil.com 这类开放重定向。
 */
export function safeRedirect(value: unknown, fallback = "/home"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
