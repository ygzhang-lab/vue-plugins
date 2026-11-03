import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncTokenStoreWithStorage } from '../storage/synced';
import { webStorageAdapter } from '../storage/web-storage';
import { TokenStore } from '../token-store';
import { createFakeStorage } from './helpers';
import type { TokenSnapshot, TokenStorage } from '../types';

const snapshot: TokenSnapshot = {
  accessToken: 'external',
  tokenType: 'Bearer',
  version: 9,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncTokenStoreWithStorage', () => {
  it('把 storage.subscribe 的快照转发给 hydrateFromExternal', () => {
    let notify: ((value: TokenSnapshot | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const storage: TokenStorage = {
      read: () => null,
      write: () => {},
      subscribe: (listener) => {
        notify = listener;
        return unsubscribe;
      },
    };
    const store = { hydrateFromExternal: vi.fn() } as unknown as TokenStore;

    const off = syncTokenStoreWithStorage(store, storage);

    notify?.(snapshot);
    expect(store.hydrateFromExternal).toHaveBeenCalledWith(snapshot);

    notify?.(null);
    expect(store.hydrateFromExternal).toHaveBeenLastCalledWith(null);

    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('storage 不支持 subscribe 时返回空操作', () => {
    const storage: TokenStorage = { read: () => null, write: () => {} };
    const store = { hydrateFromExternal: vi.fn() } as unknown as TokenStore;

    const off = syncTokenStoreWithStorage(store, storage);

    expect(off).toBeTypeOf('function');
    expect(() => off()).not.toThrow();
    expect(store.hydrateFromExternal).not.toHaveBeenCalled();
  });

  it('端到端：其他 tab 登出后本 tab 状态清空', () => {
    const local = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });

    const storageA = webStorageAdapter({ key: 'auth', storage: local });
    const storageB = webStorageAdapter({ key: 'auth', storage: local });
    const tabA = new TokenStore({ storage: storageA });
    const tabB = new TokenStore({ storage: storageB });
    syncTokenStoreWithStorage(tabB, storageB);

    tabA.setTokens({ accessToken: 'token-a', expiresIn: 3_600 });
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));
    expect(tabB.getAccessToken()).toBe('token-a');

    const clear = vi.fn();
    tabB.on('clear', clear);

    tabA.clear('logout');
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));

    expect(tabB.getStatus()).toBe('anonymous');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('端到端：其他 tab 写入后本 tab 状态同步', () => {
    const local = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });

    const storage = webStorageAdapter({ key: 'auth', storage: local });
    const store = new TokenStore({ storage });
    const off = syncTokenStoreWithStorage(store, storage);

    // 模拟另一个 tab 写入了更高版本
    local.setItem(
      'auth',
      JSON.stringify({ ...snapshot, _savedAt: Date.now(), version: 10 })
    );
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));

    expect(store.getAccessToken()).toBe('external');
    expect(store.getVersion()).toBe(10);

    off();
  });
});
