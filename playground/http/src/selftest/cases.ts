/**
 * 内置插件与领域层用例：在浏览器里跑一遍，结果直接渲染到页面。
 *
 * 覆盖：request-config / headers / jwt-auth / api-key-auth /
 * response-unwrap / error-normalizer + TokenStore / TokenRefresher /
 * restoreSession / token-mapper。
 */
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'

import {
  apiKeyAuthPlugin,
  createHttp,
  createTokenMapper,
  errorNormalizerPlugin,
  headersPlugin,
  jwtAuthPlugin,
  memoryStorageAdapter,
  requestConfigPlugin,
  responseUnwrapPlugin,
  restoreSession,
  TokenRefresher,
  TokenStore,
  type NormalizedError,
  type TokenSnapshot,
} from '@ygzhang-lab/vue-http'

import { API_KEY, API_KEY_HEADER, createMockAdapter, MockServer } from '../mock/server'

export interface CaseResult {
  group: string
  name: string
  ok: boolean
  detail: string
}

interface Case {
  group: string
  name: string
  run: () => Promise<string> | string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}：期望 ${String(expected)}，实际 ${String(actual)}`)
  }
}

function captureAdapter(server: MockServer, captured: InternalAxiosRequestConfig[]): AxiosAdapter {
  const base = createMockAdapter(server, 0)
  return async (config) => {
    captured.push(config)
    return base(config)
  }
}

function makeStore(tokens?: { accessToken: string; expiresIn?: number }): TokenStore {
  const store = new TokenStore()
  if (tokens) store.setTokens(tokens)
  return store
}

function stubRefresher(store: TokenStore, onRefresh?: () => void): TokenRefresher {
  return new TokenRefresher({
    tokenStore: store,
    cooldownMs: 0,
    refresh: async () => {
      onRefresh?.()
      return { accessToken: `refreshed-${Date.now()}`, expiresIn: 3_600 }
    },
  })
}

const cases: Case[] = [
  {
    group: '请求链路',
    name: 'request-config：baseURL / timeout / 默认头合并',
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const http = createHttp({
        plugins: [
          requestConfigPlugin({
            baseURL: '/api',
            timeout: 1_234,
            headers: { 'Content-Type': 'application/json' },
          }),
          responseUnwrapPlugin(),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      await http.get('/public')
      equal(captured[0]?.baseURL, '/api', 'baseURL')
      equal(captured[0]?.timeout, 1_234, 'timeout')
      equal(captured[0]?.headers.get('Content-Type'), 'application/json', '默认头')
      return '配置已合并进 defaults'
    },
  },
  {
    group: '请求链路',
    name: 'headers：静态值与函数值都写入请求头',
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const http = createHttp({
        plugins: [
          headersPlugin({ 'X-Static': 'static-value', 'X-Dynamic': () => 'dynamic-value' }),
          responseUnwrapPlugin(),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      await http.get('/public')
      equal(captured[0]?.headers.get('X-Static'), 'static-value', 'X-Static')
      equal(captured[0]?.headers.get('X-Dynamic'), 'dynamic-value', 'X-Dynamic')
      return '静态 / 动态 header 均生效'
    },
  },
  {
    group: '请求链路',
    name: 'response-unwrap：{ code, message, data } 解包成 data',
    async run() {
      const server = new MockServer()
      const http = createHttp({
        plugins: [responseUnwrapPlugin(), errorNormalizerPlugin()],
      })
      http.defaults.adapter = createMockAdapter(server, 0)
      const { data } = await http.get<{ message: string }>('/public')
      assert(data.message.includes('公开接口'), '未解包出业务数据')
      return 'data 已是业务对象（无 code/message 包裹）'
    },
  },
  {
    group: '错误归一化',
    name: '业务错误 → kind=business + code',
    async run() {
      const server = new MockServer()
      const http = createHttp({ plugins: [responseUnwrapPlugin(), errorNormalizerPlugin()] })
      http.defaults.adapter = createMockAdapter(server, 0)
      const error = (await http.get('/business-error').catch((e) => e)) as NormalizedError
      equal(error.kind, 'business', 'kind')
      equal(error.code, 4001, 'code')
      return error.message
    },
  },
  {
    group: '错误归一化',
    name: 'HTTP 401 → kind=http + status',
    async run() {
      const server = new MockServer()
      const http = createHttp({ plugins: [responseUnwrapPlugin(), errorNormalizerPlugin()] })
      http.defaults.adapter = createMockAdapter(server, 0)
      const error = (await http.get('/apikey/secret').catch((e) => e)) as NormalizedError
      equal(error.kind, 'http', 'kind')
      equal(error.status, 401, 'status')
      return error.message
    },
  },
  {
    group: '错误归一化',
    name: '网络错误 → kind=network',
    async run() {
      const server = new MockServer()
      const http = createHttp({ plugins: [errorNormalizerPlugin()] })
      http.defaults.adapter = createMockAdapter(server, 0)
      const error = (await http.get('/network-error').catch((e) => e)) as NormalizedError
      equal(error.kind, 'network', 'kind')
      return error.message
    },
  },
  {
    group: '错误归一化',
    name: '超时 → kind=timeout',
    async run() {
      const server = new MockServer()
      const http = createHttp({ plugins: [errorNormalizerPlugin()] })
      http.defaults.adapter = createMockAdapter(server, 0)
      const error = (await http.get('/timeout').catch((e) => e)) as NormalizedError
      equal(error.kind, 'timeout', 'kind')
      return error.message
    },
  },
  {
    group: '错误归一化',
    name: '取消请求 → kind=canceled',
    async run() {
      const server = new MockServer()
      const http = createHttp({ plugins: [errorNormalizerPlugin()] })
      http.defaults.adapter = createMockAdapter(server, 10)
      const controller = new AbortController()
      const pending = http.get('/slow', { signal: controller.signal }).catch((e) => e)
      controller.abort()
      const error = (await pending) as NormalizedError
      equal(error.kind, 'canceled', 'kind')
      return error.message
    },
  },
  {
    group: 'jwt-auth',
    name: '注入 Authorization: Bearer <token>',
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const tokens = server.issueTokens(1)
      const store = makeStore({ accessToken: tokens.access_token, expiresIn: tokens.expires_in })
      const http = createHttp({
        plugins: [
          jwtAuthPlugin({ tokenStore: store, refresher: stubRefresher(store) }),
          responseUnwrapPlugin(),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      const { data } = await http.get<{ name: string }>('/me')
      equal(captured[0]?.headers.get('Authorization'), `Bearer ${tokens.access_token}`, 'Authorization')
      equal(data.name, '管理员', '用户信息')
      return '认证头已写入，服务端返回用户信息'
    },
  },
  {
    group: 'jwt-auth',
    name: 'skipAuth 跳过认证头注入',
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const store = makeStore({ accessToken: 'token-abc', expiresIn: 3_600 })
      const http = createHttp({
        plugins: [
          jwtAuthPlugin({ tokenStore: store, refresher: stubRefresher(store) }),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      await http.get('/public', { skipAuth: true })
      equal(captured[0]?.headers.has('Authorization'), false, 'Authorization 存在性')
      return 'skipAuth 生效'
    },
  },
  {
    group: 'jwt-auth',
    name: '401 → 刷新 → 自动重放（只重放一次）',
    async run() {
      const server = new MockServer()
      let refreshCount = 0
      const store = new TokenStore()
      const tokens = server.issueTokens(1)
      store.setTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      })
      const refresher = new TokenRefresher({
        tokenStore: store,
        cooldownMs: 0,
        refresh: async () => {
          refreshCount += 1
          const next = server.issueTokens(1)
          return {
            accessToken: next.access_token,
            refreshToken: next.refresh_token,
            expiresIn: next.expires_in,
          }
        },
      })
      const http = createHttp({
        plugins: [
          jwtAuthPlugin({ tokenStore: store, refresher }),
          responseUnwrapPlugin(),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = createMockAdapter(server, 0)
      server.revokeAccessToken(tokens.access_token)
      const { data } = await http.get<unknown[]>('/orders')
      equal(refreshCount, 1, '刷新次数')
      assert(Array.isArray(data), 'orders 不是数组')
      equal(data.length, 3, '订单数量')
      return `刷新 ${refreshCount} 次后拿到 ${data.length} 条订单`
    },
  },
  {
    group: 'api-key-auth',
    name: `注入 ${API_KEY_HEADER} 请求头`,
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const http = createHttp({
        plugins: [apiKeyAuthPlugin({ getApiKey: () => API_KEY }), responseUnwrapPlugin()],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      await http.get('/apikey/secret')
      equal(captured[0]?.headers.get(API_KEY_HEADER), API_KEY, 'API Key 头')
      return 'API Key 已写入'
    },
  },
  {
    group: 'api-key-auth',
    name: 'skipApiKey 跳过 API Key 注入',
    async run() {
      const server = new MockServer()
      const captured: InternalAxiosRequestConfig[] = []
      const http = createHttp({
        plugins: [apiKeyAuthPlugin({ getApiKey: () => API_KEY }), errorNormalizerPlugin()],
      })
      http.defaults.adapter = captureAdapter(server, captured)
      await http.get('/public', { skipApiKey: true })
      equal(captured[0]?.headers.has(API_KEY_HEADER), false, 'API Key 头存在性')
      return 'skipApiKey 生效'
    },
  },
  {
    group: 'api-key-auth',
    name: '仅 API Key：可访问受保护接口（无需 JWT）',
    async run() {
      const server = new MockServer()
      const http = createHttp({
        plugins: [apiKeyAuthPlugin({ getApiKey: () => API_KEY }), responseUnwrapPlugin(), errorNormalizerPlugin()],
      })
      http.defaults.adapter = createMockAdapter(server, 0)

      const { data } = await http.get<{ name: string; scopes: string[] }>('/apikey/profile', {
        skipAuth: true,
      })
      equal(data.name, 'API 客户端', 'profile')
      const orders = await http.get<unknown[]>('/apikey/orders', { skipAuth: true })
      equal(orders.data.length, 3, '订单数量')
      return 'API Key 鉴权接口可用'
    },
  },
  {
    group: 'TokenStore',
    name: 'setTokens 递增 version 并派发 login / refresh 事件',
    async run() {
      const store = new TokenStore()
      const events: string[] = []
      store.on('login', () => events.push('login'))
      store.on('refresh', () => events.push('refresh'))
      const first = store.setTokens({ accessToken: 'a', expiresIn: 60 }, { event: 'login' })
      const second = store.setTokens({ accessToken: 'b', expiresIn: 60 }, { event: 'refresh' })
      assert(second.version > first.version, 'version 未递增')
      assert(events.includes('login'), '缺少 login 事件')
      assert(events.includes('refresh'), '缺少 refresh 事件')
      return `version ${first.version} → ${second.version}`
    },
  },
  {
    group: 'TokenStore',
    name: 'hydrate 从持久化恢复会话（二次进入）',
    async run() {
      const snapshot: TokenSnapshot = {
        accessToken: 'persisted',
        refreshToken: 'persisted-rt',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3_600_000,
        version: 7,
      }
      const store = new TokenStore({ storage: memoryStorageAdapter(snapshot) })
      const restored = await store.hydrate()
      assert(restored, 'hydrate 未恢复数据')
      equal(store.getAccessToken(), 'persisted', 'accessToken')
      assert(store.getStatus() === 'valid', `状态异常：${store.getStatus()}`)
      return '恢复后状态 valid'
    },
  },
  {
    group: 'TokenStore',
    name: '跨 tab 同步：version 守卫拒绝旧快照回退',
    async run() {
      const store = new TokenStore()
      store.hydrateFromExternal({
        accessToken: 'newer',
        tokenType: 'Bearer',
        version: 100,
      })
      store.hydrateFromExternal({
        accessToken: 'older',
        tokenType: 'Bearer',
        version: 99,
      })
      equal(store.getAccessToken(), 'newer', 'accessToken')
      return '旧版本快照被忽略'
    },
  },
  {
    group: 'TokenRefresher',
    name: '并发刷新去重：多次调用只真正执行一次',
    async run() {
      const store = makeStore()
      let calls = 0
      const refresher = new TokenRefresher({
        tokenStore: store,
        cooldownMs: 0,
        refresh: async () => {
          calls += 1
          await new Promise((resolve) => setTimeout(resolve, 30))
          return { accessToken: `shared-${calls}`, expiresIn: 60 }
        },
      })
      const [a, b] = await Promise.all([refresher.refresh('proactive'), refresher.refresh('unauthorized')])
      equal(calls, 1, '实际刷新次数')
      equal(a.accessToken, b.accessToken, '两次结果')
      return '并发请求合并为一次刷新'
    },
  },
  {
    group: 'TokenRefresher',
    name: '失败冷却：冷却期内直接拒绝',
    async run() {
      const store = makeStore()
      const refresher = new TokenRefresher({
        tokenStore: store,
        cooldownMs: 1_000,
        refresh: async () => {
          throw new Error('refresh failed')
        },
      })
      await refresher.refresh('unauthorized').catch(() => undefined)
      assert(refresher.isCoolingDown(), '未进入冷却期')
      const error = (await refresher.refresh('unauthorized').catch((e) => e)) as Error
      assert(error.message.includes('cooling down'), `异常信息不符：${error.message}`)
      return '冷却期内拒绝重复刷新'
    },
  },
  {
    group: 'session-bootstrap',
    name: 'restoreSession：有效 token 直接放行',
    async run() {
      const store = new TokenStore({
        storage: memoryStorageAdapter({
          accessToken: 'valid-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 3_600_000,
          version: 1,
        }),
      })
      await store.hydrate()
      const refresher = stubRefresher(store)
      const result = await restoreSession({ tokenStore: store, refresher })
      equal(result.status, 'authenticated', 'status')
      return `${result.status} / ${result.tokenStatus}`
    },
  },
  {
    group: 'session-bootstrap',
    name: '刷新页面后仍可恢复（新实例 + 服务端内存清空）',
    async run() {
      const origin = new MockServer()
      const tokens = origin.issueTokens(1)
      const snapshot: TokenSnapshot = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3_600_000,
        version: 5,
      }

      // 模拟刷新：模块重建 → 新的 TokenStore；mock 服务端内存也清空
      const store = new TokenStore({ storage: memoryStorageAdapter(snapshot) })
      await store.hydrate()
      const refresher = stubRefresher(store)
      const restored = await restoreSession({ tokenStore: store, refresher })
      equal(restored.status, 'authenticated', '恢复结果')

      const freshServer = new MockServer()
      const http = createHttp({
        plugins: [
          jwtAuthPlugin({ tokenStore: store, refresher }),
          responseUnwrapPlugin(),
          errorNormalizerPlugin(),
        ],
      })
      http.defaults.adapter = createMockAdapter(freshServer, 0)
      const { data } = await http.get<{ name: string }>('/me')
      equal(data.name, '管理员', '用户信息')
      equal(store.getVersion(), snapshot.version, 'version 被回退')
      return `持久化 token 在新实例中仍有效（v${store.getVersion()}）`
    },
  },
  {
    group: 'token-mapper',
    name: '声明式映射：点路径 + 函数取值',
    async run() {
      const map = createTokenMapper<{
        data: { tokens: { value: string }[]; expires_in: number }
        rt?: string
      }>({
        accessToken: 'data.tokens[0].value',
        refreshToken: (raw) => raw.rt,
        expiresIn: 'data.expires_in',
      })
      const tokens = map({ data: { tokens: [{ value: 'access-x' }], expires_in: 7_200 }, rt: 'refresh-x' })
      equal(tokens.accessToken, 'access-x', 'accessToken')
      equal(tokens.refreshToken, 'refresh-x', 'refreshToken')
      equal(tokens.expiresIn, 7_200, 'expiresIn')
      return '路径与函数映射均正确'
    },
  },
]

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'kind' in error) {
    const item = error as NormalizedError
    return `[${item.kind}] ${item.message}`
  }
  return error instanceof Error ? error.message : String(error)
}

export async function runAllCases(onResult: (result: CaseResult) => void): Promise<CaseResult[]> {
  const results: CaseResult[] = []
  for (const item of cases) {
    let result: CaseResult
    try {
      const detail = await item.run()
      result = { group: item.group, name: item.name, ok: true, detail }
    } catch (error) {
      result = {
        group: item.group,
        name: item.name,
        ok: false,
        detail: describeError(error),
      }
    }
    results.push(result)
    onResult(result)
  }
  return results
}

export function totalCases(): number {
  return cases.length
}
