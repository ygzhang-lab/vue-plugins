/**
 * 会话动作：登录 / 登出 / 静默刷新 / 二次进入恢复 / 令牌失效模拟。
 *
 * 身份信息统一写入 Pinia 的 identity store，组件只从 store 读；
 * token 的刷新与持久化仍由 vue-http 的 TokenStore 负责，
 * 本文件负责把 TokenStore 的事件与状态同步进 store。
 */
import { restoreSession, syncTokenStoreWithStorage } from '@ygzhang-lab/vue-http'

import { log, setStage } from '../state/log'
import { pinia } from '../stores'
import { useIdentityStore, type SessionUser } from '../stores/identity'
import { API_KEY_STORAGE_KEY } from './api-key-storage'
import {
  demoServer,
  formatError,
  http,
  mapLoginResponse,
  mask,
  refresher,
  storage,
  tokenStore,
} from './client'

export type { SessionUser } from '../stores/identity'

const identity = () => useIdentityStore(pinia)
const unwatchFns: Array<() => void> = []
let syncBound = false

/** 启动流程：水合 → 静默恢复 → API Key 恢复 → 跨 tab 同步 → 过期监控 */
export async function bootstrapSession(): Promise<void> {
  const store = identity()

  setStage('hydrate', '持久化水合', 'running')
  const restored = await tokenStore.hydrate()
  store.setHydrated(tokenStore.isHydrated())
  store.applySnapshot(tokenStore.getSnapshot(), tokenStore.getStatus())
  setStage(
    'hydrate',
    '持久化水合',
    'ok',
    restored ? 'localStorage 中恢复出有效会话' : '本地没有会话数据',
  )

  setStage('restore', '二次进入静默恢复', 'running')
  const result = await restoreSession({ tokenStore, refresher })
  store.setRestoreResult(result)
  store.applySnapshot(tokenStore.getSnapshot(), tokenStore.getStatus())
  setStage(
    'restore',
    '二次进入静默恢复',
    result.status === 'expired' ? 'fail' : 'ok',
    `${result.status} / token=${result.tokenStatus}`,
  )

  if (tokenStore.hasAccessToken()) {
    await loadMe(false)
  }

  await restoreApiKey(store)

  bindTokenEvents()
  bindCrossTabSync()
  tokenStore.watchExpiration({ intervalMs: 5_000 })
  setStage('ready', '页面就绪', 'ok')
}

/** 刷新后恢复「仅 API Key」会话：先读本地，再用 /apikey/profile 校验 */
async function restoreApiKey(store: ReturnType<typeof identity>): Promise<void> {
  if (!store.restoreApiKey()) {
    setStage('apikey-restore', 'API Key 会话恢复', 'ok', '本地没有 API Key 会话')
    return
  }

  setStage('apikey-restore', 'API Key 会话恢复', 'running', `key=${mask(store.apiKey)}`)
  try {
    const { data } = await http.get<SessionUser>('/apikey/profile', { skipAuth: true })
    store.setUser(data)
    const message = `API Key 会话恢复成功（${data.name}，key=${mask(store.apiKey)}）`
    log('success', 'auth', message)
    setStage('apikey-restore', 'API Key 会话恢复', 'ok', data.name)
  } catch (error) {
    store.disableApiKey()
    store.setUser(null)
    const message = `API Key 会话失效，已清除：${formatError(error)}`
    log('warn', 'auth', message)
    setStage('apikey-restore', 'API Key 会话恢复', 'fail', formatError(error))
  }
}

/** TokenStore 事件 → Pinia store：组件不需要直接触碰 TokenStore */
function bindTokenEvents(): void {
  if (unwatchFns.length) return
  const store = identity()
  const types = ['hydrate', 'login', 'refresh', 'expire', 'invalid', 'clear'] as const
  for (const type of types) {
    unwatchFns.push(
      tokenStore.on(type, (payload) => {
        store.applySnapshot(payload.snapshot, tokenStore.getStatus())
        const level = type === 'expire' || type === 'invalid' ? 'warn' : 'info'
        const prefix = payload.reason ? `（${payload.reason}）` : ''
        log(level, 'token-store', `事件 ${type}${prefix}，version=${payload.snapshot.version}`)
      }),
    )
  }
}

function bindCrossTabSync(): void {
  if (syncBound) return
  syncBound = true
  if (!storage.subscribe) {
    log('warn', 'storage', '当前存储适配器不支持跨 tab 订阅')
    return
  }
  syncTokenStoreWithStorage(tokenStore, storage)
  log('info', 'storage', '已订阅 storage 事件：其他标签页登录 / 登出会实时同步')

  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('playground.auth')) {
      log('info', 'storage', `收到跨 tab 变更（key=${event.key ?? 'clear'}）`)
      return
    }
    if (event.key === API_KEY_STORAGE_KEY) {
      void syncApiKeyFromStorage()
    }
  })
}

