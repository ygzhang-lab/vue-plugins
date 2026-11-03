/**
 * @ygzhang-lab/vue-event 包入口：Vue 插件 + 事件总线 + 组合式函数。
 */
import type { App, Plugin } from 'vue'
import { EVENT_MANAGER_KEY, getActiveEventManager } from './event-bus'
import type { EventManager } from './event-manager'

export interface EventPluginOptions {
  /**
   * 显式指定 manager。
   * - 传入时：provide 它，**不**污染全局活跃指针（多 app / SSR 安全）
   * - 不传时：使用（或懒初始化）全局活跃 manager（单 app 便捷模式）
   */
  manager?: EventManager<any>
}

// 扩展组件实例类型，使模板 / 选项式 API 中的 $event 有类型
declare module 'vue' {
  interface ComponentCustomProperties {
    /** 由 @ygzhang-lab/vue-event 注入，需先 app.use(EventPlugin) */
    $event: EventManager<any>
  }
}

/**
 * 插件对象。name 带 scope 前缀，避免 Vue Devtools 中重名。
 * 重复 app.use 由 Vue 自身按插件对象去重。
 */
export const EventPlugin: Plugin<[EventPluginOptions?]> & { name: string } = {
  name: 'ygzhang-lab:event',

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

export default EventPlugin

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
