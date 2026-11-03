import EventPlugin from '@ygzhang-lab/vue-event'
import { createApp } from 'vue'

import App from './App.vue'
import { manager } from './bus'

createApp(App).use(EventPlugin, { manager }).mount('#app')
