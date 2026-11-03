/**
 * 私有共享工具：只在本仓库内部被插件包以源码形式引用，
 * 打包时会被内联进各自产物的 bundle 中，不会作为独立包发布。
 */

/** 日志统一前缀，便于在控制台区分插件归属 */
export const LOG_PREFIX = '[ygzhang-lab]'

/** 是否处于浏览器环境（SSR 安全） */
export const isClient: boolean = typeof window !== 'undefined' && typeof document !== 'undefined'

/** 开发期告警：不会抛出异常，只输出到控制台 */
export function warn(message: string, ...rest: unknown[]): void {
  if (typeof console === 'undefined') return
  console.warn(`${LOG_PREFIX} ${message}`, ...rest)
}

/** 统一的文案拼装规则：`前缀: 内容` */
export function formatLabel(prefix: string, content: string): string {
  return `${prefix}: ${content}`
}
