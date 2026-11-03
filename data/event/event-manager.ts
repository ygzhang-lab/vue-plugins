/**
 * 事件管理器
 * - 零运行时依赖
 * - 支持多参数 emit
 * - handler 异常隔离
 * - once 支持通过原始 handler 卸载
 */

const ORIGINAL_HANDLER = Symbol('original-handler')

export type EventHandler = (...args: any[]) => void
export type EventKey = string | symbol
export type EventMap = Record<EventKey, any[]>

/**
 * handler 的参数类型。
 * 用 `T[K] & any[]` 而不是直接用 `T[K]`：泛型约束放宽到 `object` 后（这样才能用
 * `interface` 声明事件表，interface 没有隐式索引签名，无法满足 `Record<EventKey, any[]>`），
 * TS 仍需确认 rest 参数是数组类型，交叉 `any[]` 即可，且不丢失参数类型的推导。
 */
type EventArgs<T, K extends keyof T> = T[K] & any[]

export interface EventManagerOptions {
  /**
   * handler 抛错时的回调。默认打印到 console.error。
   * 生产环境可接入 Sentry 等上报。
   * 该回调自身抛错不会中断本次派发，会退化为 console.error。
   */
  onError?: (error: unknown, event: EventKey) => void
}

/**
 * @typeParam T 事件表：key 为事件名，value 为 handler 参数元组。
 * 可以是 `interface` 也可以是 `type` 字面量，不要求索引签名。
 */
export class EventManager<T extends object = EventMap> {
  private listeners = new Map<EventKey, Set<EventHandler>>()
  private readonly onError: (error: unknown, event: EventKey) => void

  constructor(options: EventManagerOptions = {}) {
    this.onError =
      options.onError ??
      ((err, event) => {
        // 不吞错：打印完整堆栈，但隔离单个 handler 失败
        console.error(`[EventManager] Listener error for "${String(event)}":`, err)
      })
  }

  /**
   * 注册监听器。
   * @returns 卸载函数（幂等，重复调用无害）
   */
  on<K extends keyof T & EventKey>(
    event: K,
    handler: (...args: EventArgs<T, K>) => void,
  ): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as EventHandler)
    return () => this.off(event, handler)
  }

  /**
   * 注册一次性监听器。
   * 注意：即使通过 `off(event, originalHandler)` 也能正确卸载。
   */
  once<K extends keyof T & EventKey>(
    event: K,
    handler: (...args: EventArgs<T, K>) => void,
  ): () => void {
    const original = handler as EventHandler
    const wrapped: EventHandler = (...args: any[]) => {
      // 先卸载自身，再执行：保证 handler 抛错时不会残留
      this.off(event, wrapped)
      original(...args)
    }
    // 用 Symbol 标记原始 handler，支持 off(event, originalHandler) 反查
    ;(wrapped as any)[ORIGINAL_HANDLER] = original
    this.on(event, wrapped as (...args: EventArgs<T, K>) => void)
    return () => this.off(event, wrapped)
  }

  /**
   * 卸载监听器。
   * - 不传 handler：卸载该事件所有监听器
   * - 传普通 handler：卸载直接注册的
   * - 传 once 的原始 handler：卸载对应的 wrapped
   */
  off<K extends keyof T & EventKey>(
    event: K,
    handler?: (...args: EventArgs<T, K>) => void,
  ): void {
    if (handler === undefined) {
      this.listeners.delete(event)
      return
    }
    const set = this.listeners.get(event)
    if (!set) return

    const target = handler as EventHandler
    set.delete(target)

    // 反查以 target 为原始 handler 的 once 包装（支持同一 handler 多次 once）
    for (const fn of Array.from(set)) {
      if ((fn as any)[ORIGINAL_HANDLER] === target) {
        set.delete(fn)
      }
    }

    if (set.size === 0) this.listeners.delete(event)
  }

  /**
   * 触发事件。
   * - 同步派发
   * - 快照遍历，handler 内增删监听器不影响本次派发
   * - 单个 handler 抛错不影响其他 handler
   */
  emit<K extends keyof T & EventKey>(event: K, ...args: EventArgs<T, K>): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return

    for (const handler of Array.from(set)) {
      try {
        handler(...args)
      } catch (err) {
        try {
          this.onError(err, event)
        } catch (reportError) {
          // 上报链路自身失败时，不能让剩余 handler 也被跳过
          console.error(
            `[EventManager] onError callback failed for "${String(event)}":`,
            reportError,
          )
        }
      }
    }
  }

  /** 清空全部或指定事件的监听器。用于 App 销毁 / SSR 请求结束兜底。 */
  clear(event?: EventKey): void {
    if (event === undefined) this.listeners.clear()
    else this.listeners.delete(event)
  }

  /** 调试用：当前事件的监听器数量 */
  listenerCount(event: EventKey): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /** 调试用：是否有监听器 */
  hasListeners(event: EventKey): boolean {
    return this.listenerCount(event) > 0
  }
}

export function createEventManager<T extends object = EventMap>(
  options?: EventManagerOptions,
): EventManager<T> {
  return new EventManager<T>(options)
}
