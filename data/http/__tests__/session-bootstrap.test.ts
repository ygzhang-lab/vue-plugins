import { describe, expect, it, vi } from 'vitest';
import { TokenStore } from '../token-store';
import { TokenRefresher } from '../token-refresher';
import { restoreSession } from '../session-bootstrap';
import type { AuthTokens } from '../types';

function createRefresher(
  store: TokenStore,
  impl: () => Promise<AuthTokens> = async () => ({ accessToken: 'new', expiresIn: 3_600 })
) {
  const refresh = vi.fn(impl);
  const refresher = new TokenRefresher({ tokenStore: store, refresh, cooldownMs: 0 });
  return { refresh, refresher };
}

describe('restoreSession', () => {
  it('无 token：anonymous，不刷新', async () => {
    const store = new TokenStore();
    const { refresh, refresher } = createRefresher(store);

    await expect(restoreSession({ tokenStore: store, refresher })).resolves.toEqual({
      status: 'anonymous',
      tokenStatus: 'anonymous',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('token 有效：authenticated，不刷新', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', expiresIn: 3_600 });
    const { refresh, refresher } = createRefresher(store);

    await expect(restoreSession({ tokenStore: store, refresher })).resolves.toEqual({
      status: 'authenticated',
      tokenStatus: 'valid',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preemptive：有效 token 也在后台预热刷新', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', expiresIn: 3_600 });
    const { refresh, refresher } = createRefresher(store);

    await expect(
      restoreSession({ tokenStore: store, refresher, preemptive: true })
    ).resolves.toEqual({ status: 'authenticated', tokenStatus: 'valid' });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(store.getAccessToken()).toBe('new');
  });

  it('临近过期：静默刷新成功，返回 refreshed', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 30 });
    const { refresh, refresher } = createRefresher(store);

    await expect(restoreSession({ tokenStore: store, refresher })).resolves.toEqual({
      status: 'refreshed',
      tokenStatus: 'valid',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.getAccessToken()).toBe('new');
  });

  it('无 expiresAt（unknown）：尝试刷新', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r' });
    const { refresh, refresher } = createRefresher(store);

    await expect(restoreSession({ tokenStore: store, refresher })).resolves.toMatchObject({
      status: 'refreshed',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('刷新失败：返回 expired，保留 refreshToken', async () => {
    const store = new TokenStore();
    const past = Date.now() - 1_000;
    store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: past });
    const { refresher } = createRefresher(store, async () => {
      throw new Error('refresh failed');
    });

    const result = await restoreSession({ tokenStore: store, refresher });

    expect(result.status).toBe('expired');
    expect(result.tokenStatus).toBe('expired');
    expect(store.getRefreshToken()).toBe('r');
  });

  it('自定义 expiringThresholdMs 影响判定', async () => {
    const store = new TokenStore();
    store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 120 });
    const { refresh, refresher } = createRefresher(store);

    await expect(
      restoreSession({ tokenStore: store, refresher, expiringThresholdMs: 300_000 })
    ).resolves.toMatchObject({ status: 'refreshed' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
