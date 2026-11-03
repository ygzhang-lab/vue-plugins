/**
 * 自定义 header 插件：支持静态值与函数值（可异步）。
 *
 * 函数值每次请求重新求值，适合版本号、灰度标记等动态 header；
 * 返回 undefined 表示本次不设置。本插件不识别 skipAuth，
 * 若需按请求跳过，请在调用方或独立插件中处理。
 */
import type { HttpPlugin } from '../types';

export function headersPlugin(
  headers: Record<string, string | (() => string | undefined | Promise<string | undefined>)>
): HttpPlugin {
  return {
    name: 'headers',
    setup(instance) {
      instance.interceptors.request.use(async (config) => {
        for (const [k, v] of Object.entries(headers)) {
          const value = typeof v === 'function' ? await v() : v;
          if (value !== undefined) config.headers.set(k, value);
        }
        return config;
      });
    },
  };
}
