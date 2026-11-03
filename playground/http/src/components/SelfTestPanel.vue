<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatError } from '../api/client'
import { runAllCases, totalCases, type CaseResult } from '../selftest/cases'
import { log } from '../state/log'

const results = ref<CaseResult[]>([])
const running = ref(false)

const passed = computed(() => results.value.filter((item) => item.ok).length)
const failed = computed(() => results.value.length - passed.value)
const progress = computed(() =>
  results.value.length ? Math.round((results.value.length / totalCases()) * 100) : 0,
)

const grouped = computed(() => {
  const map = new Map<string, CaseResult[]>()
  for (const item of results.value) {
    const list = map.get(item.group) ?? []
    list.push(item)
    map.set(item.group, list)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
})

async function onRun(): Promise<void> {
  results.value = []
  running.value = true
  log('info', 'selftest', `开始运行 ${totalCases()} 个插件用例`)
  try {
    await runAllCases((result) => {
      results.value = [...results.value, result]
      log(
        result.ok ? 'success' : 'error',
        'selftest',
        `${result.group} · ${result.name} → ${result.ok ? 'PASS' : 'FAIL'}（${result.detail}）`,
      )
    })
    log(
      failed.value ? 'error' : 'success',
      'selftest',
      `用例结束：通过 ${passed.value} / 失败 ${failed.value}`,
    )
  } catch (error) {
    log('error', 'selftest', `用例执行异常：${formatError(error)}`)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <van-cell-group inset title="插件用例（在浏览器里跑真实断言）">
    <van-cell>
      <div class="head">
        <van-button type="primary" size="small" :loading="running" @click="onRun">
          运行全部用例（{{ totalCases() }}）
        </van-button>
        <van-tag v-if="results.length" type="success">通过 {{ passed }}</van-tag>
        <van-tag v-if="failed" type="danger">失败 {{ failed }}</van-tag>
      </div>
      <van-progress
        v-if="results.length"
        :percentage="progress"
        :color="failed ? '#ee0a24' : '#07c160'"
        class="progress"
      />
    </van-cell>

    <template v-for="group in grouped" :key="group.group">
      <van-cell :title="group.group" title-class="group-title" />
      <van-cell
        v-for="item in group.items"
        :key="item.name"
        :title="item.name"
        :label="item.detail"
      >
        <template #value>
          <van-tag :type="item.ok ? 'success' : 'danger'">{{ item.ok ? 'PASS' : 'FAIL' }}</van-tag>
        </template>
      </van-cell>
    </template>

    <van-empty v-if="!results.length" description="点击按钮运行全部插件用例" image-size="60" />
  </van-cell-group>
</template>

<style scoped>
.head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.progress {
  margin-top: 10px;
}

:deep(.group-title) {
  font-weight: 600;
  color: #409eff;
}
</style>
