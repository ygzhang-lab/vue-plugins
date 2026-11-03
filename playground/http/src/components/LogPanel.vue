<script setup lang="ts">
import { computed, ref } from 'vue'

import { clearLogs, logs, type LogLevel } from '../state/log'

const levelType = (level: LogLevel) =>
  level === 'success'
    ? 'success'
    : level === 'error'
      ? 'danger'
      : level === 'warn'
        ? 'warning'
        : 'primary'

const order = ref<'desc' | 'asc'>('desc')
const visible = computed(() =>
  order.value === 'desc' ? [...logs.value].reverse() : logs.value,
)

function toggleOrder(): void {
  order.value = order.value === 'desc' ? 'asc' : 'desc'
}
</script>

<template>
  <van-cell-group inset title="运行日志（console 同步输出）">
    <van-cell>
      <div class="head">
        <span class="count">共 {{ logs.length }} 条</span>
        <div class="actions">
          <van-button size="mini" plain @click="toggleOrder">
            {{ order === 'desc' ? '最新在上' : '最早在上' }}
          </van-button>
          <van-button size="mini" plain @click="clearLogs">清空</van-button>
        </div>
      </div>
    </van-cell>
    <van-cell v-for="item in visible" :key="item.id">
      <div class="log">
        <van-tag :type="levelType(item.level)" size="medium" class="level">{{ item.level }}</van-tag>
        <span class="time">{{ item.time }}</span>
        <span class="scope">{{ item.scope }}</span>
        <span class="message">{{ item.message }}</span>
      </div>
    </van-cell>
    <van-empty v-if="!logs.length" description="暂无日志" image-size="60" />
  </van-cell-group>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions {
  display: flex;
  gap: 8px;
}

.count {
  font-size: 13px;
  color: #909399;
}

.log {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 12px;
  word-break: break-all;
}

.time {
  color: #909399;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.scope {
  color: #409eff;
  font-weight: 600;
}

.message {
  color: #303133;
}

.level {
  flex: none;
}
</style>
