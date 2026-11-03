import {inject,getCurrentInstance, getCurrentScope, onScopeDispose } from 'vue'
import type { InjectionKey } from 'vue'
import type {
  EventKey,
  EventMap,
} from './event-manager'
import {
  createEventManager,
  EventManager,
} from './event-manager'

/** 供 provide/inject 使用的键，便于高级用户和多 app 场景 */
export const EVENT_MANAGER_KEY: InjectionKey<EventManager<any>> =
  Symbol('EventManager')

/**
 * 模块级"活跃指针"，参考 Pinia 的 activePinia 设计。
 * 注意：SSR 下这是模块级变量，并发请求会互相覆盖。
 * SSR 请通过 app.use(EventPlugin, { manager: createEventManager() }) 隔离。
 */
let activeManager: EventManager<any> | undefined

/** 获取当前活跃 manager（懒初始化，未 install 也不会报错） */
export function getActiveEventManager(): EventManager<any> {
  if (!activeManager) {
    activeManager = createEventManager()
  }
  return activeManager
}

/** 手动设置活跃 manager（测试 / 多 app 主实例场景） */
export function setActiveEventManager(manager: EventManager<any>): void {
  activeManager = manager
}

/**
 * 门面：每次调用实时取活跃实例，避免 ES Module 绑定快照问题。
 * 多 app / SSR 场景不要使用门面，请在组件内用 useEvent（inject 优先）。
 */
export const eventBus = {
  on: (event: EventKey, handler: (...args: any[]) => void) =>
    getActiveEventManager().on(event, handler),
  once: (event: EventKey, handler: (...args: any[]) => void) =>
    getActiveEventManager().once(event, handler),
  off: (event: EventKey, handler?: (...args: any[]) => void) =>
    getActiveEventManager().off(event, handler),
  emit: (event: EventKey, ...args: any[]) =>
    getActiveEventManager().emit(event, ...args),
  clear: (event?: EventKey) => getActiveEventManager().clear(event),
  listenerCount: (event: EventKey) =>
    getActiveEventManager().listenerCount(event),
  hasListeners: (event: EventKey) =>
    getActiveEventManager().hasListeners(event),
}

/**
 * 组件内获取 manager：优先 inject（多 app 安全），回退活跃实例。
 * 必须在 setup 同步阶段调用，否则 inject 失效、自动清理失效。
 */
export function useEventManager(): EventManager<any> {
  if (getCurrentInstance()) {
    const injected = inject(EVENT_MANAGER_KEY, null)
    if (injected) return injected
  }
  return getActiveEventManager()
}

/**
 * 组件内注册事件，随 EffectScope 自动清理。
 * 必须在 setup 同步阶段调用（或 effectScope 内），异步回调中调用将退化为手动模式。
 *
 * 每次调用都以独立包装注册：多个组件 / composable 复用同一个 handler 引用时互不影响，
 * 一方卸载不会带走另一方的监听（`manager.on` 按引用去重，直接传原函数会有这个坑）。
 * 代价是 `manager.off(event, 原 handler)` 无法卸载 useEvent 注册的监听，请使用返回值。
 *
 * 类型推导建议传类型化 manager（第三个参数）或显式写两个泛型参数
 * `useEvent<MyEvents, 'foo'>('foo', handler)`：只写 `<MyEvents>` 时 `K` 会落到默认值（所有事件名的联合）。
 *
 * @param manager 可选，显式指定（测试 / 局部覆盖）；传入类型化 manager 时 handler 参数自动推导
 * @returns 卸载函数，支持手动提前卸载
 */
export function useEvent<
  T extends object = EventMap,
  K extends keyof T & EventKey = keyof T & EventKey,
>(
  event: K,
  handler: (...args: T[K] & any[]) => void,
  manager?: EventManager<T>,
): () => void {
  const m = (manager ?? useEventManager()) as EventManager<T>
  // 独立包装：避免 Set 去重把多个使用方的注册合并成一份
  const wrapped = (...args: T[K] & any[]) => {
    handler(...args)
  }
  const off = m.on(event, wrapped)
  if (getCurrentScope()) {
    onScopeDispose(off)
  }
  return off
}

/** 同 useEvent，但只触发一次；同样是独立包装，多个使用方各自触发一次 */
export function useEventOnce<
  T extends object = EventMap,
  K extends keyof T & EventKey = keyof T & EventKey,
>(
  event: K,
  handler: (...args: T[K] & any[]) => void,
  manager?: EventManager<T>,
): () => void {
  const m = (manager ?? useEventManager()) as EventManager<T>
  const wrapped = (...args: T[K] & any[]) => {
    handler(...args)
  }
  const off = m.once(event, wrapped)
  if (getCurrentScope()) {
    onScopeDispose(off)
  }
  return off
}
