import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenStore } from '../token-store';
import { memoryStorageAdapter } from '../storage/memory';
import type { TokenSnapshot, TokenStorage } from '../types';

describe('TokenStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('状态机', () => {
    it('无 token 时为 anonymous', () => {
      const store = new TokenStore();
      expect(store.getStatus()).toBe('anonymous');
      expect(store.isAuthenticated()).toBe(false);
      expect(store.getAccessToken()).toBeUndefined();
    });

    it('按剩余有效期在 valid / expiring / expired 之间切换', () => {
      const store = new TokenStore({ expiringThresholdMs: 60_000 });
      store.setTokens({ accessToken: 'a', expiresIn: 3_600 });

      expect(store.getStatus()).toBe('valid');
      expect(store.isAccessTokenValid()).toBe(true);

      vi.advanceTimersByTime(3_570_000); // 剩余 30s ≤ 阈值
      expect(store.getStatus()).toBe('expiring');
      expect(store.isExpiringSoon()).toBe(true);
      expect(store.isAuthenticated()).toBe(true);

      vi.advanceTimersByTime(30_000);
      expect(store.getStatus()).toBe('expired');
      expect(store.isAuthenticated()).toBe(false);
    });

    it('无 expiresAt 时为 unknown，并交给 401 兜底', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a' });
      expect(store.getStatus()).toBe('unknown');
      expect(store.isAuthenticated()).toBe(true);
    });

    it('只有 refreshToken 时视为 expired', () => {
      const store = new TokenStore();
      store.hydrateFromExternal({ refreshToken: 'r', tokenType: 'Bearer', version: 1 });
      expect(store.getStatus()).toBe('expired');
      expect(store.hasRefreshToken()).toBe(true);
      expect(store.isAuthenticated()).toBe(false);
    });

    it('expiresAt 优先于 expiresIn', () => {
      const store = new TokenStore();
      const expiresAt = Date.now() + 10_000;
      store.setTokens({ accessToken: 'a', expiresIn: 3_600, expiresAt });
      expect(store.getSnapshot().expiresAt).toBe(expiresAt);
    });
  });

  describe('写入与读取', () => {
    it('login / refresh 事件按是否存在旧 accessToken 判定', () => {
      const store = new TokenStore();
      const types: string[] = [];
      store.on('login', () => types.push('login'));
      store.on('refresh', () => types.push('refresh'));

      store.setTokens({ accessToken: 'a' });
      store.setTokens({ accessToken: 'b' });

      expect(types).toEqual(['login', 'refresh']);
    });

    it('setTokens 显式 event 优先', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a' });
      const login = vi.fn();
      store.on('login', login);
      store.setTokens({ accessToken: 'b' }, { event: 'login' });
      expect(login).toHaveBeenCalledTimes(1);
    });

    it('未传 refreshToken 时保留旧值', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a', refreshToken: 'r' });
      store.setTokens({ accessToken: 'b' });
      expect(store.getRefreshToken()).toBe('r');
    });

    it('updateTokens 局部更新：保留 expiresAt，版本推进，reason 透传', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 3_600 });
      const before = store.getSnapshot();
      const refresh = vi.fn();
      store.on('refresh', refresh);

      store.updateTokens({ tokenType: 'Custom' }, 'silent-renew');

      const after = store.getSnapshot();
      expect(store.getTokenType()).toBe('Custom');
      expect(after.refreshToken).toBe('r');
      expect(after.expiresAt).toBe(before.expiresAt);
      expect(after.version).toBeGreaterThan(before.version);
      expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ reason: 'silent-renew' }));
    });

    it('updateTokens 在无 token 时抛错', () => {
      expect(() => new TokenStore().updateTokens({ accessToken: 'x' })).toThrow(
        'requires existing token'
      );
    });

    it('clear 清空 token、保留 tokenType、触发 clear 事件', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer' });
      const clear = vi.fn();
      store.on('clear', clear);

      store.clear('logout');

      expect(store.getStatus()).toBe('anonymous');
      expect(store.getAccessToken()).toBeUndefined();
      expect(store.getRefreshToken()).toBeUndefined();
      expect(store.getTokenType()).toBe('Bearer');
      expect(clear).toHaveBeenCalledWith(expect.objectContaining({ reason: 'logout' }));
    });

    it('clear 写入 null，供其他 tab 通过 storage 事件感知登出', () => {
      const storage = memoryStorageAdapter();
      const store = new TokenStore({ storage });
      store.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 3_600 });
      expect(storage.read()).not.toBeNull();

      store.clear('logout');

      expect(storage.read()).toBeNull();
    });

    it('getSnapshot 返回副本，外部修改不影响内部状态', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a' });
      const snapshot = store.getSnapshot();
      snapshot.accessToken = 'hacked';
      expect(store.getAccessToken()).toBe('a');
    });
  });

  describe('水合', () => {
    it('从 storage 恢复并只触发一次 hydrate，重复调用走幂等分支', async () => {
      const storage = memoryStorageAdapter();
      const writer = new TokenStore({ storage });
      writer.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 3_600 });

      const reader = new TokenStore({ storage });
      const hydrate = vi.fn();
      reader.on('hydrate', hydrate);

      expect(reader.isHydrated()).toBe(false);
      expect(await reader.hydrate()).toBe(true);
      expect(reader.isHydrated()).toBe(true);
      expect(reader.getAccessToken()).toBe('a');
      expect(reader.getRefreshToken()).toBe('r');
      expect(hydrate).toHaveBeenCalledTimes(1);

      expect(await reader.hydrate()).toBe(true);
      expect(hydrate).toHaveBeenCalledTimes(1);
    });

    it('storage 为空时返回 false', async () => {
      const store = new TokenStore({ storage: memoryStorageAdapter() });
      expect(await store.hydrate()).toBe(false);
      expect(store.getStatus()).toBe('anonymous');
    });

    it('规范化旧数据：非法字段降级，缺 version 时补 1', async () => {
      const storage: TokenStorage = {
        read: () =>
          ({
            accessToken: 42,
            refreshToken: 'r',
            tokenType: 9,
            expiresAt: 'bad',
            version: 'bad',
          }) as unknown as TokenSnapshot,
        write: () => {},
      };
      const store = new TokenStore({ storage });

      expect(await store.hydrate()).toBe(true);
      expect(store.getAccessToken()).toBeUndefined();
      expect(store.getRefreshToken()).toBe('r');
      expect(store.getTokenType()).toBe('Bearer');
      expect(store.getSnapshot().expiresAt).toBeUndefined();
      expect(store.getVersion()).toBe(1);
    });

    it('并发 hydrate 共享同一次读取', async () => {
      let resolveRead!: (value: TokenSnapshot | null) => void;
      const read = vi.fn(
        () => new Promise<TokenSnapshot | null>((resolve) => {
          resolveRead = resolve;
        })
      );
      const store = new TokenStore({ storage: { read, write: () => {} } });

      const first = store.hydrate();
      const second = store.hydrate();
      resolveRead({ accessToken: 'a', tokenType: 'Bearer', version: 1 });

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('storage.read 失败后不锁定 hydrated，允许重试', async () => {
      let attempts = 0;
      const storage: TokenStorage = {
        read: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error('io failed'))
            : { accessToken: 'a', tokenType: 'Bearer', version: 1 };
        },
        write: () => {},
      };
      const store = new TokenStore({ storage });

      await expect(store.hydrate()).rejects.toThrow('io failed');
      expect(store.isHydrated()).toBe(false);

      await expect(store.hydrate()).resolves.toBe(true);
      expect(store.getAccessToken()).toBe('a');
    });

    it('storage.read 失败时 hydrate 会 reject', async () => {
      const storage: TokenStorage = {
        read: () => Promise.reject(new Error('io failed')),
        write: () => {},
      };
      await expect(new TokenStore({ storage }).hydrate()).rejects.toThrow('io failed');
    });
  });

  describe('外部同步（多 tab）', () => {
    it('接受更高版本、忽略更低版本，并区分 login / refresh', () => {
      const store = new TokenStore();
      const login = vi.fn();
      const refresh = vi.fn();
      store.on('login', login);
      store.on('refresh', refresh);

      store.hydrateFromExternal({ accessToken: 'v1', tokenType: 'Bearer', version: 1 });
      expect(login).toHaveBeenCalledTimes(1);

      store.hydrateFromExternal({ accessToken: 'v2', tokenType: 'Bearer', version: 2 });
      expect(refresh).toHaveBeenCalledTimes(1);

      store.hydrateFromExternal({ accessToken: 'stale', tokenType: 'Bearer', version: 1 });
      expect(store.getAccessToken()).toBe('v2');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('外部 clear 只在前有 token 时触发一次', () => {
      const store = new TokenStore();
      const clear = vi.fn();
      store.on('clear', clear);

      store.hydrateFromExternal(null); // 本来就没有 token
      expect(clear).not.toHaveBeenCalled();

      store.setTokens({ accessToken: 'a' });
      store.hydrateFromExternal(null);
      expect(store.getAccessToken()).toBeUndefined();
      expect(clear).toHaveBeenCalledTimes(1);

      store.hydrateFromExternal(null);
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it('外部 clear 后版本仍单调递增，后续外部登录不会被忽略', () => {
      const a = new TokenStore();
      a.setTokens({ accessToken: 'a' });

      const b = new TokenStore();
      b.hydrateFromExternal(a.getSnapshot());
      b.hydrateFromExternal(null); // A 登出
      expect(b.getVersion()).toBeGreaterThan(a.getVersion());

      b.setTokens({ accessToken: 'b' }); // B 重新登录
      a.hydrateFromExternal(b.getSnapshot());
      expect(a.getAccessToken()).toBe('b');
    });
  });

  describe('事件', () => {
    it('on 返回取消订阅函数，off 后不再收到事件', () => {
      const store = new TokenStore();
      const listener = vi.fn();
      const off = store.on('login', listener);

      store.setTokens({ accessToken: 'a' });
      off();
      store.clear();
      store.setTokens({ accessToken: 'b' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('once 只触发一次', () => {
      const store = new TokenStore();
      const listener = vi.fn();
      store.once('refresh', listener);

      store.setTokens({ accessToken: 'a' }); // login
      store.setTokens({ accessToken: 'b' }); // refresh
      store.setTokens({ accessToken: 'c' }); // refresh

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('每次变更都补发 change，subscribe 收到快照', () => {
      const store = new TokenStore();
      const snapshots: Array<string | undefined> = [];
      const off = store.subscribe((snapshot) => snapshots.push(snapshot.accessToken));

      store.setTokens({ accessToken: 'a' });
      store.updateTokens({ tokenType: 'Custom' });
      off();
      store.clear();

      expect(snapshots).toEqual(['a', 'a']);
    });

    it('订阅者抛错不影响其他订阅者', () => {
      const store = new TokenStore();
      const seen: string[] = [];
      store.on('login', () => {
        throw new Error('bad listener');
      });
      store.on('login', (payload) => seen.push(payload.snapshot.accessToken ?? ''));

      expect(() => store.setTokens({ accessToken: 'a' })).not.toThrow();
      expect(seen).toEqual(['a']);
    });
  });

  describe('失效与过期监控', () => {
    it('markInvalid 发出 invalid 事件', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a' });
      const invalid = vi.fn();
      store.on('invalid', invalid);

      store.markInvalid('refresh-failed');

      expect(invalid).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'refresh-failed' })
      );
    });

    it('watchExpiration 在过期时只触发一次 expire', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a', expiresIn: 1 });
      const expire = vi.fn();
      store.on('expire', expire);

      const stop = store.watchExpiration({ intervalMs: 100 });
      vi.advanceTimersByTime(1_100);
      expect(expire).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      expect(expire).toHaveBeenCalledTimes(1);

      stop();
    });

    it('markExpired 直接调用也受 once 语义保护', () => {
      const store = new TokenStore();
      store.setTokens({ accessToken: 'a', expiresIn: -1 });
      const expire = vi.fn();
      store.on('expire', expire);

      store.markExpired('manual');
      store.markExpired('manual');

      expect(expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('持久化容错', () => {
    it('write 同步抛错不影响内存状态', () => {
      const storage: TokenStorage = {
        read: () => null,
        write: () => {
          throw new Error('quota exceeded');
        },
      };
      const store = new TokenStore({ storage });

      expect(() => store.setTokens({ accessToken: 'a' })).not.toThrow();
      expect(store.getAccessToken()).toBe('a');
    });

    it('write 返回 rejected promise 不会冒泡', async () => {
      const storage: TokenStorage = {
        read: () => null,
        write: () => Promise.reject(new Error('async quota')),
      };
      const store = new TokenStore({ storage });

      expect(() => store.setTokens({ accessToken: 'a' })).not.toThrow();
      await Promise.resolve();
      expect(store.getAccessToken()).toBe('a');
    });
  });
});
