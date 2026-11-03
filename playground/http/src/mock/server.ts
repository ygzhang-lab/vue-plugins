/**
 * 模拟后端：内存态用户 / token / 刷新令牌，配合 axios adapter 使用。
 *
 * 支持：登录、刷新（轮换 refresh_token）、登出、令牌失效（模拟被踢）、
 * 鉴权接口、业务错误、API Key 校验、慢请求、网络错误、超时、取消。
 */
import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

export const API_KEY = 'demo-api-key'
export const API_KEY_HEADER = 'X-API-Key'

export interface MockUser {
  id: number
  username: string
  password: string
  name: string
  role: string
}

export interface MockTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface RequestRecord {
  method: string
  url: string
  status: number
  note?: string
  at: number
}

const USERS: MockUser[] = [
  { id: 1, username: 'admin', password: '123456', name: '管理员', role: 'admin' },
  { id: 2, username: 'guest', password: 'guest', name: '访客', role: 'guest' },
]

const ORDERS = [
  { id: 'A-1001', title: '年度会员', amount: 199, status: 'paid' },
  { id: 'A-1002', title: '流量加油包', amount: 29, status: 'paid' },
  { id: 'A-1003', title: '定制主题', amount: 59, status: 'pending' },
]

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export class MockServer {
  /** 已注销的 token（jti），内存态；刷新页面后清空，仅用于演示「被踢下线」 */
  private revokedAccess = new Set<string>()
  private revokedRefresh = new Set<string>()
  private seq = 0

  readonly requests: RequestRecord[] = []

  reset(): void {
    this.revokedAccess.clear()
    this.revokedRefresh.clear()
    this.requests.length = 0
    this.seq = 0
  }

  record(method: string, url: string, status: number, note?: string): void {
    this.requests.unshift({ method, url, status, note, at: Date.now() })
    if (this.requests.length > 50) this.requests.length = 50
  }

  /**
   * 签发自描述 token（base64 载荷），服务端**不保存** token 表。
   * 这样刷新页面（内存清空）后，localStorage 里的 token 依然有效，
   * 才能演示「二次进入」的持久化恢复。
   */
  issueTokens(userId: number, expiresIn = 3_600): MockTokens {
    this.seq += 1
    const now = Date.now()
    const accessToken = encodeToken({
      uid: userId,
      typ: 'access',
      exp: now + expiresIn * 1_000,
      jti: `a-${this.seq}-${now}`,
    })
    const refreshToken = encodeToken({
      uid: userId,
      typ: 'refresh',
      exp: now + 30 * 24 * 3_600_000,
      jti: `r-${this.seq}-${now}`,
    })
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
    }
  }

  /** 模拟服务端使某个 access token 立即失效（被踢下线 / 密钥轮换） */
  revokeAccessToken(token: string | undefined): boolean {
    const payload = token ? decodeToken(token) : null
    if (!payload) return false
    this.revokedAccess.add(payload.jti)
    return true
  }

  private resolveUser(accessToken: string | undefined): MockUser {
    if (!accessToken) throw new MockHttpError(401, '缺少访问令牌')
    const payload = decodeToken(accessToken)
    if (!payload || payload.typ !== 'access') throw new MockHttpError(401, '令牌格式非法')
    if (this.revokedAccess.has(payload.jti)) throw new MockHttpError(401, '令牌已被注销')
    if (payload.exp <= Date.now()) throw new MockHttpError(401, '访问令牌已过期')
    const user = USERS.find((u) => u.id === payload.uid)
    if (!user) throw new MockHttpError(401, '用户不存在')
    return user
  }

  /** 返回业务数据；失败抛 MockHttpError，由 adapter 转成 AxiosError */
  handle(method: string, url: string, config: InternalAxiosRequestConfig): unknown {
    const rawPath = url.split('?')[0] ?? ''
    // 实例 baseURL 为 /api，这里统一去掉前缀再路由（注意 /apikey 不能被误伤）
    const path = rawPath.startsWith('/api/') ? rawPath.slice(4) : rawPath
    const route = `${method} ${path}`
    const body = parseBody(config.data)
    const bearer = readBearer(config)

    switch (route) {
      case 'POST /auth/login': {
        const user = USERS.find(
          (u) => u.username === body.username && u.password === body.password,
        )
        if (!user) throw new MockHttpError(401, '用户名或密码错误')
        const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3_600
        return { user: toPublicUser(user), tokens: this.issueTokens(user.id, expiresIn) }
      }

      case 'POST /auth/refresh': {
        const rt = String(body.refresh_token ?? '')
        const payload = decodeToken(rt)
        if (!payload || payload.typ !== 'refresh') {
          throw new MockHttpError(401, 'refresh_token 格式非法')
        }
        if (this.revokedRefresh.has(payload.jti)) {
          throw new MockHttpError(401, 'refresh_token 已被轮换')
        }
        if (payload.exp <= Date.now()) {
          throw new MockHttpError(401, 'refresh_token 已过期')
        }
        // 轮换：旧 refresh_token 立即作废（仅本进程内存记录）
        this.revokedRefresh.add(payload.jti)
        const tokens = this.issueTokens(payload.uid)
        return { tokens }
      }

      case 'POST /auth/logout': {
        if (bearer) this.revokeAccessToken(bearer)
        return { ok: true }
      }

      case 'GET /me': {
        const user = this.resolveUser(bearer)
        return toPublicUser(user)
      }

      case 'GET /orders': {
        this.resolveUser(bearer)
        return ORDERS
      }

      case 'GET /public':
        return { time: new Date().toISOString(), message: '公开接口，无需认证' }

      case 'GET /business-error':
        return { __businessError: { code: 4001, message: '余额不足，请先充值' } }

      case 'GET /apikey/secret': {
        requireApiKey(config)
        return { secret: 'api-key 校验通过', owner: 'integration-client' }
      }

      case 'GET /apikey/profile': {
        requireApiKey(config)
        return {
          id: 0,
          username: 'api-client',
          name: 'API 客户端',
          role: 'api-key',
          scopes: ['orders:read', 'profile:read'],
        }
      }

      case 'GET /apikey/orders': {
        requireApiKey(config)
        return ORDERS
      }

      default:
        throw new MockHttpError(404, `未定义的接口：${route}`)
    }
  }
}

