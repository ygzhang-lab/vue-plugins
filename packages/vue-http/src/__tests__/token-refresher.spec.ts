import { describe, expect, it, vi } from 'vitest';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import type { AuthTokens } from '../types';

function makeStore(): TokenStore {
  const store = new TokenStore();
  store.setTokens({ accessToken: 'old', refreshToken: 'refresh-token' });
  return store;
}

describe('TokenRefresher', () => {
  it('成功后写回 TokenStore 并触发 onRefreshed', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => ({ accessToken: 'new', expiresIn: 3_600 }));
    const onRefreshed = vi.fn();
    const refresher = new TokenRefresher({ tokenStore: store, refresh, onRefreshed });

    const snapshot = await refresher.refresh('bootstrap');

    expect(snapshot.accessToken).toBe('new');
    expect(store.getAccessToken()).toBe('new');
    expect(refresh).toHaveBeenCalledWith('refresh-token', expect.any(AbortSignal));
    expect(onRefreshed).toHaveBeenCalledWith(snapshot, 'bootstrap');
  });

  it('并发刷新只调用一次 refresh，所有调用共享结果', async () => {
    const store = makeStore();
    let resolveRefresh!: (tokens: AuthTokens) => void;
    const refresh = vi.fn(
      () =>
        new Promise<AuthTokens>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const refresher = new TokenRefresher({ tokenStore: store, refresh });

    const first = refresher.refresh('bootstrap');
    const second = refresher.refresh('proactive');
    resolveRefresh({ accessToken: 'new' });

    const [a, b] = await Promise.all([first, second]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a.accessToken).toBe('new');
    expect(b).toEqual(a);
  });

  it('失败时记录冷却、markInvalid 并触发 onRefreshFailed', async () => {
    const store = makeStore();
    const error = new Error('refresh failed');
    const refresh = vi.fn(async () => {
      throw error;
    });
    const onFailed = vi.fn();
    const invalid = vi.fn();
    store.on('invalid', invalid);
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 10_000,
      onRefreshFailed: onFailed,
    });

    await expect(refresher.refresh('proactive')).rejects.toBe(error);

    expect(onFailed).toHaveBeenCalledWith(error, 'proactive');
    expect(invalid).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'refresh failed: proactive' })
    );
    expect(refresher.isCoolingDown()).toBe(true);
  });

  it('冷却期内拒绝非 bootstrap 刷新，但 bootstrap 可绕过', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => {
      throw new Error('boom');
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 60_000,
    });

    await expect(refresher.refresh('proactive')).rejects.toThrow('boom');
    await expect(refresher.refresh('proactive')).rejects.toThrow('cooling down');
    expect(refresh).toHaveBeenCalledTimes(1);

    await expect(refresher.refresh('bootstrap')).rejects.toThrow('boom');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('requireRefreshToken：无 refreshToken 时短路，不调用 refresh', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'only-access' });
    const refresh = vi.fn();
    const onFailed = vi.fn();
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      requireRefreshToken: true,
      cooldownMs: 0,
      onRefreshFailed: onFailed,
    });

    await expect(refresher.refresh('bootstrap')).rejects.toThrow('refresh token is missing');
    expect(refresh).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('默认允许无 refreshToken 刷新（cookie 模式）', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'only-access' });
    const refresh = vi.fn(async () => ({ accessToken: 'new' }));
    const refresher = new TokenRefresher({ tokenStore: store, refresh, cooldownMs: 0 });

    await expect(refresher.refresh('bootstrap')).resolves.toMatchObject({ accessToken: 'new' });
    expect(refresh).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it('超时后 abort 底层请求并 reject', async () => {
    const store = makeStore();
    let signal: AbortSignal | undefined;
    const refresh = vi.fn((_rt: string | undefined, s: AbortSignal) => {
      signal = s;
      return new Promise<AuthTokens>(() => {});
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      timeoutMs: 20,
      cooldownMs: 0,
    });

    await expect(refresher.refresh('bootstrap')).rejects.toThrow('timeout');
    expect(signal?.aborted).toBe(true);
  });

  it('timeoutMs 为 0 时不加超时', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => ({ accessToken: 'new' }));
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      timeoutMs: 0,
      cooldownMs: 0,
    });

    await expect(refresher.refresh('bootstrap')).resolves.toMatchObject({ accessToken: 'new' });
  });

  it('onRefreshed 抛错不影响已成功的刷新', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => ({ accessToken: 'new', expiresIn: 3_600 }));
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 0,
      onRefreshed: () => {
        throw new Error('callback failed');
      },
    });

    await expect(refresher.refresh('bootstrap')).resolves.toMatchObject({ accessToken: 'new' });
    expect(store.getAccessToken()).toBe('new');
    expect(refresher.isCoolingDown()).toBe(false);
  });

  it('onRefreshFailed 抛错不掩盖原始刷新错误', async () => {
    const store = makeStore();
    const error = new Error('refresh failed');
    const refresh = vi.fn(async () => {
      throw error;
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 0,
      onRefreshFailed: () => {
        throw new Error('callback failed');
      },
    });

    await expect(refresher.refresh('proactive')).rejects.toBe(error);
  });

  it('刷新成功后解除失败冷却', async () => {
    const store = makeStore();
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ accessToken: 'new', expiresIn: 3_600 });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 60_000,
    });

    await expect(refresher.refresh('proactive')).rejects.toThrow('boom');
    expect(refresher.isCoolingDown()).toBe(true);

    await expect(refresher.refresh('bootstrap')).resolves.toMatchObject({ accessToken: 'new' });
    expect(refresher.isCoolingDown()).toBe(false);
  });

  it('显式传入 undefined 的 cooldownMs 仍使用默认值', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => {
      throw new Error('boom');
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: undefined,
    });

    await expect(refresher.refresh('proactive')).rejects.toThrow('boom');
    expect(refresher.isCoolingDown()).toBe(true);
  });

  it('冷却时间从 lastFailedAt 起算', async () => {
    const store = makeStore();
    const refresh = vi.fn(async () => {
      throw new Error('boom');
    });
    const refresher = new TokenRefresher({
      tokenStore: store,
      refresh,
      cooldownMs: 1_000,
    });

    expect(refresher.isCoolingDown()).toBe(false);
    await expect(refresher.refresh('proactive')).rejects.toThrow('boom');
    expect(refresher.isCoolingDown()).toBe(true);
  });
});
