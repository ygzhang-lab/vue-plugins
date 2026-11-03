export const PHONE_RE = /^1[3-9]\d{9}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value);
}

export function isValidSmsCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}
