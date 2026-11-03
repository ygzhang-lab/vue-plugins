import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { FooPlugin, YgFoo } from '../index'

describe('@ygzhang-lab/vue-foo', () => {
  it('安装后注册 YgFoo 组件并注入前缀配置', () => {
    const wrapper = mount(YgFoo, {
      props: { name: 'World' },
      global: { plugins: [[FooPlugin, { prefix: 'Test' }]] },
    })

    expect(wrapper.classes()).toContain('yg-foo')
    expect(wrapper.text()).toContain('Test: World')
    expect(FooPlugin.name).toBe('ygzhang-lab:foo')
  })

  it('点击时通过 greet 事件抛出文案', async () => {
    const wrapper = mount(YgFoo, {
      global: { plugins: [FooPlugin] },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('greet')).toEqual([['YgFoo: Vue']])
  })
})
