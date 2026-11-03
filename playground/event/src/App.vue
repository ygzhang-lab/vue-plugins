<script setup lang="ts">
import { useEventManager, type EventManager } from '@ygzhang-lab/vue-event'
import { onScopeDispose } from 'vue'

import { errors } from './bus'
import Emitter from './components/Emitter.vue'
import Listener from './components/Listener.vue'
import type { DemoEvents } from './events'

const manager = useEventManager() as EventManager<DemoEvents>

// 故意抛错的 handler：不影响其它监听器，错误交给 onError 上报
const offError = manager.on('demo:error', () => {
  throw new Error('故意抛错：其它 handler 不受影响')
})
onScopeDispose(offError)

function fireError(): void {
  manager.emit('demo:error')
}
</script>

<template>
  <main class="page">
    <h1>@ygzhang-lab/vue-event 测试应用</h1>
    <p class="meta">Emitter 与 Listener 是兄弟组件，只通过事件总线通信。</p>

    <div class="panels">
      <Emitter />
      <Listener />
    </div>

    <section class="errors">
      <h2>错误隔离（onError 上报）</h2>
      <button type="button" @click="fireError">触发会抛错的 handler</button>
      <ul v-if="errors.length">
        <li v-for="(error, index) in errors" :key="`${error}-${index}`">{{ error }}</li>
      </ul>
      <p v-else class="empty">尚未捕获到 handler 异常</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 820px;
  padding: 32px;
  margin: 0 auto;
  font-family: system-ui, sans-serif;
  color: #1f2d3d;
}

.meta {
  font-size: 14px;
  color: #606266;
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  padding: 16px;
  margin: 20px 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.errors {
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.errors h2 {
  font-size: 16px;
  font-weight: 600;
}

.errors button {
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 6px;
}

.errors ul {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 12px 0 0;
  font-size: 13px;
  color: #f56c6c;
  list-style: none;
}

.empty {
  margin: 12px 0 0;
  font-size: 14px;
  color: #909399;
}
</style>
