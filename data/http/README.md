# @/http — 插件化 HTTP 客户端

> 基于 Axios 的插件化 HTTP 客户端封装，聚焦认证（JWT / API Key）、无感刷新、持久化恢复与统一错误处理。
> **领域层与传输层分离**，业务代码只感知标准化的 token 状态和归一化错误。

---

## 目录

- [概览](#概览)
- [架构](#架构)
- [快速开始](#快速开始)
- [核心模块](#核心模块)
- [插件清单](#插件清单)
- [常见场景](#常见场景)
- [API 参考](#api-参考)
- [设计决策](#设计决策)
- [边界与不做的事](#边界与不做的事)

---

## 概览

### 特性

| 能力 | 说明 |
|---|---|
| 🧩 **插件化** | 每个能力一个独立文件、一个 `HttpPlugin`，按需注册 |
| 🔐 **JWT 认证** | 请求注入、主动刷新、401 被动刷新、并发去重、失败冷却 |
| 🔑 **API Key 认证** | 与 JWT 可共存，请求级 `skipAuth` / `skipApiKey` 控制 |
| 💾 **持久化** | localStorage / sessionStorage / 内存，支持 refreshToken 分离策略 |
| 🔄 **静默恢复** | 二次进入时自动 hydrate + 必要时刷新，用户无感知 |
| 🗂️ **多 Tab 同步** | 其他 tab 登录/登出/刷新自动同步，版本号守卫防回退 |
| 📡 **细粒度事件** | `hydrate` / `login` / `refresh` / `expire` / `invalid` / `clear` / `change` |
| 🎯 **字段映射** | 声明式 mapper，适配任意后端返回结构（点路径 / 数组 / 函数） |
| 📦 **响应解包** | `ApiResponse<T>` 自动解包为 `T`，业务错误统一抛出 |
| 🧯 **错误归一化** | 网络 / 超时 / HTTP / 业务 / 取消 统一为 `NormalizedError` |

### 不做的事

- ❌ Fetch 适配（仅 Axios，插件与 `AxiosInstance` 深度绑定）
- ❌ 请求库运行时切换
- ❌ 拦截器模型抽象（直接使用 Axios 原生）

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      业务代码 / UI                        │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
        ┌───────▼────────┐        ┌───────▼────────┐
        │  Pinia 门面     │        │  http.get()    │
        │  (isLoggedIn)  │        │  (业务请求)     │
        └───────┬────────┘        └───────┬────────┘
                │ subscribe                │
                │                         │
┌───────────────▼─────────────────────────▼───────────────┐
│                    领域层（传输无关）                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐     │
│  │TokenStore│◄─┤TokenRefresher│◄─┤SessionBootstrap│    │
│  └────┬─────┘  └──────────────┘  └───────────────┘     │
│       │                                                  │
│  ┌────▼──────────┐  ┌──────────────┐                    │
│  │ Storage 适配器 │  │ TokenMapper  │                    │
│  └───────────────┘  └──────────────┘                    │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│                    传输层（Axios 绑定）                    │
│  createHttp → AxiosInstance                              │
│    ├─ request-config     (defaults)                     │
│    ├─ jwt-auth           (JWT 注入 + 401 重放)           │
│    ├─ api-key-auth       (API Key 注入)                  │
│    ├─ headers            (自定义 header)                 │
│    ├─ response-unwrap    (数据解包)                      │
│    └─ error-normalizer   (错误归一化)                    │
└─────────────────────────────────────────────────────────┘
```

### 目录结构

```
src/base/http/
├── types.ts                    # 公共类型 + axios 模块声明合并
├── token-store.ts              # Token 状态 + 事件 + 状态查询
├── token-refresher.ts          # 刷新编排单例（bootstrap 与 401 共享）
├── session-bootstrap.ts        # 启动静默恢复
├── token-mapper.ts             # 后端字段 → AuthTokens 映射
├── create-http.ts              # 工厂：创建实例 + 注册插件
├── index.ts                    # 统一导出
├── storage/
│   ├── memory.ts               # 内存适配器（测试 / SSR）
│   ├── web-storage.ts          # localStorage / sessionStorage
│   └── synced.ts               # 多 tab 同步桥接
└── plugins/
    ├── request-config.ts       # 请求默认配置
    ├── headers.ts              # 自定义 header
    ├── api-key-auth.ts         # API Key 认证
    ├── jwt-auth.ts             # JWT 认证 + 刷新
    ├── response-unwrap.ts      # 响应解包
    └── error-normalizer.ts     # 错误归一化
```

---

## 快速开始

### 1. 配置客户端

```typescript
// src/api/client.ts
import axios from 'axios';
import {
  TokenStore,
  TokenRefresher,
  webStorageAdapter,
  createTokenMapper,
  createAppHttp,
} from '@/http';

// 持久化：accessToken 落盘，refreshToken 走 httpOnly cookie
export const storage = webStorageAdapter({
  key: 'app.auth',
  refreshTokenStrategy: 'omit',
});

// Token 状态（构造时不恢复，等 hydrate）
export const tokenStore = new TokenStore({ storage });

// 独立刷新实例（不挂拦截器，避免 401 递归）
const refreshClient = axios.create({ baseURL: '/api', timeout: 10_000 });

const mapAuthResponse = createTokenMapper({
  accessToken: 'data.access_token',
  refreshToken: 'data.refresh_token',
  expiresIn: 'data.expires_in',
  tokenType: 'data.token_type',
});

// 刷新编排单例
export const refresher = new TokenRefresher({
  tokenStore,
  refresh: async (rt, signal) => {
    const { data } = await refreshClient.post(
      '/auth/refresh',
      rt ? { refreshToken: rt } : {},
      { signal } // 超时由 Refresher abort
    );
    return mapAuthResponse(data);
  },
  onRefreshFailed: (_err, reason) => {
    if (reason !== 'bootstrap') tokenStore.clear('refresh-failed');
  },
});

// HTTP 实例
export const http = createAppHttp({
  baseURL: '/api',
  staticHeaders: { 'X-Client-Version': '1.0.0' },
  jwt: { tokenStore, refresher, refreshBeforeExpirationMs: 60_000 },
});
```

### 2. 应用启动

```typescript
// src/main.ts
import { createApp } from 'vue';
import { router } from './router';
import { tokenStore, refresher, storage } from './api/client';
import { restoreSession, syncTokenStoreWithStorage } from '@/http';

async function bootstrap() {
  // 1. 水合：从持久化恢复 → 触发 'hydrate'
  await tokenStore.hydrate();

  // 2. 静默恢复：必要时刷新 accessToken
  const result = await restoreSession({ tokenStore, refresher });
  console.info('[auth] bootstrap:', result.status);

  // 3. 多 tab 同步
  syncTokenStoreWithStorage(tokenStore, storage);

  // 4. 过期监控
  tokenStore.watchExpiration({ intervalMs: 30_000 });

  createApp(App).use(router).mount('#app');
}

bootstrap();
```

### 3. 登录 / 登出

```typescript
// src/api/auth.ts
import { http, tokenStore, mapAuthResponse } from './client';

export async function login(username: string, password: string) {
  const { data } = await http.post('/auth/login', { username, password }, { skipAuth: true });
  tokenStore.setTokens(mapAuthResponse(data), { event: 'login' });
}

export async function logout() {
  try {
    await http.post('/auth/logout', null, { skipAuth: true });
  } finally {
    // 只清理会话；过期监控属于应用生命周期，SPA 内重新登录后可继续生效
    tokenStore.clear('logout');
  }
}
```

---

## 核心模块

### TokenStore

**唯一职责**：保存 token 状态、提供状态查询、发出细粒度事件。

| 方法 | 说明 |
|---|---|
| `await hydrate()` | 从 storage 恢复，规范化字段，触发 `hydrate` 事件 |
| `hydrateFromExternal(snapshot)` | 从其他 tab 注入，`version` 守卫防回退 |
| `setTokens(tokens, { event })` | 登录/刷新写入，自动持久化 + 事件 |
| `updateTokens(partial)` | 局部更新 |
| `clear(reason)` | 清空（登出） |
| `markInvalid(reason)` / `markExpired(reason)` | 手动触发失效/过期事件 |
| `getStatus()` | `'anonymous' \| 'valid' \| 'expiring' \| 'expired' \| 'unknown'` |
| `isAuthenticated()` | 路由守卫用，`valid \| expiring \| unknown` 为 true |
| `isExpiringSoon(ms?)` | 是否临近过期 |
| `getAccessToken()` / `getRefreshToken()` / `getVersion()` / `getSnapshot()` | 读取 |
| `on(type, fn)` / `once(type, fn)` / `off(type, fn)` | 事件订阅 |
| `subscribe(fn)` | 向后兼容，等价于 `on('change', ...)` |
| `watchExpiration(opts)` | 启动过期轮询，触发 `expire` 事件；`clear()` 不会停止它，应用销毁时再调用 `stopExpirationWatch()` |

**事件类型**：

| 事件 | 触发时机 |
|---|---|
| `hydrate` | `hydrate()` 从持久化恢复成功 |
| `login` | 从无 token 到有 |
| `refresh` | 已有 token 被替换（含外部同步） |
| `expire` | 检测到 accessToken 过期 |
| `invalid` | 被显式标记失效（如刷新失败） |
| `clear` | 手动清空或外部登出 |
| `change` | 任意变更都触发（总汇事件） |

**状态语义**：

| 状态 | 条件 | `isAuthenticated` |
|---|---|---|
| `anonymous` | 无任何 token | ❌ |
| `valid` | 有 accessToken，`expiresAt` 未到 | ✅ |
| `expiring` | 剩余时间 ≤ 阈值 | ✅ |
| `expired` | 有 accessToken 但已过期 | ❌ |
| `unknown` | 有 accessToken 但无 `expiresAt` | ✅（交给 401 兜底） |

### TokenRefresher

**唯一职责**：刷新流程编排。bootstrap 与 401 兜底共享同一单例。

| 能力 | 说明 |
|---|---|
| 单例去重 | 并发请求只触发一次真实刷新（`inflight`） |
| 失败冷却 | `cooldownMs`（默认 10s）内不再刷新，避免雪崩 |
| 超时保护 | `timeoutMs`（默认 10s），超时 abort 底层请求，防止 bootstrap 卡死 |
| 空 token 短路 | `requireRefreshToken: true` 时无 refreshToken 直接失败（same / separate 策略建议开启） |
| 事件联动 | 成功后 `tokenStore.setTokens` 自动触发 `refresh` 事件 |

```typescript
export const refresher = new TokenRefresher({
  tokenStore,
  refresh: (rt, signal) =>
    refreshClient.post('/auth/refresh', { refreshToken: rt }, { signal }).then(r => map(r.data)),
  cooldownMs: 10_000,
  timeoutMs: 10_000,
  // refreshToken 落盘（same / separate）时建议开启；cookie 模式保持默认 false
  // requireRefreshToken: true,
  onRefreshed: (snapshot, reason) => console.info(`[auth] refreshed by ${reason}`),
  onRefreshFailed: (err, reason) => console.error(`[auth] refresh failed by ${reason}`, err),
});
```

**刷新原因**：

| Reason | 触发方 |
|---|---|
| `bootstrap` | `restoreSession()` 启动恢复 |
| `proactive` | `jwtAuthPlugin` 请求前主动刷新 |
| `unauthorized` | `jwtAuthPlugin` 401 被动刷新 |

### SessionBootstrap

**唯一职责**：启动时判断状态并调用 Refresher。前置条件：`await tokenStore.hydrate()`。

```typescript
const result = await restoreSession({
  tokenStore,
  refresher,
  expiringThresholdMs: 60_000,
  preemptive: false, // true 时 accessToken 有效也后台预热刷新
});
```

| 返回状态 | 条件 | 行为 |
|---|---|---|
| `anonymous` | 无任何 token | 进登录页 |
| `authenticated` | accessToken 有效 | 直接进业务页 |
| `refreshed` | 过期/临近过期/unknown，刷新成功 | 用户无感知 |
| `expired` | 刷新失败 | 引导登录，保留 refreshToken 待重试 |

### TokenMapper

**唯一职责**：后端返回字段 → 标准 `AuthTokens`。

```typescript
const map = createTokenMapper({
  accessToken: 'data.access_token',            // 点路径
  refreshToken: 'data.tokens[0].value',        // 数组索引
  expiresIn: 'data.expires_in',
  expiresAt: (r) => new Date(r.exp).getTime(), // 函数
});
const tokens = map(rawResponse); // → AuthTokens
```

### Storage

| 适配器 | 场景 |
|---|---|
| `memoryStorageAdapter()` | 单测 / SSR / 敏感环境 |
| `webStorageAdapter(opts)` | localStorage / sessionStorage |
| `syncTokenStoreWithStorage(store, storage)` | 多 tab 同步桥接 |

**`webStorageAdapter` 关键选项**：

| 选项 | 默认 | 说明 |
|---|---|---|
| `key` | `'app.auth'` | 主存储 key |
| `refreshTokenStrategy` | `'same'` | `'same'` / `'omit'` / `'separate'` |
| `maxAgeMs` | 30 天 | 持久化兜底有效期；缺少/非法 `_savedAt` 的旧数据视为过期，`0` 表示不校验 |
| `storage` | 自动 | SSR 下自动降级为内存 |

**refreshToken 策略**：

| 策略 | 场景 |
|---|---|
| `'same'` | 简单场景，accessToken + refreshToken 一起存 |
| `'omit'` | **推荐**，refreshToken 走 httpOnly cookie |
| `'separate'` | refreshToken 单独 key + 可选加密 |

---

## 插件清单

| 插件 | 职责 | 配置 |
|---|---|---|
| `requestConfigPlugin` | 合并 `axios.create` 默认配置 | `baseURL` / `timeout` / `withCredentials` 等 |
| `headersPlugin` | 注入静态/函数型 header | `Record<string, string \| () => string \| undefined \| Promise<string \| undefined>>` |
| `apiKeyAuthPlugin` | 注入 API Key | `getApiKey` / `headerName` |
| `jwtAuthPlugin` | JWT 注入 + 401 刷新 + 重放 | `tokenStore` / `refresher` / `refreshBeforeExpirationMs` |
| `responseUnwrapPlugin` | `ApiResponse<T>` 解包为 `T` | `isSuccess(code)` |
| `errorNormalizerPlugin` | 错误归一化 | 无 |

**注册顺序**（`createAppHttp` 内部）：

```
request-config → jwt-auth → api-key-auth → headers → response-unwrap → error-normalizer
```

> axios 拦截器的执行顺序与注册顺序相关：
>
> - **请求拦截器 LIFO**（后注册先执行）：实际为 `headers → api-key-auth → jwt-auth`。认证头最后写入，会覆盖 `staticHeaders` 中的同名头，认证优先级最高。
> - **响应拦截器 FIFO**（先注册先执行）：实际为 `jwt-auth(401 重放) → response-unwrap → error-normalizer`。`error-normalizer` 必须最后注册，才能兜住 `response-unwrap` 抛出的业务错误。

**请求级控制**：

```typescript
http.get('/public', { skipAuth: true });          // 不注入 JWT
http.get('/machine', { skipApiKey: true });       // 不注入 API Key
http.post('/login', data, { skipAuth: true });    // 登录接口
```

---

## 常见场景

### 路由守卫

```typescript
router.beforeEach((to) => {
  // bootstrap 已完成，isAuthenticated 是最终态
  if (to.meta.requiresAuth && !tokenStore.isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && tokenStore.isAuthenticated()) {
    return { name: 'home' };
  }
});
```

### Pinia 门面

```typescript
export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(tokenStore.isAuthenticated());
  const tokenType = ref(tokenStore.getTokenType());

  tokenStore.on('change', () => {
    isLoggedIn.value = tokenStore.isAuthenticated();
    tokenType.value = tokenStore.getTokenType();
  });

  return { isLoggedIn, tokenType };
});
```

> **不要**在 Pinia 里再存一份 accessToken，`TokenStore` 是唯一数据源。

### 事件订阅

```typescript
tokenStore.on('hydrate', ({ snapshot }) => {
  console.info('[auth] restored, expiresAt =', snapshot.expiresAt);
});

tokenStore.on('refresh', ({ snapshot, previous }) => {
  console.info(`[auth] v${previous?.version} → v${snapshot.version}`);
});

tokenStore.on('expire', () => console.warn('[auth] token expired'));

tokenStore.on('invalid', ({ reason }) => {
  console.error('[auth] invalid:', reason);
  router.replace('/login?reason=expired');
});

tokenStore.on('clear', ({ reason }) => {
  if (reason === 'logout') router.replace('/login');
});

tokenStore.once('refresh', () => toast.success('登录已续期'));
```

### 取消请求

```typescript
const ctrl = new AbortController();
const p = http.get('/user/me', { signal: ctrl.signal });
ctrl.abort();

try {
  await p;
} catch (e) {
  if ((e as NormalizedError).kind === 'canceled') return; // 静默忽略
}
```

### 上传进度

```typescript
await http.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (e) => {
    if (e.total) console.log(`${Math.round((e.loaded / e.total) * 100)}%`);
  },
});
```

### 处理归一化错误

```typescript
try {
  await http.get('/user/me');
} catch (e) {
  const err = e as NormalizedError;
  switch (err.kind) {
    case 'business':  toast.error(err.message); break;
    case 'http':      err.status === 403 ? router.replace('/403') : toast.error(err.message); break;
    case 'timeout':   toast.warn('请求超时'); break;
    case 'network':   toast.error('网络异常'); break;
    case 'canceled':  /* 静默 */ break;
    default:          console.error(err); break;
  }
}
```

---

## API 参考

### `createAppHttp(options)`

```typescript
interface HttpFactoryOptions {
  baseURL: string;
  timeout?: number;                       // 默认 15_000
  staticHeaders?: Record<string, string>;
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
}

function createAppHttp(options: HttpFactoryOptions): AxiosInstance;
```

### `JwtAuthOptions`

```typescript
interface JwtAuthOptions {
  tokenStore: TokenStore;
  refresher: TokenRefresher;
  refreshBeforeExpirationMs?: number; // 默认 60_000
}
```

### `ApiKeyAuthOptions`

```typescript
interface ApiKeyAuthOptions {
  getApiKey: () => string | undefined | Promise<string | undefined>;
  headerName?: string; // 默认 'X-API-Key'
}
```

### `AuthTokens`

```typescript
interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;    // 默认 'Bearer'
  expiresIn?: number;    // 秒
  expiresAt?: number;    // 毫秒，优先级高于 expiresIn
}
```

### `NormalizedError`

```typescript
interface NormalizedError {
  kind: 'network' | 'timeout' | 'http' | 'business' | 'canceled' | 'unknown';
  status?: number;
  code?: number;
  message: string;
  raw: unknown;
}
```

**分类规则**：

| `kind` | 触发条件 | 关键字段 |
|---|---|---|
| `business` | HTTP 2xx 但业务码失败（`response-unwrap` 抛出） | `code` / `raw` |
| `canceled` | 请求被 `AbortSignal` 取消（axios `ERR_CANCELED`） | `raw` |
| `timeout` | axios 超时（`ECONNABORTED` / `ETIMEDOUT`） | `raw` |
| `network` | 无响应（断网、DNS、CORS） | `raw` |
| `http` | 收到非 2xx 响应；`message` 优先取后端 `message` / `msg`，否则为「请求失败（status）」 | `status` / `raw` |
| `unknown` | 非 axios 错误或拦截器内部错误 | `raw` |

---

## 设计决策

### 为什么 TokenStore 不直接用 Pinia

- **循环依赖**：Pinia store 要调 `http.login()`，http 拦截器又要读 store
- **初始化时序**：http 实例通常模块顶层创建，此时 Pinia 未挂载
- **SSR 泄漏**：Pinia 按请求实例化，http 模块级单例会让 token 串味
- **测试成本**：`new TokenStore()` 零依赖，拦截器单测不用 mock Vue

**正确做法**：`TokenStore` 为唯一数据源，Pinia 通过 `on('change')` 单向镜像 UI 关心的字段。

### 为什么 Refresher 要独立

`restoreSession`（启动）和 `jwtAuthPlugin`（401）都要刷新。若各自持有 `refreshPromise`：

- 启动刷新进行中，首页第一个请求 401 会触发第二次刷新
- 冷却期状态不同步

`TokenRefresher` 单例让 `inflight` 和 `lastFailedAt` 天然共享。

### 为什么 hydrate 要显式

构造函数静默恢复会让订阅者收不到"已恢复登录态"的通知，推拉不一致。显式 `hydrate()` 保证：

- 所有后续判断基于已水合状态
- UI 收到与首次登录一致的 `hydrate` 事件
- 启动时序可控：`hydrate → restoreSession → mount`

### 为什么 401 重放要用版本号

仅靠 `refreshPromise` 去重不够：A、B 同时 401，A 刷新完成后 `inflight` 置空，B 稍后进入会**再刷新一次**。

`config._tokenVersion` 记录请求发出时的版本，401 时若发现 `_tokenVersion !== tokenStore.getVersion()`，说明其他请求已刷新，直接取新 token 重放。

### 为什么 Refresher 超时

`bootstrap` 阶段如果刷新接口无响应，`restoreSession` 会永远挂起，`app.mount` 永不执行。`timeoutMs` 兜底后 `onRefreshFailed` 可引导进入登录页；超时同时会 abort 传给 `refresh` 的 `signal`，避免底层请求继续占用连接。

---

## 边界与不做的事

| 边界 | 说明 |
|---|---|
| **仅 Axios** | `HttpPlugin.setup(instance: AxiosInstance)` 与 Axios 深度绑定 |
| **不做 Fetch 抽象** | 领域层已与传输无关，未来加 Fetch 只需新增 `plugins-fetch/` 和 `create-fetch.ts`，`TokenStore` / `Refresher` / `Storage` 零改动 |
| **不做拦截器抽象** | Axios 拦截器模型够用，多一层抽象只增加理解成本 |
| **不做 `transformRequest` 插件** | 与 `responseUnwrap` 冲突，按需在单次请求上传 |
| **refreshToken 安全** | 推荐 `refreshTokenStrategy: 'omit'` + httpOnly cookie；localStorage 存 refreshToken 有 XSS 窃取风险 |

### 持久化安全建议

| 存储位置 | 适合存 | 风险 |
|---|---|---|
| localStorage | accessToken（短有效期） | XSS 可窃取 |
| localStorage + AES | accessToken（混淆） | 密钥在前端，XSS 仍可解 |
| **httpOnly cookie** | **refreshToken（推荐）** | CSRF，靠 SameSite 防 |
| 内存 | accessToken（最安全） | 刷新页面丢失，靠 cookie 恢复 |

**推荐组合**：refreshToken 走 httpOnly cookie，accessToken 落 localStorage + `restoreSession` 启动时用 cookie 静默换新。
