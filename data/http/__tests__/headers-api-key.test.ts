import { describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { createHttp } from '../create-http';
import { headersPlugin } from '../plugins/headers';
import { apiKeyAuthPlugin } from '../plugins/api-key-auth';
import { okAdapter } from './helpers';

function capture(instance: ReturnType<typeof createHttp>) {
  let seen: InternalAxiosRequestConfig | undefined;
  instance.defaults.adapter = okAdapter(undefined, (config) => {
    seen = config;
  });
  return () => seen;
}

describe('headersPlugin', () => {
  it('注入静态、函数与异步 header，undefined 表示跳过', async () => {
    const dynamic = vi.fn(() => 'dynamic');
    const http = createHttp({
      plugins: [
        headersPlugin({
          'X-Static': 'static',
          'X-Dynamic': dynamic,
          'X-Async': async () => 'async',
          'X-Skip': () => undefined,
        }),
      ],
    });
    const getConfig = capture(http);

    await http.get('/one');

    const headers = getConfig()?.headers;
    expect(headers?.get('X-Static')).toBe('static');
    expect(headers?.get('X-Dynamic')).toBe('dynamic');
    expect(headers?.get('X-Async')).toBe('async');
    expect(headers?.get('X-Skip')).toBeUndefined();
  });

  it('函数值每次请求重新求值', async () => {
    const dynamic = vi.fn(() => 'value');
    const http = createHttp({ plugins: [headersPlugin({ 'X-Dynamic': dynamic })] });
    capture(http);

    await http.get('/one');
    await http.get('/two');

    expect(dynamic).toHaveBeenCalledTimes(2);
  });
});

describe('apiKeyAuthPlugin', () => {
  it('默认写入 X-API-Key', async () => {
    const http = createHttp({
      plugins: [apiKeyAuthPlugin({ getApiKey: async () => 'key-1' })],
    });
    const getConfig = capture(http);

    await http.get('/machine');

    expect(getConfig()?.headers.get('X-API-Key')).toBe('key-1');
  });

  it('支持自定义 header 名，空 key 不注入', async () => {
    let key: string | undefined;
    const http = createHttp({
      plugins: [
        apiKeyAuthPlugin({
          getApiKey: () => key,
          headerName: 'X-Token',
        }),
      ],
    });
    const getConfig = capture(http);

    await http.get('/one');
    expect(getConfig()?.headers.get('X-Token')).toBeUndefined();

    key = 'key-2';
    await http.get('/two');
    expect(getConfig()?.headers.get('X-Token')).toBe('key-2');
  });

  it('skipApiKey 可跳过注入', async () => {
    const getApiKey = vi.fn(() => 'key');
    const http = createHttp({ plugins: [apiKeyAuthPlugin({ getApiKey })] });
    const getConfig = capture(http);

    await http.get('/machine', { skipApiKey: true });

    expect(getConfig()?.headers.get('X-API-Key')).toBeUndefined();
    expect(getApiKey).not.toHaveBeenCalled();
  });
});
