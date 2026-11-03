import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/** 返回固定响应体的 adapter，可在 onConfig 中断言最终请求配置 */
export function okAdapter(
  body: unknown = { code: 0, data: 'ok' },
  onConfig?: (config: InternalAxiosRequestConfig) => void
): AxiosAdapter {
  return async (config) => {
    onConfig?.(config);
    const response: AxiosResponse = {
      data: body,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
    return response;
  };
}

/** 直接抛错的 adapter，用于覆盖网络 / 超时 / 取消 / HTTP 错误分支 */
export function throwAdapter(
  makeError: (config: InternalAxiosRequestConfig) => unknown
): AxiosAdapter {
  return async (config) => {
    throw makeError(config);
  };
}

/** 构造一个带 response 的 AxiosError */
export function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  data?: unknown
): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', config, undefined, {
    status,
    statusText: `HTTP ${status}`,
    data,
    headers: {},
    config,
  });
}

/** 内存版 Storage，避免测试依赖 jsdom / localStorage */
export function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
