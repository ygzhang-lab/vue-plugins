import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2020',
    sourcemap: true,
    // 库产物不做压缩，宿主应用打包时统一处理
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'style',
    },
    rollupOptions: {
      // vue 由宿主应用提供，禁止打进产物
      external: ['vue'],
      output: {
        // 同时存在 default 与具名导出时，CJS 消费者通过 .default 取默认导出
        exports: 'named',
        globals: { vue: 'Vue' },
      },
    },
  },
})
