import type { App } from 'vue'
import { EventManager } from './event-manager'
import { EVENT_MANAGER_KEY, getActiveEventManager } from './event-bus'

export interface EventPluginOptions {
  /**
   * 显式指定 manager。
   * - 传入时：provide 它，**不**污染全局活跃指针（多 app / SSR 安全）
   * - 不传时：使用（或懒初始化）全局活跃 manager（单 app 便捷模式）
   */
  manager?: EventManager<any>
}

export const EventPlugin = {
  install(app: App, options: EventPluginOptions = {}) {
    let manager: EventManager<any>

    if (options.manager) {
      manager = options.manager
      // 关键：不调用 setActiveEventManager，避免 SSR 并发请求互相覆盖
    } else {
      manager = getActiveEventManager() // 懒初始化，赋值给 activeManager
    }

    app.provide(EVENT_MANAGER_KEY, manager)
    app.config.globalProperties.$event = manager
  },
}

// 扩展组件实例类型，使模板 / 选项式 API 中的 $event 有类型
declare module 'vue' {
  interface ComponentCustomProperties {
    $event: EventManager<any>
  }
}

// 统一导出
export { EventManager, createEventManager } from './event-manager'
export type {
  EventHandler,
  EventKey,
  EventMap,
  EventManagerOptions,
} from './event-manager'
export {
  EVENT_MANAGER_KEY,
  eventBus,
  getActiveEventManager,
  setActiveEventManager,
  useEvent,
  useEventManager,
  useEventOnce,
} from './event-bus'
