/**
 * 客户端装配：持久化存储 + TokenStore + TokenRefresher + createAppHttp。
 *
 * 全链路都接了 mock adapter 与日志，页面和 console 都能看到每一步。
 */
import axios from 'axios'
import {
  createAppHttp,
  createTokenMapper,
  TokenRefresher,
  TokenStore,
  webStorageAdapter,
  type AuthTokens,
  type RefreshReason,
} from '@ygzhang-lab/vue-http'

import { API_KEY_HEADER, createMockAdapter, demoServer } from '../mock/server'
import { pinia } from '../stores'
import { useIdentityStore } from '../stores/identity'
import { log } from '../state/log'

export const API_BASE = '/api'

/**
 * apiKey 插件每次请求实时读取：身份状态统一由 Pinia identity store 持有，
 * 这里只做一次投影，避免 store 与 client 之间产生循环依赖（store 不 import client）。
 */
function getApiKey(): string | undefined {
  const identity = useIdentityStore(pinia)
  return identity.apiKeyEnabled ? identity.apiKey : undefined
}

/** 持久化：localStorage，7 天兜底有效期，refreshToken 与 accessToken 同 key */
export const storage = webStorageAdapter({
  key: 'playground.auth',
  maxAgeMs: 7 * 24 * 3_600 * 1_000,
})

export const tokenStore = new TokenStore({ storage, expiringThresholdMs: 60_000 })

/** 登录接口（经过 response-unwrap，data 已解包为 { user, tokens }） */
export const mapLoginResponse = createTokenMapper<{
  tokens: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; token_type?: unknown }
}>({
  accessToken: 'tokens.access_token',
  refreshToken: 'tokens.refresh_token',
  expiresIn: 'tokens.expires_in',
  tokenType: 'tokens.token_type',
})

/** 刷新接口走独立 axios 实例（不挂本套拦截器），返回原始信封，需要带 data. 前缀 */
export const mapRefreshResponse = createTokenMapper<RefreshEnvelope>({
  accessToken: 'data.tokens.access_token',
  refreshToken: 'data.tokens.refresh_token',
  expiresIn: 'data.tokens.expires_in',
  tokenType: 'data.tokens.token_type',
})

interface RefreshEnvelope {
  data: {
    tokens: {
      access_token?: unknown
      refresh_token?: unknown
      expires_in?: unknown
      token_type?: unknown
    }
  }
}

const refreshClient = axios.create({ baseURL: API_BASE, timeout: 8_000 })
refreshClient.defaults.adapter = createMockAdapter(demoServer)

export const refresher = new TokenRefresher({
  tokenStore,
  timeoutMs: 8_000,
  cooldownMs: 3_000,
  requireRefreshToken: true,
  refresh: async (refreshToken, signal): Promise<AuthTokens> => {
    log('info', 'refresher', `发起刷新请求（refresh_token=${mask(refreshToken)}）`)
    const { data } = await refreshClient.post(
      '/auth/refresh',
      { refresh_token: refreshToken },
      { signal },
    )
    const body = data as RefreshEnvelope & { code: number; message: string }
    if (body.code !== 0 || !body.data) {
      throw new Error(body.message || '刷新失败')
    }
    return mapRefreshResponse(body)
  },
  onRefreshed: (snapshot, reason: RefreshReason) => {
    log('success', 'refresher', `刷新成功（reason=${reason}，version=${snapshot.version}）`)
    log('info', 'token-store', `access_token 更新为 ${mask(snapshot.accessToken)}`)
  },
  onRefreshFailed: (error, reason: RefreshReason) => {
    log('error', 'refresher', `刷新失败（reason=${reason}）：${formatError(error)}`)
  },
})

export const http = createAppHttp({
  baseURL: API_BASE,
  timeout: 8_000,
  staticHeaders: { 'X-Client': 'playground-http' },
  jwt: { tokenStore, refresher, refreshBeforeExpirationMs: 60_000 },
  apiKey: { getApiKey, headerName: API_KEY_HEADER },
})
http.defaults.adapter = createMockAdapter(demoServer)

export { demoServer }

/** 脱敏：只保留头尾，便于在页面上观察 token 变化 */
export function mask(value: string | undefined, head = 8, tail = 4): string {
  if (!value) return '-'
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function formatError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { kind?: string; message?: string; status?: number; code?: number }
    if (candidate.kind) {
      const extra = candidate.code !== undefined ? ` code=${candidate.code}` : ''
      const status = candidate.status !== undefined ? ` status=${candidate.status}` : ''
      return `[${candidate.kind}${status}${extra}] ${candidate.message ?? ''}`
    }
  }
  return error instanceof Error ? error.message : String(error)
}
