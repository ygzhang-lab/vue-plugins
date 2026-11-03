<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { openSecondTab, reloadPage } from '../api/auth'
import { storage } from '../api/client'
import { useIdentityStore } from '../stores/identity'

const identity = useIdentityStore()
const { snapshot, restoreResult, hydrated } = storeToRefs(identity)

function onOpenSecondTab(): void {
  openSecondTab()
}

function onReload(): void {
  reloadPage()
}
</script>

<template>
  <van-cell-group inset title="二次进入 & 跨 Tab 同步">
    <van-cell
      title="持久化"
      :value="storage.subscribe ? 'localStorage + storage 事件' : '仅内存'"
    />
    <van-cell title="当前快照">
      <template #value>
        <span class="mono">{{ snapshot.accessToken ? '有 token' : '无 token' }} / v{{ snapshot.version }}</span>
      </template>
    </van-cell>
    <van-cell title="水合状态" :value="hydrated ? '已水合' : '未水合'" />
    <van-cell title="恢复结果">
      <template #value>
        <van-tag v-if="restoreResult" :type="restoreResult.status === 'expired' ? 'warning' : 'success'">
          {{ restoreResult.status }}
        </van-tag>
        <span v-else class="muted">-</span>
      </template>
    </van-cell>
    <van-cell>
      <div class="actions">
        <van-button size="small" type="primary" @click="onReload">刷新页面（模拟二次进入）</van-button>
        <van-button size="small" @click="onOpenSecondTab">打开新标签页（测跨 tab 同步）</van-button>
      </div>
    </van-cell>
    <van-cell
      title="跨 tab 同步说明"
      label="登录后打开第二个标签页：在任一标签页登录 / 登出 / 刷新，另一个标签页会通过 storage 事件同步；页面日志里可见 external-sync。"
    />
  </van-cell-group>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.muted {
  color: #909399;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
