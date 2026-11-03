/**
 * 每秒刷新的时间戳，用于展示 token 剩余有效期。
 */
import { onScopeDispose, ref } from 'vue'

export function useNow(intervalMs = 1_000) {
  const now = ref(Date.now())
  const timer = window.setInterval(() => {
    now.value = Date.now()
  }, intervalMs)
  onScopeDispose(() => window.clearInterval(timer))
  return now
}
