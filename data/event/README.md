# Vue 3 事件插件
> 一个零依赖、支持组件生命周期自动清理与全局手动管理的 Vue 3 事件总线插件。

## 特性
- 零运行时依赖：完全自实现 EventManager 核心 ，不依赖 mitt / eventemitter3
- 组件自动清理：useEvent 基于 EffectScope，组件卸载 / scope 销毁时自动 off
- 全局手动管理：eventBus.on / off 可随时手动注册与卸载，不受组件生命周期约束
- 异常隔离：单个 handler 抛错不影响其他监听器，可接入错误上报
- 多 App / SSR 隔离：支持每个 app 独立 manager，SSR 每请求隔离
- 类型安全：可选泛型 EventMap（interface / type 均可），事件名与参数全程类型推导
- 多参数 emit：emit(event, a, b, c) 正确透传所有参数
- 可观测：listenerCount / hasListeners 便于排查监听泄漏

## 要求
- Vue >= 3.2.0+（依赖 getCurrentScope, onScopeDispose ）

## 核心概念
插件对外暴露三类 API，对应两种使用场景：
|API|场景|是否自动清理|
|---|---|---|
|useEvent / useEventOnce	|组件内（setup 同步阶段）|	组件卸载自动清理|
|eventBus.on / once	|组件外（工具函数、store、模块顶层）|	❌ 需手动 off|
|useEventManager()	|高级场景：拿到当前 manager 实例	|—|

## 快速开始
### 注册插件
``` ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import {EventPlugin} from '@/base/event'

createApp(App).use(EventPlugin).mount('#app')
```

### 组件内使用（自动清理）
```vue
<script setup lang="ts">
import { useEvent, useEventOnce } from '@/base/event'

// 组件卸载时自动移除监听，无需手动 off
useEvent('user:update', (user: { id: number; name: string }) => {
  console.log('用户更新：', user.name)
})

// 只触发一次，触发后自动移除（组件卸载时也不会残留）
useEventOnce('app:ready', () => {
  console.log('应用已就绪')
})
</script>
```

### 组件内使用（手动提前卸载）
```vue
<script setup lang="ts">
import { useEvent } from '@/base/event'

const off = useEvent('news:push', (news) => {
  console.log(news)
})

function stopListening() {
  off() // 提前卸载，卸载后组件销毁时的自动清理不会再重复执行
}
</script>

<template>
  <button @click="stopListening">停止接收推送</button>
</template>
```

### 组件内使用（销毁兜底清空）
```vue
<script setup lang="ts">
import { useEventManager } from '@/base/event'
import { onUnmounted } from 'vue'

const manager = useEventManager()

onUnmounted(() => {
  // 仅在极端场景使用（例如一个页面模块整体销毁时清理该模块专属事件）
  // 它会移除该 manager 上所有监听器，不要随意调用，会误伤其他组件
  manager.clear('module:sub-events')
})
</script>
```

### 全局非组件 JS/TS 代码使用
```ts
// src/utils/auth.ts —— 任意非组件 JS/TS 代码文件
import { eventBus } from '@/base/event'

// 手动注册：不受任何组件生命周期影响
const off = eventBus.on('auth:login', (token: string) => {
  localStorage.setItem('token', token)
})

// 在需要的地方手动卸载
off()

// 触发事件（支持多参数）
eventBus.emit('auth:login', 'abc123')
eventBus.emit('user:update', { id: 1, name: 'Tom' }, { from: 'edit-page' })
```
### 卸载某个事件的全部监听
```ts
import { eventBus } from '@/base/event'

// 卸载 'user:update' 上所有监听器
eventBus.off('user:update')
```

## 行为约定（生产必读）
以下行为均有测试覆盖（`src/base/event/__tests__`），升级前请确认仍然成立。

### 同步派发
- `emit` 同步执行全部监听器，返回即表示本次派发结束；handler 返回的 Promise 不会被 await，也不会进 `onError`，异步错误请自行 `try/catch`。
- 派发使用注册时刻的快照：派发期间新增的监听器下次生效，派发期间 `off` 掉的监听器本次仍可能执行。
- 嵌套 `emit` 会立即执行内层派发。

### 监听器去重（Set 语义）
- `manager.on` / `eventBus.on` 按 handler 引用去重：同一个函数在同一事件上重复注册只保留一份，`off(event, handler)` 一次移除该 handler 的全部注册。
- `useEvent` / `useEventOnce` **每次调用都以独立包装注册**，不做去重：多个组件或 composable 复用同一个模块级 handler 时互不影响，一方卸载不会带走另一方。
- 因此共享 handler 时优先用 `useEvent`；用 `eventBus.on` 手动注册时，请确保每个使用方有自己的 handler。
- 同一组件内重复调用同一个 `useEvent`（或重复调用封装它的 composable）会注册多份，handler 收到多次；composable 请只在 setup 里调用一次。
- 代价：`manager.off(event, 原 handler)` 卸载不到 `useEvent` 包装过的监听，请使用 `useEvent` 的返回值 `off()`。

### 组件生命周期
- 监听绑定在 **EffectScope**：setup 内注册 → 组件卸载自动 off；`<KeepAlive>` 缓存期间组件未卸载，监听会一直保留（deactivated 不会触发清理）。
- 页面切后台 / bfcache（微信 H5 返回、iOS 侧滑返回）也不会触发清理，此时监听仍会在收到 `emit` 时执行；如需按页面可见性暂停，请在 `onDeactivated` / `pagehide` 里手动 `off()` 并重新注册。

### once
- `once` 在触发前先移除自身，handler 抛错也不会残留。
- `once` 未触发时，用原始 handler（而非包装函数）通过 `off(event, handler)` 卸载。

