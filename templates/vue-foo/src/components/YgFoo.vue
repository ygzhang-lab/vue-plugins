<script setup lang="ts">
import { computed } from 'vue'

import { useFoo } from '../composables/useFoo'

defineOptions({ name: 'YgFoo' })

const props = withDefaults(
  defineProps<{
    /** 被问候的对象 */
    name?: string
  }>(),
  { name: 'Vue' },
)

const emit = defineEmits<{
  (e: 'greet', message: string): void
}>()

const { prefix, greet } = useFoo()
const message = computed(() => greet(props.name))

function onClick(): void {
  emit('greet', message.value)
}
</script>

<template>
  <button type="button" class="yg-foo" @click="onClick">
    <span class="yg-foo__prefix">{{ prefix }}</span>
    <span class="yg-foo__message">{{ message }}</span>
  </button>
</template>

<style scoped>
.yg-foo {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 12px;
  font: inherit;
  color: #1f2d3d;
  cursor: pointer;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}

.yg-foo:hover {
  border-color: #409eff;
}

.yg-foo__prefix {
  font-weight: 600;
  color: #409eff;
}

.yg-foo__message {
  font-size: 14px;
}
</style>
