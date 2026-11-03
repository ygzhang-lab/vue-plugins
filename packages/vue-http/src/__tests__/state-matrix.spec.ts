import { describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { createHttp } from '../create-http';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import { jwtAuthPlugin } from '../plugins/jwt-auth';
import { responseUnwrapPlugin } from '../plugins/response-unwrap';
import { errorNormalizerPlugin } from '../plugins/error-normalizer';
import { httpError, okAdapter } from './helpers';
import type { AuthTokens } from '../types';

interface SetupOptions {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
  requireRefreshToken?: boolean;
  refreshImpl?: (rt: string | undefined, signal: AbortSignal) => Promise<AuthTokens>;
}

function setup(options: SetupOptions = {}) {
  const store = new TokenStore();
  if (options.accessToken !== undefined) {
    store.setTokens({
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      expiresIn: options.expiresIn,
      expiresAt: options.expiresAt,
    });
  }
  const refresh = vi.fn(
    options.refreshImpl ?? (async () => ({ accessToken: 'new', expiresIn: 3_600 }))
  );
  const refresher = new TokenRefresher({
    tokenStore: store,
    refresh,
    cooldownMs: 0,
    requireRefreshToken: options.requireRefreshToken,
  });
  const http = createHttp({
    plugins: [
      jwtAuthPlugin({ tokenStore: store, refresher }),
      responseUnwrapPlugin(),
      errorNormalizerPlugin(),
    ],
  });
  return { store, refresh, refresher, http };
}

function body(code = 0, data: unknown = 'ok') {
  return { code, message: 'ok', data };
}

describe('token 状态矩阵', () => {
  it('anonymous：不注入 Authorization，也不刷新', async () => {
    const { http, refresh } = setup();
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(body(), (config) => {
      seen = config;
    });

    const response = await http.get('/me');

    expect(seen?.headers.has('Authorization')).toBe(false);
    expect(response.data).toBe('ok');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('valid：直接注入，不刷新', async () => {
    const { http, refresh } = setup({ accessToken: 'valid', refreshToken: 'r', expiresIn: 3_600 });
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(body(), (config) => {
      seen = config;
    });

    await http.get('/me');

    expect(seen?.headers.get('Authorization')).toBe('Bearer valid');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('expiring：请求前主动刷新，再用新 token 发出', async () => {
    const { http, refresh } = setup({ accessToken: 'old', refreshToken: 'r', expiresIn: 30 });
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(body(), (config) => {
      seen = config;
    });

    await http.get('/me');

    expect(refresh).toHaveBeenCalledWith('r', expect.any(AbortSignal));
    expect(seen?.headers.get('Authorization')).toBe('Bearer new');
  });

  it('expired：不做主动刷新，先发过期 token，401 后刷新重放', async () => {
    const { http, refresh } = setup({
      accessToken: 'expired',
      refreshToken: 'r',
      expiresAt: Date.now() - 1_000,
    });

    let calls = 0;
    const authHeaders: Array<string | undefined> = [];
    http.defaults.adapter = async (config) => {
      calls += 1;
      authHeaders.push(config.headers.get('Authorization') as string | undefined);
      if (calls === 1) throw httpError(config, 401);
      return { data: body(), status: 200, statusText: 'OK', headers: {}, config };
    };

    const response = await http.get('/me');

    expect(authHeaders).toEqual(['Bearer expired', 'Bearer new']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(response.data).toBe('ok');
  });

  it('unknown：不主动刷新，直接发送现有 token', async () => {
    const { http, refresh } = setup({ accessToken: 'opaque' });
    let seen: InternalAxiosRequestConfig | undefined;
    http.defaults.adapter = okAdapter(body(), (config) => {
      seen = config;
    });

    await http.get('/me');

    expect(seen?.headers.get('Authorization')).toBe('Bearer opaque');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('unknown：401 后仍可通过刷新恢复', async () => {
    const { http, refresh } = setup({ accessToken: 'opaque', refreshToken: 'r' });

    let calls = 0;
    const authHeaders: Array<string | undefined> = [];
    http.defaults.adapter = async (config) => {
      calls += 1;
      authHeaders.push(config.headers.get('Authorization') as string | undefined);
      if (calls === 1) throw httpError(config, 401);
      return { data: body(), status: 200, statusText: 'OK', headers: {}, config };
    };

    await http.get('/me');

    expect(authHeaders).toEqual(['Bearer opaque', 'Bearer new']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('401 重放后只解包一次，业务数据里的 code 字段不会被二次解包', async () => {
    const { http } = setup({ accessToken: 'old', refreshToken: 'r', expiresIn: 3_600 });

    let calls = 0;
    http.defaults.adapter = async (config) => {
      calls += 1;
      if (calls === 1) throw httpError(config, 401);
      return {
        data: { code: 0, message: 'ok', data: { code: 'order-1', name: 'demo' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const response = await http.get('/order');

    expect(response.data).toEqual({ code: 'order-1', name: 'demo' });
  });

  it('anonymous + cookie 模式：401 后刷新（refreshToken 为 undefined）并重放', async () => {
    const refreshImpl = vi.fn(async (_rt: string | undefined) => ({
      accessToken: 'cookie-session',
      expiresIn: 3_600,
    }));
    const { http, refresh } = setup({ refreshImpl });

    let calls = 0;
    const authHeaders: Array<string | undefined> = [];
    http.defaults.adapter = async (config) => {
      calls += 1;
      authHeaders.push(config.headers.get('Authorization') as string | undefined);
      if (calls === 1) throw httpError(config, 401);
      return { data: body(), status: 200, statusText: 'OK', headers: {}, config };
    };

    await http.get('/me');

    expect(refresh).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
    expect(authHeaders).toEqual([undefined, 'Bearer cookie-session']);
  });

  it('expired + 刷新失败：不重放，保留 401 归一化结果', async () => {
    const { http, refresh } = setup({
      accessToken: 'expired',
      refreshToken: 'r',
      expiresAt: Date.now() - 1_000,
      refreshImpl: async () => {
        throw new Error('refresh failed');
      },
    });

    let calls = 0;
    http.defaults.adapter = async (config) => {
      calls += 1;
      throw httpError(config, 401);
    };

    await expect(http.get('/me')).rejects.toMatchObject({ kind: 'http', status: 401 });
    expect(calls).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('cookie 模式 + requireRefreshToken：401 直接失败且不重放', async () => {
    const { http, refresh } = setup({ requireRefreshToken: true });

    let calls = 0;
    http.defaults.adapter = async (config) => {
      calls += 1;
      throw httpError(config, 401, { message: '请先登录' });
    };

    await expect(http.get('/me')).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      message: '请先登录',
    });
    expect(calls).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
