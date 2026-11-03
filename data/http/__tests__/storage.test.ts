import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorageAdapter } from '../storage/memory';
import { webStorageAdapter } from '../storage/web-storage';
import { createFakeStorage } from './helpers';
import type { TokenSnapshot } from '../types';

const snapshot: TokenSnapshot = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresAt: Date.now() + 3_600_000,
  version: 3,
};

describe('memoryStorageAdapter', () => {
  it('读写同一份快照，可被 null 清空', () => {
    const storage = memoryStorageAdapter(snapshot);
    expect(storage.read()).toBe(snapshot);

    storage.write(null);
    expect(storage.read()).toBeNull();

    const empty = memoryStorageAdapter();
    expect(empty.read()).toBeNull();
  });

  it('不提供 subscribe（不参与跨 tab 同步）', () => {
    expect(memoryStorageAdapter().subscribe).toBeUndefined();
  });
});

describe('webStorageAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('same：accessToken 与 refreshToken 一起持久化并恢复', () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({ key: 'auth', storage: store });

    storage.write(snapshot);

    expect(storage.read()).toMatchObject(snapshot);
    expect(store.getItem('auth')).toContain('"refreshToken":"refresh"');
  });

  it('omit：refreshToken 不落盘', async () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'omit',
    });

    storage.write(snapshot);

    const persisted = await storage.read();
    expect(persisted).toMatchObject({ accessToken: 'access', version: 3 });
    expect(persisted?.refreshToken).toBeUndefined();
    expect(store.getItem('auth')).not.toContain('refresh');
  });

  it('omit：读取时忽略历史数据中的 refreshToken', async () => {
    const store = createFakeStorage();
    store.setItem('auth', JSON.stringify({ ...snapshot, _savedAt: Date.now() }));
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'omit',
    });

    const persisted = await storage.read();
    expect(persisted).toMatchObject({ accessToken: 'access' });
    expect(persisted?.refreshToken).toBeUndefined();
  });

  it('omit：写入时清理历史独立 refreshToken key', () => {
    const store = createFakeStorage();
    store.setItem('auth.rt', JSON.stringify({ refreshToken: 'stale', _savedAt: Date.now() }));
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'omit',
    });

    storage.write(snapshot);

    expect(store.getItem('auth.rt')).toBeNull();
  });

  it('write(null) 清理从 separate 迁移遗留的独立 key', () => {
    const store = createFakeStorage();
    store.setItem('auth.rt', JSON.stringify({ refreshToken: 'stale', _savedAt: Date.now() }));
    const storage = webStorageAdapter({ key: 'auth', storage: store });

    storage.write(null);

    expect(store.getItem('auth')).toBeNull();
    expect(store.getItem('auth.rt')).toBeNull();
  });

  it('separate：refreshToken 单独 key，读取时合并', () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'separate',
    });

    storage.write(snapshot);

    expect(store.getItem('auth')).not.toContain('refreshToken');
    expect(store.getItem('auth.rt')).toContain('"refreshToken":"refresh"');
    expect(storage.read()).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('separate：无 refreshToken 时移除独立 key', async () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'separate',
    });

    storage.write(snapshot);
    storage.write({ ...snapshot, refreshToken: undefined });

    expect(store.getItem('auth.rt')).toBeNull();
    expect((await storage.read())?.refreshToken).toBeUndefined();
  });

  it('write(null) 清除主 key 与独立 refreshToken key', () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'separate',
    });

    storage.write(snapshot);
    storage.write(null);

    expect(store.getItem('auth')).toBeNull();
    expect(store.getItem('auth.rt')).toBeNull();
    expect(storage.read()).toBeNull();
  });

  it('超过 maxAgeMs 后视为无效', () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      maxAgeMs: 1_000,
    });

    storage.write(snapshot);
    expect(storage.read()).not.toBeNull();

    vi.advanceTimersByTime(1_001);
    expect(storage.read()).toBeNull();
  });

  it('损坏的 JSON 返回 null', () => {
    const store = createFakeStorage();
    const storage = webStorageAdapter({ key: 'auth', storage: store });
    store.setItem('auth', '{not-json');

    expect(storage.read()).toBeNull();
  });

  it('无 storage 环境（SSR）时读写静默降级', () => {
    vi.stubGlobal('localStorage', undefined);
    const storage = webStorageAdapter({ key: 'auth' });

    expect(() => storage.write(snapshot)).not.toThrow();
    expect(storage.read()).toBeNull();
  });

  it('subscribe 只在相关 key 变化时通知，并支持取消监听', () => {
    const store = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener,
    });

    const storage = webStorageAdapter({ key: 'auth', storage: store });
    const listener = vi.fn();
    const off = storage.subscribe?.(listener);

    expect(listeners).toHaveLength(1);

    storage.write(snapshot);
    listeners.forEach((fn) => fn({ key: 'auth' } as StorageEvent));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access' }));

    listeners.forEach((fn) => fn({ key: 'other' } as StorageEvent));
    expect(listener).toHaveBeenCalledTimes(1);

    off?.();
    expect(removeEventListener).toHaveBeenCalledWith('storage', listeners[0]);
  });

  it('subscribe 在 separate 策略下监听 refreshToken key 并合并', () => {
    const store = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });

    const storage = webStorageAdapter({
      key: 'auth',
      storage: store,
      refreshTokenStrategy: 'separate',
    });
    const listener = vi.fn();
    storage.subscribe?.(listener);
    storage.write(snapshot);

    listeners.forEach((fn) => fn({ key: 'auth.rt' } as StorageEvent));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' })
    );
  });

  it('getItem 抛错（受限环境）时 read 返回 null 而不抛出', () => {
    const store = createFakeStorage();
    store.getItem = () => {
      throw new Error('SecurityError');
    };
    const storage = webStorageAdapter({ key: 'auth', storage: store });

    expect(storage.read()).toBeNull();
  });

  it('其他 tab 调用 storage.clear()（key 为 null）时通知 null', () => {
    const store = createFakeStorage();
    const listeners: Array<(event: StorageEvent) => void> = [];
    vi.stubGlobal('window', {
      addEventListener: (_type: string, fn: (event: StorageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    });
    const storage = webStorageAdapter({ key: 'auth', storage: store });
    const listener = vi.fn();
    storage.subscribe?.(listener);

    storage.write(snapshot);
    store.clear();
    listeners.forEach((fn) => fn({ key: null } as StorageEvent));

    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('无 window 时 subscribe 返回空操作', () => {
    vi.stubGlobal('window', undefined);
    const storage = webStorageAdapter({ storage: createFakeStorage() });
    const off = storage.subscribe?.(vi.fn());

    expect(off).toBeTypeOf('function');
    expect(() => off?.()).not.toThrow();
  });
});
