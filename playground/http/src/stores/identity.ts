/**
 * 项目级身份状态（Pinia）。
 *
 * 职责边界：
 * - 本 store 持有「可被 UI 直接消费」的身份信息：当前用户、token 快照、认证方式、
 *   API Key、二次进入恢复结果。
 * - 真正的 token 生命周期（刷新、持久化、事件）仍由 vue-http 的 TokenStore 负责，
 *   由 bootstrap 订阅其事件后同步进本 store（见 api/auth.ts）。
 */
import type { RestoreResult, TokenSnapshot, TokenStatus } from '@ygzhang-lab/vue-http'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { clearApiKey, loadApiKey, saveApiKey } from '../api/api-key-storage'

export interface SessionUser {
  id: number
  username: string
  name: string
  role: string
  scopes?: string[]
}

export type AuthMode = 'JWT' | '仅 API Key' | 'JWT + API Key' | '未登录'

const EMPTY_SNAPSHOT: TokenSnapshot = { tokenType: 'Bearer', version: 0 }

export const useIdentityStore = defineStore('identity', () => {
  // ── state ──
  const user = ref<SessionUser | null>(null)
  const snapshot = ref<TokenSnapshot>({ ...EMPTY_SNAPSHOT })
  const tokenStatus = ref<TokenStatus>('anonymous')
  const hydrated = ref(false)
  const restoreResult = ref<RestoreResult | null>(null)
  const apiKey = ref('')
  const apiKeyEnabled = ref(false)

  // ── getters ──
  const hasJwt = computed(() => !!snapshot.value.accessToken)
  const hasApiKey = computed(() => apiKeyEnabled.value && !!apiKey.value)
  const isLoggedIn = computed(() => hasJwt.value || hasApiKey.value)
  const authMode = computed<AuthMode>(() => {
    if (hasJwt.value && hasApiKey.value) return 'JWT + API Key'
    if (hasJwt.value) return 'JWT'
    if (hasApiKey.value) return '仅 API Key'
    return '未登录'
  })

  // ── actions ──
  function setUser(next: SessionUser | null): void {
    user.value = next
  }

  function applySnapshot(next: TokenSnapshot, status: TokenStatus): void {
    snapshot.value = next
    tokenStatus.value = status
  }

  function setHydrated(value: boolean): void {
    hydrated.value = value
  }

  function setRestoreResult(result: RestoreResult | null): void {
    restoreResult.value = result
  }

  function enableApiKey(key: string): void {
    apiKey.value = key
    apiKeyEnabled.value = true
    saveApiKey(key)
  }

  function disableApiKey(): void {
    apiKeyEnabled.value = false
    clearApiKey()
  }

  /** 从本地恢复 API Key（不做网络校验，由调用方再校验） */
  function restoreApiKey(): boolean {
    const key = loadApiKey()
    if (!key) return false
    apiKey.value = key
    apiKeyEnabled.value = true
    return true
  }

  /** 登出：清空身份信息（token 由调用方另行 clear） */
  function resetIdentity(): void {
    user.value = null
    restoreResult.value = null
    snapshot.value = { ...EMPTY_SNAPSHOT }
    tokenStatus.value = 'anonymous'
    disableApiKey()
  }

  return {
    // state
    user,
    snapshot,
    tokenStatus,
    hydrated,
    restoreResult,
    apiKey,
    apiKeyEnabled,
    // getters
    hasJwt,
    hasApiKey,
    isLoggedIn,
    authMode,
    // actions
    setUser,
    applySnapshot,
    setHydrated,
    setRestoreResult,
    enableApiKey,
    disableApiKey,
    restoreApiKey,
    resetIdentity,
  }
})
