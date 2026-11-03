<script setup lang="ts">
import AuthPanel from './components/AuthPanel.vue'
import LogPanel from './components/LogPanel.vue'
import RequestPanel from './components/RequestPanel.vue'
import SelfTestPanel from './components/SelfTestPanel.vue'
import StatusPanel from './components/StatusPanel.vue'
import SyncPanel from './components/SyncPanel.vue'
</script>

<template>
  <van-nav-bar title="@ygzhang-lab/vue-http 测试应用" fixed placeholder />

  <main class="page">
    <StatusPanel />
    <AuthPanel />
    <RequestPanel />
    <SyncPanel />
    <SelfTestPanel />
    <LogPanel />
  </main>
</template>

<style scoped>
.page {
  max-width: 820px;
  padding: 12px 0 48px;
  margin: 0 auto;
  background: #f7f8fa;
}

:deep(.van-cell-group--inset) {
  margin-bottom: 14px;
}
</style>
