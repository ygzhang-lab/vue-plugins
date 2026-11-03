/**
 * API Key 认证插件：从 getApiKey 取值写入指定 header（默认 X-API-Key）。
 *
 * 请求级 config.skipApiKey = true 可跳过注入；
 * 与 JWT 插件共存时写不同 header，互不覆盖。
 */
import type { HttpPlugin } from '../types';

export interface ApiKeyAuthOptions {
  getApiKey: () => string | undefined | Promise<string | undefined>;
  headerName?: string;
}

export function apiKeyAuthPlugin(options: ApiKeyAuthOptions): HttpPlugin {
  const { getApiKey, headerName = 'X-API-Key' } = options;
  return {
    name: 'api-key-auth',
    setup(instance) {
      instance.interceptors.request.use(async (config) => {
        if (config.skipApiKey) return config;
        const key = await getApiKey();
        if (key) config.headers.set(headerName, key);
        return config;
      });
    },
  };
}
