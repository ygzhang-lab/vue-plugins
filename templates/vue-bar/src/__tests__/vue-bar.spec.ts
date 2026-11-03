import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import { BarPlugin } from '../index'

describe('@ygzhang-lab/vue-bar', () => {
  it('安装后向组件实例注入 $bar', () => {
    const app = createApp(defineComponent({ render: () => h('div') }))
    app.use(BarPlugin, { greeting: 'hello' })

    const vm = app.mount(document.createElement('div')) as unknown as { $bar: { ping: () => string } }

    expect(vm.$bar.ping()).toBe('bar: hello')
    expect(BarPlugin.name).toBe('ygzhang-lab:bar')
  })

  it('未传选项时使用默认问候语', () => {
    const app = createApp(defineComponent({ render: () => h('div') }))
    app.use(BarPlugin)

    const vm = app.mount(document.createElement('div')) as unknown as { $bar: { greeting: string } }

    expect(vm.$bar.greeting).toBe('pong')
  })
})
