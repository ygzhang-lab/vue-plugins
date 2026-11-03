import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import { restoreSession } from '../session-bootstrap';
import { webStorageAdapter } from '../storage/web-storage';
import { syncTokenStoreWithStorage } from '../storage/synced';
import { createHttp } from '../create-http';
import { responseUnwrapPlugin } from '../plugins/response-unwrap';
import { errorNormalizerPlugin } from '../plugins/error-normalizer';
import { createFakeStorage, okAdapter, throwAdapter, httpError } from './helpers';
import type { AuthTokens, TokenSnapshot, TokenStorage } from '../types';

const snapshot: TokenSnapshot = {
  accessToken: 'access',
  tokenType: 'Bearer',
  version: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('TokenStore 状态边界', () => {
  it('getStatus / isExpiringSoon 的阈值可按调用覆盖', () => {
    const store = new TokenStore({ expiringThresholdMs: 60_000 });
    store.setTokens({ accessToken: 'a', expiresIn: 120 });

    expect(store.getStatus(300_000)).toBe('expiring');
    expect(store.getStatus(1_000)).toBe('valid');
    expect(store.isExpiringSoon(300_000)).toBe(true);
    expect(store.isExpiringSoon(1_000)).toBe(false);
  });

  it('isAccessTokenValid 对 anonymous / unknown / expired 返回正确结果', () => {
    const anonymous = new TokenStore();
    expect(anonymous.isAccessTokenValid()).toBe(false);

    const unknown = new TokenStore();
    unknown.setTokens({ accessToken: 'a' });
    expect(unknown.isAccessTokenValid()).toBe(true);

    const expired = new TokenStore();
    expired.setTokens({ accessToken: 'a', expiresAt: Date.now() - 1 });
    expect(expired.isAccessTokenValid()).toBe(false);
  });

  it('hydrate 恢复旧数据时版本仍单调递增', async () => {
    const storage: TokenStorage = {
      read: () => ({ accessToken: 'stored', tokenType: 'Bearer', version: 1 }),
      write: () => {},
    };
    const store = new TokenStore({ storage });
    store.setTokens({ accessToken: 'local' });
    const before = store.getVersion();

    expect(await store.hydrate()).toBe(true);
    expect(store.getAccessToken()).toBe('stored');
    expect(store.getVersion()).toBeGreaterThan(before);
  });
});

describe('TokenStore 过期监控状态迁移', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('换新 token 后会重置过期标记，可再次触发 expire', () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', expiresIn: 1 });
    const expire = vi.fn();
    store.on('expire', expire);

    const stop = store.watchExpiration({ intervalMs: 100 });
    vi.advanceTimersByTime(1_100);
    expect(expire).toHaveBeenCalledTimes(1);

    store.setTokens({ accessToken: 'b', expiresIn: 1 });
    vi.advanceTimersByTime(1_100);
    expect(expire).toHaveBeenCalledTimes(2);

    stop();
  });

  it('clear 后保留过期监控，重新登录仍会触发 expire', () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', expiresIn: 1 });
    const expire = vi.fn();
    store.on('expire', expire);

    store.watchExpiration({ intervalMs: 100 });
    store.clear('logout');
    vi.advanceTimersByTime(2_000);
    expect(expire).not.toHaveBeenCalled(); // 无 token 时不触发

    store.setTokens({ accessToken: 'b', expiresIn: 1 });
    vi.advanceTimersByTime(1_100);
    expect(expire).toHaveBeenCalledTimes(1);

    store.stopExpirationWatch();
  });
});

