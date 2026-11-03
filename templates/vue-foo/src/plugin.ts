import { ref, type App, type Plugin } from 'vue'

import YgFoo from './components/YgFoo.vue'
import { fooConfigKey } from './composables/useFoo'

export interface FooPluginOptions {
  /** 文案前缀，默认 'YgFoo' */
  prefix?: string
}

/**
 * 插件对象。
 * name 带 scope 前缀，避免多个插件在 Vue Devtools 中出现重名。
 * 重复 app.use 由 Vue 自身按插件对象去重并警告，无需自行判断。
 */
export const FooPlugin: Plugin<[FooPluginOptions?]> & { name: string } = {
  name: 'ygzhang-lab:foo',

  install(app: App, options: FooPluginOptions = {}) {
    app.provide(fooConfigKey, ref({ prefix: options.prefix ?? 'YgFoo' }))
    app.component('YgFoo', YgFoo)
  },
}

export default FooPlugin
