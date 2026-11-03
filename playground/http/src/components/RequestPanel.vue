<script setup lang="ts">
import { ref } from 'vue'

import { demoServer, formatError, http } from '../api/client'

interface RunResult {
  id: number
  label: string
  ok: boolean
  detail: string
}

const results = ref<RunResult[]>([])
const busy = ref('')
let seq = 0
let slowController: AbortController | null = null

function push(label: string, ok: boolean, detail: string): void {
  seq += 1
  results.value = [{ id: seq, label, ok, detail }, ...results.value].slice(0, 10)
}

async function run(label: string, task: () => Promise<unknown>): Promise<void> {
  busy.value = label
  try {
    const value = await task()
    push(label, true, typeof value === 'string' ? value : JSON.stringify(value))
  } catch (error) {
    push(label, false, formatError(error))
  } finally {
    busy.value = ''
  }
}

const requestMe = () =>
  run('GET /me（JWT 鉴权）', async () => (await http.get('/me')).data)

const requestOrders = () =>
  run('GET /orders（JWT 鉴权）', async () => {
    const { data } = await http.get<unknown[]>('/orders')
    return `共 ${data.length} 条订单`
  })

const requestPublic = () =>
  run('GET /public（skipAuth + skipApiKey）', async () =>
    (await http.get('/public', { skipAuth: true, skipApiKey: true })).data,
  )

const requestBusinessError = () =>
  run('GET /business-error（业务错误）', async () => (await http.get('/business-error')).data)

const requestNetworkError = () =>
  run('GET /network-error（网络错误）', async () => (await http.get('/network-error')).data)

const requestTimeout = () =>
  run('GET /timeout（超时）', async () => (await http.get('/timeout')).data)

const requestApiKey = () =>
  run('GET /apikey/secret（API Key 鉴权）', async () =>
    (await http.get('/apikey/secret', { skipAuth: true })).data,
  )

const requestApiKeyProfile = () =>
  run('GET /apikey/profile（仅 API Key）', async () =>
    (await http.get('/apikey/profile', { skipAuth: true })).data,
  )

const requestApiKeyOrders = () =>
  run('GET /apikey/orders（仅 API Key）', async () => {
    const { data } = await http.get<unknown[]>('/apikey/orders', { skipAuth: true })
    return `共 ${data.length} 条订单`
  })

const requestSlow = () => {
  slowController = new AbortController()
  return run('GET /slow（1.5s，可取消）', async () =>
    (await http.get('/slow', { signal: slowController?.signal })).data,
  )
}

function cancelSlow(): void {
  slowController?.abort()
  slowController = null
}

const resetServer = (): void => {
  demoServer.reset()
  push('重置 mock 服务端', true, '已清空服务端 token（本页 TokenStore 不变）')
}
</script>

<template>
  <van-cell-group inset title="业务请求">
    <van-cell>
      <div class="actions">
        <van-button size="small" :loading="busy === 'GET /me（JWT 鉴权）'" @click="requestMe">/me</van-button>
        <van-button size="small" :loading="busy === 'GET /orders（JWT 鉴权）'" @click="requestOrders">/orders</van-button>
        <van-button size="small" @click="requestPublic">/public</van-button>
        <van-button size="small" type="warning" @click="requestBusinessError">业务错误</van-button>
        <van-button size="small" type="danger" @click="requestNetworkError">网络错误</van-button>
        <van-button size="small" type="danger" plain @click="requestTimeout">超时</van-button>
        <van-button size="small" @click="requestSlow">慢请求</van-button>
        <van-button size="small" type="warning" plain @click="cancelSlow">取消慢请求</van-button>
        <van-button size="small" type="primary" plain @click="requestApiKey">API Key 校验</van-button>
        <van-button size="small" type="primary" plain @click="requestApiKeyProfile">Key 资料</van-button>
        <van-button size="small" type="primary" plain @click="requestApiKeyOrders">Key 订单</van-button>
        <van-button size="small" plain @click="resetServer">重置 mock 服务端</van-button>
      </div>
    </van-cell>

    <van-cell v-for="item in results" :key="item.id" :title="item.label" :label="item.detail">
      <template #value>
        <van-tag :type="item.ok ? 'success' : 'danger'">{{ item.ok ? 'OK' : 'ERROR' }}</van-tag>
      </template>
    </van-cell>
    <van-empty v-if="!results.length" description="点击上方按钮发起请求" image-size="60" />
  </van-cell-group>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
