import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // vue 与 axios 由宿主应用提供，禁止打进产物
      external: ['vue', 'axios'],
      output: {
        exports: 'named',
        globals: { vue: 'Vue', axios: 'axios' },
      },
    },
  },
})
