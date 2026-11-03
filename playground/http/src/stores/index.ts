import { createPinia } from 'pinia'

/**
 * 全局 Pinia 实例。
 * 导出实例是为了让非组件模块（api/、main.ts）也能安全地取用 store：
 * `useIdentityStore(pinia)` 不依赖当前是否有 active pinia。
 */
export const pinia = createPinia()
