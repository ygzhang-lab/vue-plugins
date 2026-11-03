import { describe, expect, it } from 'vitest';
import { CanceledError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { createAppHttp } from '../index';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import { okAdapter, throwAdapter } from './helpers';

function createClient() {
  const tokenStore = new TokenStore();
  tokenStore.setTokens({ accessToken: 'real', expiresIn: 3_600 });
  const refresher = new TokenRefresher({
    tokenStore,
    refresh: async () => ({ accessToken: 'refreshed', expiresIn: 3_600 }),
    cooldownMs: 0,
  });
  const http = createAppHttp({
    baseURL: '/api',
    timeout: 1_234,
    staticHeaders: {
      Authorization: 'Bearer static',
      'X-Client': 'web',
    },
    jwt: { tokenStore, refresher },
  });
  return { http, tokenStore };
}

describe('createAppHttp', () => {
  it('组装默认配置、header、JWT 与响应解包', async () => {
    const { http } = createClient();
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter({ code: 0, message: 'ok', data: { id: 1 } }, (config) => {
      seen = config;
    });

    const response = await http.get('/me');

    expect(seen?.baseURL).toBe('/api');
    expect(seen?.timeout).toBe(1_234);
    expect(seen?.headers.get('X-Client')).toBe('web');
    // JWT 在请求链最后写入，覆盖 staticHeaders 中的同名头
    expect(seen?.headers.get('Authorization')).toBe('Bearer real');
    expect(response.data).toEqual({ id: 1 });
  });

  it('skipAuth 时不覆盖 static Authorization', async () => {
    const { http } = createClient();
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(undefined, (config) => {
      seen = config;
    });

    await http.get('/public', { skipAuth: true });

    expect(seen?.headers.get('Authorization')).toBe('Bearer static');
  });

  it('业务错误在完整插件链下归一化为 business', async () => {
    const { http } = createClient();
    http.defaults.adapter = okAdapter({ code: 4001, message: '余额不足', data: null });

    await expect(http.get('/pay')).rejects.toMatchObject({
      kind: 'business',
      code: 4001,
      message: '余额不足',
    });
  });

  it('取消请求归一化为 canceled', async () => {
    const { http } = createClient();
    http.defaults.adapter = throwAdapter(() => new CanceledError('canceled'));

    await expect(http.get('/slow')).rejects.toMatchObject({ kind: 'canceled' });
  });

  it('未配置 jwt / apiKey 时不注入认证头', async () => {
    const http = createAppHttp({ baseURL: '/api' });
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(undefined, (config) => {
      seen = config;
    });

    await http.get('/public');

    expect(seen?.headers.has('Authorization')).toBe(false);
    expect(seen?.headers.has('X-API-Key')).toBe(false);
    expect(seen?.timeout).toBe(15_000);
  });
});
