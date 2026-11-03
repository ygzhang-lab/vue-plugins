import HttpPlugin from '@ygzhang-lab/vue-http'
import {
  Button,
  Cell,
  CellGroup,
  Divider,
  Empty,
  Field,
  NavBar,
  NoticeBar,
  Progress,
  Radio,
  RadioGroup,
  Tag,
} from 'vant'
import { createApp, type Component } from 'vue'

import App from './App.vue'
import { bootstrapSession } from './api/auth'
import { http } from './api/client'
import { log } from './state/log'
import { pinia } from './stores'

import 'vant/lib/index.css'

/**
 * 先建 app、装好 Pinia 与插件，再恢复会话，最后 mount：
 * 既保证首屏就是恢复后的状态，也让 bootstrap 里的请求能安全取用 identity store。
 */
async function start(): Promise<void> {
  const app = createApp(App)
  app.use(pinia)

  // Vant 4 组件按需全局注册（名称形如 van-button / van-cell）
  const vantComponents: Component[] = [
    Button,
    Cell,
    CellGroup,
    Divider,
    Empty,
    Field,
    NavBar,
    NoticeBar,
    Progress,
    Radio,
    RadioGroup,
    Tag,
  ]
  for (const component of vantComponents) {
    const options = component as { name?: string }
    if (options.name) app.component(options.name, component)
  }

  app.use(HttpPlugin, { instance: http })

  log('info', 'bootstrap', '应用启动：开始持久化水合与静默恢复')
  try {
    await bootstrapSession()
  } catch (error) {
    log('error', 'bootstrap', `启动流程异常：${error instanceof Error ? error.message : String(error)}`)
  }

  app.mount('#app')
  log('info', 'bootstrap', '应用已挂载')
}

void start()
