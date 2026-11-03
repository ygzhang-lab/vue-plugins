import { describe, expect, it } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { createHttp } from '../create-http';
import { requestConfigPlugin } from '../plugins/request-config';
import { okAdapter } from './helpers';

describe('requestConfigPlugin', () => {
  it('合并 baseURL / timeout / 自定义 header，同时保留 axios 默认 Accept', async () => {
    const http = createHttp({
      plugins: [
        requestConfigPlugin({
          baseURL: '/api',
          timeout: 5_000,
          withCredentials: true,
          headers: { 'X-App': 'demo' },
        }),
      ],
    });

    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(undefined, (config) => {
      seen = config;
    });

    await http.get('/ping');

    expect(seen?.baseURL).toBe('/api');
    expect(seen?.timeout).toBe(5_000);
    expect(seen?.withCredentials).toBe(true);
    expect(seen?.headers.get('X-App')).toBe('demo');
    expect(seen?.headers.get('Accept')).toBeTruthy();
  });

  it('请求级配置优先于默认配置', async () => {
    const http = createHttp({
      plugins: [requestConfigPlugin({ baseURL: '/api', timeout: 5_000 })],
    });

    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(undefined, (config) => {
      seen = config;
    });

    await http.get('/ping', { timeout: 100, headers: { 'X-App': 'one-off' } });

    expect(seen?.timeout).toBe(100);
    expect(seen?.headers.get('X-App')).toBe('one-off');
  });
});
