import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 直接运行包内源码，无需先 build
    alias: {
      '@ygzhang-lab/internal': resolve('./packages/internal/src/index.ts'),
      '@ygzhang-lab/vue-http': resolve('./packages/vue-http/src/index.ts'),
      '@ygzhang-lab/vue-event': resolve('./packages/vue-event/src/index.ts'),
      '@ygzhang-lab/vue-bar': resolve('./templates/vue-bar/src/index.ts'),
      '@ygzhang-lab/vue-foo': resolve('./templates/vue-foo/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['{packages,templates}/*/src/**/*.spec.ts'],
    reporters: 'default',
  },
})
