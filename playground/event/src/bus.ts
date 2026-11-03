/**
 * 显式创建 manager 并传给插件：多 app / SSR 安全，
 * 同时用 onError 收拢 handler 异常，页面里可直接看到错误隔离效果。
 */
import { createEventManager } from '@ygzhang-lab/vue-event'
import { shallowRef } from 'vue'

import type { DemoEvents } from './events'

export const errors = shallowRef<string[]>([])

export const manager = createEventManager<DemoEvents>({
  onError: (error, event) => {
    const message = error instanceof Error ? error.message : String(error)
    errors.value = [`${String(event)} → ${message}`, ...errors.value].slice(0, 5)
  },
})
