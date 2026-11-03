/**
 * API Key 的本地持久化（纯函数，不依赖 store / Vue）。
 * 刷新页面后由 identity store 的 restoreApiKey() 读取。
 */
export const API_KEY_STORAGE_KEY = 'playground.apikey'

const MAX_AGE_MS = 7 * 24 * 3_600_000

interface PersistedApiKey {
  key: string
  savedAt: number
}

export function saveApiKey(key: string): void {
  try {
    const payload: PersistedApiKey = { key, savedAt: Date.now() }
    localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* 隐私模式 / 存储不可用时保持内存态 */
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function loadApiKey(maxAgeMs = MAX_AGE_MS): string | null {
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedApiKey>
    if (typeof parsed.key !== 'string' || !parsed.key) {
      clearApiKey()
      return null
    }
    if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > maxAgeMs) {
      clearApiKey()
      return null
    }
    return parsed.key
  } catch {
    return null
  }
}