async function syncApiKeyFromStorage(): Promise<void> {
  const store = identity()
  if (!store.restoreApiKey()) {
    store.disableApiKey()
    store.setUser(null)
    log('info', 'storage', '其他标签页已登出 API Key，本地已清除')
    return
  }
  try {
    const { data } = await http.get<SessionUser>('/apikey/profile', { skipAuth: true })
    store.setUser(data)
    log('info', 'storage', '其他标签页更新了 API Key，本地已同步并校验')
  } catch {
    store.disableApiKey()
    store.setUser(null)
    log('warn', 'storage', '其他标签页的 API Key 校验失败，本地已清除')
  }
}

export async function loginJwt(username: string, password: string): Promise<SessionUser> {
  setStage('login', 'JWT 登录', 'running')
  const store = identity()
  try {
    const { data } = await http.post<{ user: SessionUser; tokens: Record<string, unknown> }>(
      '/auth/login',
      { username, password },
      { skipAuth: true, skipApiKey: true },
    )
    log('info', 'auth', `登录成功，服务端返回用户 ${data.user.name}`)

    const snapshot = tokenStore.setTokens(mapLoginResponse(data), { event: 'login' })
    store.setUser(data.user)
    store.applySnapshot(snapshot, tokenStore.getStatus())
    log(
      'success',
      'auth',
      `写入 TokenStore：access=${mask(snapshot.accessToken)} refresh=${mask(snapshot.refreshToken)}`,
    )
    setStage('login', 'JWT 登录', 'ok', `${data.user.username} / version=${snapshot.version}`)
    return data.user
  } catch (error) {
    setStage('login', 'JWT 登录', 'fail', formatError(error))
    throw error
  }
}

export async function loginApiKey(key: string): Promise<string> {
  setStage('apikey', 'API Key 登录', 'running')
  const store = identity()
  store.enableApiKey(key)
  try {
    const { data } = await http.get<{ secret: string; owner: string }>('/apikey/secret', {
      skipAuth: true,
    })
    const profile = await http.get<SessionUser>('/apikey/profile', { skipAuth: true })
    store.setUser(profile.data)
    log('success', 'auth', `API Key 校验通过（${profile.data.name}，key=${mask(key)}）`)
    setStage('apikey', 'API Key 登录', 'ok', `${profile.data.name} · 已持久化`)
    return data.secret
  } catch (error) {
    store.disableApiKey()
    store.setUser(null)
    setStage('apikey', 'API Key 登录', 'fail', formatError(error))
    throw error
  }
}

export async function logout(): Promise<void> {
  setStage('logout', '登出', 'running')
  const store = identity()
  try {
    if (tokenStore.hasAccessToken()) {
      await http.post('/auth/logout', null, { skipAuth: true })
    }
  } catch (error) {
    log('warn', 'auth', `登出接口异常（忽略）：${formatError(error)}`)
  } finally {
    tokenStore.clear('logout')
    store.resetIdentity()
    setStage('logout', '登出', 'ok', 'TokenStore 与身份 store 已清空，localStorage 同步删除')
  }
}

export async function manualRefresh(): Promise<void> {
  setStage('refresh', '手动刷新', 'running')
  try {
    const snapshot = await refresher.refresh('proactive')
    identity().applySnapshot(snapshot, tokenStore.getStatus())
    setStage('refresh', '手动刷新', 'ok', `version=${snapshot.version} ${mask(snapshot.accessToken)}`)
  } catch (error) {
    setStage('refresh', '手动刷新', 'fail', formatError(error))
    throw error
  }
}

/** 把 token 改成 30 秒后过期：下一次请求会走「临期主动刷新」 */
export function expireSoon(): void {
  if (!tokenStore.hasAccessToken()) {
    log('warn', 'auth', '当前未登录，无法设置临期 token')
    return
  }
  tokenStore.updateTokens({ expiresIn: 30 }, 'expire-soon')
  log('info', 'auth', '已将 access_token 设为 30 秒后过期，下次请求会触发主动刷新')
}

/** 服务端注销当前 access_token：下一次请求会 401 → 刷新 → 重放 */
export function kickAccessToken(): void {
  const token = tokenStore.getAccessToken()
  const removed = demoServer.revokeAccessToken(token)
  log(
    removed ? 'warn' : 'error',
    'mock-server',
    removed ? '服务端已注销当前 access_token（模拟被踢下线）' : '没有可注销的 access_token',
  )
}

export async function loadMe(verbose = true): Promise<SessionUser | null> {
  const store = identity()
  try {
    const { data } = await http.get<SessionUser>('/me')
    store.setUser(data)
    if (verbose) log('success', 'auth', `获取用户信息：${data.name}（${data.role}）`)
    return data
  } catch (error) {
    store.setUser(null)
    if (verbose) log('error', 'auth', `获取用户信息失败：${formatError(error)}`)
    return null
  }
}

/** 二次进入：刷新页面，观察 hydrate + restoreSession 的全过程 */
export function reloadPage(): void {
  log('info', 'auth', '刷新页面，模拟「二次进入」')
  window.location.reload()
}

export function openSecondTab(): void {
  window.open(window.location.href, '_blank', 'noopener')
  log('info', 'storage', '已打开新标签页：在那边登录 / 登出，本页会收到 storage 事件')
}
