import { describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { createHttp } from '../create-http';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import { jwtAuthPlugin } from '../plugins/jwt-auth';
import { errorNormalizerPlugin } from '../plugins/error-normalizer';
import { httpError, okAdapter } from './helpers';
import type { AuthTokens } from '../types';

function createRefresher(
  store: TokenStore,
  impl: () => Promise<AuthTokens> = async () => ({ accessToken: 'new', expiresIn: 3_600 }),
  extra: { requireRefreshToken?: boolean } = {}
) {
  const refresh = vi.fn(impl);
  const refresher = new TokenRefresher({
    tokenStore: store,
    refresh,
    cooldownMs: 0,
    ...extra,
  });
  return { refresh, refresher };
}

function captureConfig(instance: ReturnType<typeof createHttp>) {
  let seen: InternalAxiosRequestConfig | undefined;
  instance.defaults.adapter = okAdapter(undefined, (config) => {
    seen = config;
  });
  return () => seen;
}

describe('jwtAuthPlugin', () => {
  it('注入 Authorization（使用 tokenType）', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'tok', tokenType: 'JWT', expiresIn: 3_600 });
    const { refresher } = createRefresher(store);
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });
    const getConfig = captureConfig(http);

    await http.get('/me');

    expect(getConfig()?.headers.get('Authorization')).toBe('JWT tok');
  });

  it('skipAuth 请求不注入 token', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'tok', expiresIn: 3_600 });
    const { refresher } = createRefresher(store);
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });
    const getConfig = captureConfig(http);

    await http.get('/public', { skipAuth: true });

    expect(getConfig()?.headers.has('Authorization')).toBe(false);
  });

  it('临近过期时先主动刷新，再写入新 token', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 30 });
    const { refresh, refresher } = createRefresher(store);
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });
    const getConfig = captureConfig(http);

    await http.get('/me');

    expect(refresh).toHaveBeenCalledWith('r', expect.any(AbortSignal));
    expect(getConfig()?.headers.get('Authorization')).toBe('Bearer new');
    expect(store.getAccessToken()).toBe('new');
  });

  it('主动刷新失败时仍用旧 token 发出请求', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 30 });
    const { refresher } = createRefresher(store, async () => {
      throw new Error('refresh failed');
    });
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });
    const getConfig = captureConfig(http);

    await expect(http.get('/me')).resolves.toBeDefined();
    expect(getConfig()?.headers.get('Authorization')).toBe('Bearer old');
  });

  it('主动刷新失败且 token 已被清除时不再发送旧 token', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 30 });
    const refresh = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 0,
      onRefreshFailed: () => store.clear('refresh-failed'),
    });
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });
    const getConfig = captureConfig(http);

    await http.get('/me');

    expect(getConfig()?.headers.has('Authorization')).toBe(false);
  });

  it('401 后刷新并重放请求', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 3_600 });
    const { refresher } = createRefresher(store);
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });

    let calls = 0;
    const authHeaders: string[] = [];
    http.defaults.adapter = async (config) => {
      calls += 1;
      authHeaders.push(config.headers.get('Authorization') as string);
      if (calls === 1) throw httpError(config, 401);
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const response = await http.get('/me');

    expect(response.data).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(authHeaders).toEqual(['Bearer old', 'Bearer new']);
  });

  it('401 时若版本已变化，直接用新 token 重放而不刷新', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 3_600 });
    const { refresh, refresher } = createRefresher(store);
    const http = createHttp({ plugins: [jwtAuthPlugin({ tokenStore: store, refresher })] });

    let calls = 0;
    const authHeaders: string[] = [];
    http.defaults.adapter = async (config) => {
      calls += 1;
      authHeaders.push(config.headers.get('Authorization') as string);
      if (calls === 1) {
        // 模拟其他请求已完成刷新
        store.setTokens({ accessToken: 'other', expiresIn: 3_600 });
        throw httpError(config, 401);
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    await http.get('/me');

    expect(refresh).not.toHaveBeenCalled();
    expect(authHeaders).toEqual(['Bearer old', 'Bearer other']);
  });

  it('刷新失败时保留原始 401 语义', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', expiresIn: 3_600 }); // 无 refreshToken
    const { refresh, refresher } = createRefresher(store, async () => ({ accessToken: 'new' }), {
      requireRefreshToken: true,
    });
    const http = createHttp({
      plugins: [jwtAuthPlugin({ tokenStore: store, refresher }), errorNormalizerPlugin()],
    });
    http.defaults.adapter = async (config) => {
      throw httpError(config, 401, { message: '登录已失效' });
    };

    await expect(http.get('/me')).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      message: '登录已失效',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('_retry 保证 401 最多重放一次', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 3_600 });
    const { refresh, refresher } = createRefresher(store);
    const http = createHttp({
      plugins: [jwtAuthPlugin({ tokenStore: store, refresher }), errorNormalizerPlugin()],
    });

    let calls = 0;
    http.defaults.adapter = async (config) => {
      calls += 1;
      throw httpError(config, 401);
    };

    await expect(http.get('/me')).rejects.toMatchObject({ kind: 'http', status: 401 });
    expect(calls).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('skipAuth 的 401 不触发刷新', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'old', refreshToken: 'r', expiresIn: 3_600 });
    const { refresh, refresher } = createRefresher(store);
    const http = createHttp({
      plugins: [jwtAuthPlugin({ tokenStore: store, refresher }), errorNormalizerPlugin()],
    });
    http.defaults.adapter = async (config) => {
      throw httpError(config, 401);
    };

    await expect(http.get('/login', { skipAuth: true })).rejects.toMatchObject({
      kind: 'http',
      status: 401,
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
