<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { showToast } from 'vant'

import { loginApiKey, loginJwt, logout } from '../api/auth'
import { formatError } from '../api/client'
import { useIdentityStore } from '../stores/identity'

type LoginMode = 'jwt' | 'apikey'

const identity = useIdentityStore()
const { apiKey, apiKeyEnabled } = storeToRefs(identity)

const mode = ref<LoginMode>('jwt')
const username = ref('admin')
const password = ref('123456')
const apiKeyInput = ref(apiKey.value || 'demo-api-key')
const loading = ref(false)

const loggedIn = computed(() => identity.isLoggedIn)

async function onLogin(): Promise<void> {
  loading.value = true
  try {
    if (mode.value === 'jwt') {
      const user = await loginJwt(username.value, password.value)
      showToast(`登录成功：${user.name}`)
    } else {
      await loginApiKey(apiKeyInput.value)
      showToast('API Key 校验通过')
    }
  } catch (error) {
    showToast(formatError(error))
  } finally {
    loading.value = false
  }
}

async function onLogout(): Promise<void> {
  loading.value = true
  try {
    await logout()
    showToast('已登出')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <van-cell-group inset title="用户登入 / 登出">
    <van-cell>
      <van-radio-group v-model="mode" direction="horizontal">
        <van-radio name="jwt">JWT 模式</van-radio>
        <van-radio name="apikey">API Key 模式</van-radio>
      </van-radio-group>
    </van-cell>

    <template v-if="mode === 'jwt'">
      <van-field v-model="username" label="用户名" placeholder="admin / guest" />
      <van-field v-model="password" label="密码" type="password" placeholder="123456 / guest" />
    </template>

    <van-field
      v-else
      v-model="apiKeyInput"
      label="API Key"
      placeholder="demo-api-key"
    />

    <van-cell>
      <div class="actions">
        <van-button type="primary" size="small" :loading="loading" @click="onLogin">登录</van-button>
        <van-button size="small" :disabled="!loggedIn || loading" @click="onLogout">登出</van-button>
        <van-tag :type="apiKeyEnabled ? 'success' : 'primary'" :plain="!apiKeyEnabled">
          API Key {{ apiKeyEnabled ? '已启用' : '未启用' }}
        </van-tag>
      </div>
    </van-cell>
    <van-cell
      title="提示"
      label="JWT：登录后写入 TokenStore 并持久化；API Key：校验通过后写入 localStorage，刷新页面自动恢复并重新校验"
    />
  </van-cell-group>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
