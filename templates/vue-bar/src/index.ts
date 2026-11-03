import { formatLabel } from '@ygzhang-lab/internal'
import type { App, Plugin } from 'vue'

export interface BarPluginOptions {
  /** ping() 使用的问候语，默认 'pong' */
  greeting?: string
}

/** 插件注入到组件实例上的全局 API */
export interface BarApi {
  greeting: string
  ping: () => string
}

declare module 'vue' {
  interface ComponentCustomProperties {
    /** 由 @ygzhang-lab/vue-bar 注入，需先 app.use(BarPlugin) */
    $bar: BarApi
  }
}

/**
 * 插件对象：name 带 scope 前缀，避免 Vue Devtools 中重名。
 */
export const BarPlugin: Plugin<[BarPluginOptions?]> & { name: string } = {
  name: 'ygzhang-lab:bar',

  install(app: App, options: BarPluginOptions = {}) {
    const greeting = options.greeting ?? 'pong'

    app.config.globalProperties.$bar = {
      greeting,
      ping: () => formatLabel('bar', greeting),
    }
  },
}

export default BarPlugin