describe('TokenRefresher 并发与冷却边界', () => {
  it('并发刷新失败时两个调用共享同一次失败，回调只触发一次', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r' });
    let rejectRefresh!: (error: Error) => void;
    const refresh = vi.fn(
      () =>
        new Promise<AuthTokens>((_resolve, reject) => {
          rejectRefresh = reject;
        })
    );
    const onFailed = vi.fn();
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 0,
      onRefreshFailed: onFailed,
    });

    const first = refresher.refresh('bootstrap');
    const second = refresher.refresh('proactive');
    rejectRefresh(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('冷却时间到期后允许再次刷新', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ accessToken: 'new', expiresIn: 3_600 });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 1_000,
    });

    await expect(refresher.refresh('proactive')).rejects.toThrow('boom');
    expect(refresher.isCoolingDown()).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(refresher.isCoolingDown()).toBe(false);

    await expect(refresher.refresh('proactive')).resolves.toMatchObject({ accessToken: 'new' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('restoreSession 状态补充', () => {
  it('expired 且刷新成功 → refreshed', async () => {
    const store = new TokenStore();
    store.setTokens({
      accessToken: 'expired',
      refreshToken: 'r',
      expiresAt: Date.now() - 1_000,
    });
    const refresh = vi.fn(async () => ({ accessToken: 'new', expiresIn: 3_600 }));
    const refresher = new TokenRefresher({ tokenStore: store, refresh, cooldownMs: 0 });

    await expect(restoreSession({ tokenStore: store, refresher })).resolves.toEqual({
      status: 'refreshed',
      tokenStatus: 'valid',
    });
    expect(store.getAccessToken()).toBe('new');
  });

  it('preemptive 刷新失败不影响 authenticated 结果', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 3_600 });
    const refresh = vi.fn(async () => {
      throw new Error('background refresh failed');
    });
    const refresher = new TokenRefresher({ tokenStore: store, refresh, cooldownMs: 0 });

    await expect(
      restoreSession({ tokenStore: store, refresher, preemptive: true })
    ).resolves.toEqual({ status: 'authenticated', tokenStatus: 'valid' });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(store.getAccessToken()).toBe('a');
  });
});

describe('webStorageAdapter 边界状态', () => {
  it('默认 key 为 app.auth', () => {
    const raw = createFakeStorage();
    const storage = webStorageAdapter({ storage: raw });

    storage.write(snapshot);

    expect(raw.getItem('app.auth')).not.toBeNull();
  });

  it('maxAgeMs = 0 表示不做过期限制', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const raw = createFakeStorage();
    const storage = webStorageAdapter({ storage: raw, maxAgeMs: 0 });

    storage.write(snapshot);
    vi.advanceTimersByTime(400 * 24 * 3_600 * 1_000);

    expect(storage.read()).not.toBeNull();
  });

  it('缺少 _savedAt 的旧数据在启用 maxAge 时按过期处理', () => {
    const raw = createFakeStorage();
    raw.setItem('app.auth', JSON.stringify(snapshot));
    const storage = webStorageAdapter({ storage: raw, maxAgeMs: 1 });

    expect(storage.read()).toBeNull();
  });

  it('_savedAt 非法（非数字）时按过期处理', () => {
    const raw = createFakeStorage();
    raw.setItem('app.auth', JSON.stringify({ ...snapshot, _savedAt: 'yesterday' }));
    const storage = webStorageAdapter({ storage: raw, maxAgeMs: 1 });

    expect(storage.read()).toBeNull();
  });

  it('maxAgeMs = 0 时允许无 _savedAt 的旧数据', () => {
    const raw = createFakeStorage();
    raw.setItem('app.auth', JSON.stringify(snapshot));
    const storage = webStorageAdapter({ storage: raw, maxAgeMs: 0 });

    expect(storage.read()).toMatchObject({ accessToken: 'access' });
  });

  it('separate 策略下只有 refreshToken key 时读取为 null', () => {
    const raw = createFakeStorage();
    raw.setItem('app.auth.rt', JSON.stringify({ refreshToken: 'r', _savedAt: Date.now() }));
    const storage = webStorageAdapter({
      storage: raw,
      refreshTokenStrategy: 'separate',
    });

    expect(storage.read()).toBeNull();
  });

  it('setItem 抛错（配额满）时 write 静默失败', () => {
    const raw = createFakeStorage();
    raw.setItem = () => {
      throw new Error('quota exceeded');
    };
    const storage = webStorageAdapter({ storage: raw });

    expect(() => storage.write(snapshot)).not.toThrow();
  });

  it('未传 storage 时回退到全局 localStorage', () => {
    const raw = createFakeStorage();
    vi.stubGlobal('localStorage', raw);
    const storage = webStorageAdapter({ key: 'auth' });

    storage.write(snapshot);

    expect(raw.getItem('auth')).not.toBeNull();
    expect(storage.read()).toMatchObject({ accessToken: 'access' });
  });

  it('主 key 被其他 tab 删除时通知 null', () => {
    const raw = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });
    const storage = webStorageAdapter({ key: 'auth', storage: raw });
    const listener = vi.fn();
    storage.subscribe?.(listener);

    storage.write(snapshot);
    raw.removeItem('auth');
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));

    expect(listener).toHaveBeenLastCalledWith(null);
  });
});

