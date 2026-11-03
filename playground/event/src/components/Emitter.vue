<script setup lang="ts">
import { useEventManager } from '@ygzhang-lab/vue-event'
import { ref } from 'vue'

const manager = useEventManager()
const text = ref('hello from Emitter')

function sendMessage(): void {
  manager.emit('demo:message', text.value)
}

function sendOnce(): void {
  manager.emit('demo:once')
}
</script>

<template>
  <section class="emitter">
    <h2>Emitter（发送方）</h2>
    <input v-model="text" placeholder="事件内容" />
    <div class="actions">
      <button type="button" @click="sendMessage">emit demo:message</button>
      <button type="button" @click="sendOnce">emit demo:once</button>
    </div>
  </section>
</template>

<style scoped>
.emitter h2 {
  font-size: 16px;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 6px 10px;
  font: inherit;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

button {
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
  background: #ecf5ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
}
</style>
