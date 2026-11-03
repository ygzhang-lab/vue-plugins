/**
 * 请求默认配置插件：把 baseURL / timeout / headers 等合并进实例 defaults。
 *
 * 使用 axios.mergeConfig 深合并 headers，不会覆盖默认的 Accept
 * 及各方法级默认头；顶层配置仍以 defaults 为准。
 */
import axios, { type AxiosRequestConfig } from 'axios';
import type { HttpPlugin } from '../types';

export function requestConfigPlugin(defaults: AxiosRequestConfig): HttpPlugin {
  return {
    name: 'request-config',
    setup(instance) {
      // AxiosDefaults 的 headers 类型比 AxiosRequestConfig 更宽，这里断言只为调用 mergeConfig
      const current = instance.defaults as unknown as AxiosRequestConfig;
      Object.assign(instance.defaults, axios.mergeConfig(current, defaults));
    },
  };
}
