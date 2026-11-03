import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 直接指向包内源码，改插件即 HMR，不必先 pnpm build
    alias: [
      {
        find: /^@ygzhang-lab\/vue-event$/,
        replacement: resolve('../../packages/vue-event/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5175,
  },
  optimizeDeps: {
    exclude: ['@ygzhang-lab/vue-event'],
  },
})