describe('跨 tab 状态守卫', () => {
  function setupSync() {
    const raw = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });
    const storage = webStorageAdapter({ key: 'auth', storage: raw });
    const store = new TokenStore({ storage });
    const off = syncTokenStoreWithStorage(store, storage);
    return { raw, listeners, store, off };
  }

  it('忽略版本更低的外部快照', () => {
    const { raw, listeners, store, off } = setupSync();
    store.setTokens({ accessToken: 'local', expiresIn: 3_600 });

    raw.setItem(
      'auth',
      JSON.stringify({ ...snapshot, accessToken: 'stale', version: 1, _savedAt: Date.now() })
    );
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));

    expect(store.getAccessToken()).toBe('local');
    off();
  });

  it('外部删除 key 时清空本地状态', () => {
    const { raw, listeners, store, off } = setupSync();
    store.setTokens({ accessToken: 'local', refreshToken: 'r', expiresIn: 3_600 });
    const clear = vi.fn();
    store.on('clear', clear);

    raw.removeItem('auth');
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));

    expect(store.getStatus()).toBe('anonymous');
    expect(clear).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('响应与错误状态补充', () => {
  it('code = 200 也视为成功', async () => {
    const http = createHttp({ plugins: [responseUnwrapPlugin()] });
    http.defaults.adapter = okAdapter({ code: 200, message: 'ok', data: 'done' });

    await expect(http.get('/x')).resolves.toMatchObject({ data: 'done' });
  });

  it('空字符串响应体原样透传', async () => {
    const http = createHttp({ plugins: [responseUnwrapPlugin()] });
    http.defaults.adapter = okAdapter('');

    await expect(http.get('/x')).resolves.toMatchObject({ data: '' });
  });

  it('归一化是幂等的，避免重放时二次归一化', async () => {
    const normalized = { kind: 'http' as const, status: 401, message: 'cached', raw: {} };
    const http = createHttp({ plugins: [errorNormalizerPlugin()] });
    http.defaults.adapter = throwAdapter(() => normalized);

    const error = await http.get('/x').then(
      () => null,
      (e: unknown) => e
    );

    expect(error).toBe(normalized);
  });

  it('仅 message 含 timeout 也能识别为超时', async () => {
    const http = createHttp({ plugins: [errorNormalizerPlugin()] });
    http.defaults.adapter = throwAdapter(
      (config: InternalAxiosRequestConfig) => new AxiosError('timeout of 5000ms exceeded', '', config)
    );

    await expect(http.get('/x')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('无响应体文案的 401 回落为「请求失败（401）」', async () => {
    const http = createHttp({ plugins: [errorNormalizerPlugin()] });
    http.defaults.adapter = throwAdapter((config) => httpError(config, 401));

    await expect(http.get('/x')).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      message: '请求失败（401）',
    });
  });
});
