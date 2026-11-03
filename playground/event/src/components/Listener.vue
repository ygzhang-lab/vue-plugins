<script setup lang="ts">
import { useEvent, useEventManager, useEventOnce, type EventManager } from '@ygzhang-lab/vue-event'
import { ref } from 'vue'

import type { DemoEvents } from '../events'

// 传类型化 manager：T 从第三个参数推导，handler 参数自动匹配事件表
const manager = useEventManager() as EventManager<DemoEvents>
const logs = ref<string[]>([])

function push(text: string): void {
  logs.value = [text, ...logs.value].slice(0, 8)
}

// 组件卸载时由 EffectScope 自动 off
useEvent('demo:message', (text) => {
  push(`message: ${text}`)
}, manager)

// 只触发一次；未触发时同样随组件卸载清理
useEventOnce('demo:once', () => {
  push('once: 仅触发一次')
}, manager)
</script>

<template>
  <section class="listener">
    <h2>Listener（接收方）</h2>
    <ul v-if="logs.length">
      <li v-for="(log, index) in logs" :key="`${log}-${index}`">{{ log }}</li>
    </ul>
    <p v-else class="empty">尚未收到事件</p>
  </section>
</template>

<style scoped>
.listener h2 {
  font-size: 16px;
  font-weight: 600;
}

ul {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 10px 0 0;
  list-style: none;
}

li {
  padding: 6px 10px;
  font-size: 13px;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 4px;
}

.empty {
  margin: 10px 0 0;
  font-size: 14px;
  color: #909399;
}
</style>
