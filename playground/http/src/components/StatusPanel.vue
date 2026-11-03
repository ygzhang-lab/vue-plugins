<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { showToast } from 'vant'

import { expireSoon, kickAccessToken, loadMe, manualRefresh } from '../api/auth'
import { formatError, mask } from '../api/client'
import { useNow } from '../composables/useNow'
import { stages } from '../state/log'
import { useIdentityStore } from '../stores/identity'

const identity = useIdentityStore()
const {
  user,
  snapshot,
  tokenStatus,
  restoreResult,
  apiKey,
  apiKeyEnabled,
  authMode,
  hydrated,
} = storeToRefs(identity)

const now = useNow()

const statusType = computed(() => {
  switch (tokenStatus.value) {
    case 'valid':
      return 'success'
    case 'expiring':
      return 'warning'
    case 'expired':
      return 'danger'
    default:
      return 'primary'
  }
})

const remainingSeconds = computed(() => {
  const expiresAt = snapshot.value.expiresAt
  if (!expiresAt) return null
  return Math.max(0, Math.round((expiresAt - now.value) / 1_000))
})

const stageList = computed(() =>
  Object.entries(stages).map(([key, value]) => ({ key, ...value })),
)

const stageType = (state: string) =>
  state === 'ok' ? 'success' : state === 'fail' ? 'danger' : state === 'running' ? 'warning' : 'primary'

async function onExpireSoon(): Promise<void> {
  expireSoon()
  showToast('已设为 30 秒后过期，下一次请求会主动刷新')
}

function onKick(): void {
  kickAccessToken()
  showToast('服务端已注销当前 token，下一次请求会 401 → 刷新 → 重放')
}

async function onRefresh(): Promise<void> {
  try {
    await manualRefresh()
    showToast('刷新成功')
  } catch (error) {
    showToast(formatError(error))
  }
}
</script>

<template>
  <van-notice-bar
    left-icon="info-o"
    text="身份信息集中在 Pinia identity store；token 生命周期仍由 vue-http TokenStore 负责，事件会同步进 store。"
  />

  <van-cell-group inset title="会话状态">
    <van-cell title="认证方式">
      <template #value>
        <van-tag :type="authMode === '未登录' ? 'primary' : 'success'" :plain="authMode === '未登录'">
          {{ authMode }}
        </van-tag>
      </template>
    </van-cell>
    <van-cell title="登录用户">
      <template #value>
        <van-tag v-if="user" type="success">{{ user.name }}（{{ user.role }}）</van-tag>
        <span v-else class="muted">未登录</span>
      </template>
    </van-cell>
    <van-cell title="Token 状态">
      <template #value>
        <van-tag :type="statusType">{{ tokenStatus }}</van-tag>
      </template>
    </van-cell>
    <van-cell title="access_token" :value="mask(snapshot.accessToken)" />
    <van-cell title="refresh_token" :value="mask(snapshot.refreshToken)" />
    <van-cell title="API Key" :value="apiKeyEnabled ? mask(apiKey) : '未启用'" />
    <van-cell title="version" :value="String(snapshot.version)" />
    <van-cell
      title="剩余有效期"
      :value="remainingSeconds === null ? '未知' : `${remainingSeconds}s`"
    />
    <van-cell title="二次进入恢复">
      <template #value>
        <van-tag v-if="restoreResult" :type="restoreResult.status === 'expired' ? 'warning' : 'success'">
          {{ restoreResult.status }} / {{ restoreResult.tokenStatus }}
        </van-tag>
        <span v-else class="muted">尚未执行</span>
      </template>
    </van-cell>
    <van-cell title="持久化水合" :value="hydrated ? '已水合' : '未水合'" />
  </van-cell-group>

  <van-cell-group inset title="Token 生命周期">
    <van-cell>
      <div class="actions">
        <van-button size="small" type="primary" plain @click="loadMe()">刷新用户信息</van-button>
        <van-button size="small" type="warning" plain @click="onExpireSoon">设为临期</van-button>
        <van-button size="small" type="danger" plain @click="onKick">服务端注销 token</van-button>
        <van-button size="small" plain @click="onRefresh">手动刷新</van-button>
      </div>
    </van-cell>
  </van-cell-group>

  <van-cell-group inset title="启动阶段">
    <van-cell v-for="item in stageList" :key="item.key" :title="item.label" :label="item.detail">
      <template #value>
        <van-tag :type="stageType(item.status)">{{ item.status }}</van-tag>
      </template>
    </van-cell>
  </van-cell-group>
</template>

<style scoped>
.muted {
  color: #909399;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
