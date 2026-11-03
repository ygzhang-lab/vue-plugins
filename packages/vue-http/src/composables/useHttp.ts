/**
 * useHttp —— 读取插件注入的 AxiosInstance。
 *
 * 只能在组件 setup 内、且 app.use(HttpPlugin) 之后调用；
 * 未安装插件时抛错而不是静默返回 undefined，便于尽早暴露配置问题。
 */
import type { AxiosInstance } from 'axios';
import { inject } from 'vue';

import { httpKey } from '../plugin';

export function useHttp(): AxiosInstance {
  const http = inject(httpKey, null);
  if (!http) {
    throw new Error('[vue-http] useHttp() 必须在 app.use(HttpPlugin) 之后调用');
  }
  return http;
}
