/**
 * createHttp —— 最小工厂：axios.create + 依次执行插件 setup。
 *
 * 只负责组装，不内置认证/解包/错误策略。
 * 插件按数组顺序注册：请求拦截器 LIFO，响应拦截器 FIFO，
 * 因此数组末尾的插件在响应链上最后执行（用于兜底错误）。
 */
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { HttpMiddleware } from './types';

export interface CreateHttpOptions {
  defaults?: AxiosRequestConfig;
  plugins: HttpMiddleware[];
}

export function createHttp({ defaults, plugins }: CreateHttpOptions) {
  const instance = axios.create(defaults);
  for (const p of plugins) p.setup(instance);
  return instance;
}