### 错误隔离
- 单个 handler 抛错不会中断后续 handler，错误交给 `onError`，默认 `console.error`。
- `onError` 自身抛错同样不会中断派发，会退化为 `console.error`。

### 浏览器与微信 H5（对齐 vite legacy 配置）
- 运行时只依赖 ES2015 API：`Map` / `Set` / `Symbol` / `Array.from` / `console`；语法只到 ES2020（`options.onError ?? …`、`listeners.get(event)?.size`），不访问 DOM / window，因此 PC 浏览器、移动端 H5、微信内置浏览器的行为一致。
- 项目支持矩阵为 **iOS 16+ / Chrome 80+**（`vite.config.ts` 的 legacy `targets` 同为 `ios >= 16` / `chrome >= 80`）。矩阵内浏览器都命中 modern 产物，构建时按 plugin-legacy 的 `modernTargets`（含 `chrome64` / `safari12`）转译，`??` / `?.` 会被降级，组件无需额外处理。
- 矩阵外的较新内核实测仍可用：Chromium 64–79、Safari 12+ 走 modern 产物（已降级到 chrome64 / safari12 基线）。
- legacy 产物按 `targets: ios >= 16 / chrome >= 80` 转译，其中仍含 `??` / `?.`，因此只能被支持 ES2020 的浏览器解析；无 ESM 的老内核（旧 X5、Android 8 WebView）不在本项目的支持矩阵内。
- 事件名建议用常量对象集中声明，避免多页面拼写漂移（拼错的 emit 没有监听器，静默不报错）。
- 生产构建若开启 `VITE_DROP_CONSOLE=1`，默认 `onError` 的 `console.error` 会被整体移除，handler 异常将完全静默；上线前请通过 `createEventManager({ onError })` 接入项目 logger 或上报平台。

### 调试与兜底
- `listenerCount(event)` / `hasListeners(event)`：排查泄漏，返回监听器数量 / 是否存在。
- `clear(event)` 清空单个事件，`clear()` 清空全部（App 销毁、SSR 请求结束兜底）。

### 活跃实例
- `eventBus` 门面每次调用实时读取活跃 manager，`setActiveEventManager()` 切换后立即生效。
- SSR 下活跃指针是模块级变量，务必用 `app.use(EventPlugin, { manager: createEventManager() })` 隔离，并在组件内使用 `useEvent`。


## 进阶用法
### 一次性监听（手动场景）
```ts
import { eventBus } from '@/base/event'

// 触发一次后自动移除
eventBus.once('app:ready', () => {
  console.log('ready')
})

// 即使注册时用的是 once，也能通过原始 handler 卸载
const handler = () => console.log('hi')
eventBus.once('demo', handler)
eventBus.off('demo', handler) // 正确移除
```

### 错误处理与上报
```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import {EventPlugin,createEventManager} from '@/base/event'
import * as Sentry from '@sentry/browser'

const manager = createEventManager({
  onError: (error, event) => {
    Sentry.captureException(error, {
      tags: { event: String(event) },
    })
  },
})
// 通过插件传入
createApp(App).use(EventPlugin, { manager }).mount('#app')
```

### 类型安全（推荐）
```ts
// src/types/events.ts
import { createEventManager } from '@/base/event'

export interface AppEvents {
  'user:update': [{ id: number; name: string }]
  'auth:login': [token: string]
  'notify': [message: string, level?: 'info' | 'error']
}

export const typedManager = createEventManager<AppEvents>()
```
> 事件表既可以用 `interface`，也可以用 `type` 字面量（不要求索引签名）；数字字面量事件名不受支持，请用 string / symbol。
> 使用类型化 manager 时，通过 useEvent 的第三个参数显式传入，或通过插件 options.manager 传入。
```ts
<script setup lang="ts">
import { useEvent } from '@/base/event'
import { typedManager } from '@/types/events'

useEvent(
  'user:update',
  (user) => {
    // user 自动推导为 { id: number; name: string }
    console.log(user.name)
  },
  typedManager,
)
</script>
```

### 多 App 实例隔离
> 当同一页面挂载多个 Vue app（如微前端）时，每个 app 使用独立 manager：
```ts
import { createApp } from 'vue'
import { EventPlugin, createEventManager } from '@/base/event'

const appA = createApp(AppA)
appA.use(EventPlugin, { manager: createEventManager() })

const appB = createApp(AppB)
appB.use(EventPlugin, { manager: createEventManager() })
// 组件内 useEvent 通过 inject 拿到各自 manager，互不干扰
```

### SSR（服务端渲染）
> 每个请求创建独立 manager，并在组件内只使用 useEvent，禁止使用 eventBus 门面。
```ts
// server.ts
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { EventPlugin, createEventManager } from '@/base/event'

export async function render(url: string) {
  const app = createSSRApp(App)
  // 每请求独立 manager，不污染模块级活跃指针
  app.use(EventPlugin, { manager: createEventManager() })

  const html = await renderToString(app)
  return html
}
```
> 组件内 SSR 环境
```vue
<script setup lang="ts">
import { useEvent } from '@/base/event'
// ✅ 正确：通过 inject 使用请求级 manager
useEvent('user:update', (user) => console.log(user))
</script>
```
```vue
<script setup lang="ts">
// ❌ 错误：SSR 中不要使用门面，会跨请求串数据
import { eventBus } from  '@/base/event'
eventBus.on('user:update', handler) // 请求 A 的监听器可能被请求 B 触发
</script>
````

## 测试
行为由 Vitest 覆盖（`src/base/event/__tests__/`，node 环境，通过自定义渲染器驱动真实组件生命周期，不依赖 jsdom）：

```bash
pnpm test src/base/event   # 核心派发、once、错误隔离、类型推导、组件自动清理、多 App 隔离
pnpm typecheck             # 类型断言（接口事件表 / 非法调用）
```