/** API Key 鉴权：缺少或错误时返回 401，交给 error-normalizer 归一化 */
function requireApiKey(config: InternalAxiosRequestConfig): void {
  const key = config.headers.get(API_KEY_HEADER)
  if (!key) throw new MockHttpError(401, '缺少 API Key')
  if (key !== API_KEY) throw new MockHttpError(401, 'API Key 无效')
}

export function createMockAdapter(server: MockServer, latencyMs = 120): AxiosAdapter {
  return async (config): Promise<AxiosResponse> => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = config.url ?? ''

    await sleep(latencyMs, config)

    // 特殊分支：网络错误 / 超时 / 慢请求
    if (url.includes('/network-error')) {
      server.record(method, url, 0, 'network')
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    }
    if (url.includes('/timeout')) {
      server.record(method, url, 0, 'timeout')
      throw new AxiosError('timeout of 1ms exceeded', 'ETIMEDOUT', config)
    }
    if (url.includes('/slow')) {
      await sleep(1_500, config)
      server.record(method, url, 200, 'slow')
      return ok(config, { code: 0, message: 'ok', data: { delayed: 1_500 } })
    }

    try {
      const data = server.handle(method, url, config)
      if (isBusinessError(data)) {
        server.record(method, url, 200, `business ${data.__businessError.code}`)
        return ok(config, {
          code: data.__businessError.code,
          message: data.__businessError.message,
          data: null,
        })
      }
      server.record(method, url, 200)
      return ok(config, { code: 0, message: 'ok', data })
    } catch (error) {
      if (error instanceof AxiosError) throw error
      const status = error instanceof MockHttpError ? error.status : 500
      const message = error instanceof Error ? error.message : '服务端异常'
      server.record(method, url, status, message)
      throw new AxiosError(message, 'ERR_BAD_REQUEST', config, undefined, {
        status,
        statusText: String(status),
        data: { message },
        headers: {},
        config,
      })
    }
  }
}

/** 页面默认使用的服务端实例（自测用例会另建独立实例互不干扰） */
export const demoServer = new MockServer()

interface TokenPayload {
  uid: number
  typ: 'access' | 'refresh'
  exp: number
  jti: string
}

const TOKEN_PREFIX = 'mock.'

/** 生成自描述 token：服务端不存 token 表，刷新页面后仍然可校验 */
function encodeToken(payload: TokenPayload): string {
  return `${TOKEN_PREFIX}${btoa(JSON.stringify(payload))}`
}

function decodeToken(token: string): TokenPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  try {
    const parsed = JSON.parse(atob(token.slice(TOKEN_PREFIX.length))) as Partial<TokenPayload>
    if (typeof parsed.uid !== 'number' || typeof parsed.exp !== 'number') return null
    if (parsed.typ !== 'access' && parsed.typ !== 'refresh') return null
    if (typeof parsed.jti !== 'string') return null
    return parsed as TokenPayload
  } catch {
    return null
  }
}

function ok<T>(config: InternalAxiosRequestConfig, body: T): AxiosResponse {
  return { data: body, status: 200, statusText: 'OK', headers: {}, config }
}

function isBusinessError(value: unknown): value is { __businessError: { code: number; message: string } } {
  return !!value && typeof value === 'object' && '__businessError' in value
}

function parseBody(data: unknown): Record<string, unknown> {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

function readBearer(config: InternalAxiosRequestConfig): string | undefined {
  const header = config.headers.get('Authorization')
  if (typeof header !== 'string') return undefined
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? token : header
}

function toPublicUser(user: MockUser) {
  return { id: user.id, username: user.username, name: user.name, role: user.role }
}

function sleep(ms: number, config: InternalAxiosRequestConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const signal = config.signal
    if (signal?.aborted) {
      reject(new CanceledError('canceled', config))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(new CanceledError('canceled', config))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}
