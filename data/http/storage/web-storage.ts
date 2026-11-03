/**
 * Web Storage 适配器：localStorage / sessionStorage 持久化 + 跨 tab 通知。
 *
 * 写入带 _savedAt，读取时超过 maxAgeMs（默认 30 天）视为无效；
 * 缺少或非法 _savedAt 的快照在 maxAgeMs > 0 时同样按过期处理，避免旧数据永不过期。
 * refreshToken 三种策略：same 同 key / omit 不落盘（配 httpOnly cookie）
 * / separate 单独 key。无 localStorage（SSR、隐私模式）时静默降级为不持久化。
 * subscribe 监听 storage 事件，仅在其他 tab 写入时触发。
 */
import type { TokenSnapshot, TokenStorage } from '../types';

export type RefreshTokenStrategy = 'same' | 'omit' | 'separate';

export interface WebStorageOptions {
  /** 主 key，默认 'app.auth' */
  key?: string;
  /** separate 策略下 refreshToken 的 key，默认 `${key}.rt` */
  refreshKey?: string;
  /** 默认 localStorage；SSR 自动降级 */
  storage?: Storage;
  /** 持久化数据兜底有效期，默认 30 天 */
  maxAgeMs?: number;
  /**
   * - 'same'：accessToken + refreshToken 一起写（默认）
   * - 'omit'：不写 refreshToken（推荐配合 httpOnly cookie）
   * - 'separate'：refreshToken 单独 key
   */
  refreshTokenStrategy?: RefreshTokenStrategy;
}

export function webStorageAdapter(options: WebStorageOptions = {}): TokenStorage {
  const key = options.key ?? 'app.auth';
  const refreshKey = options.refreshKey ?? `${key}.rt`;
  const refreshKeyDistinct = refreshKey !== key;
  const maxAgeMs = options.maxAgeMs ?? 30 * 24 * 3600 * 1000;
  const strategy = options.refreshTokenStrategy ?? 'same';

  const getStore = (): Storage | null => {
    if (options.storage) return options.storage;
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  };

  type Persisted = TokenSnapshot & { _savedAt?: number };

  /** maxAgeMs > 0 时必须带合法写入时间，旧数据 / 损坏数据一律视为过期 */
  const isFresh = (savedAt: unknown): boolean => {
    if (maxAgeMs <= 0) return true;
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false;
    return Date.now() - savedAt <= maxAgeMs;
  };

  const parse = (raw: string | null): TokenSnapshot | null => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Persisted | null;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      if (!isFresh(p._savedAt)) return null;
      return p;
    } catch {
      return null;
    }
  };

  return {
    read() {
      const store = getStore();
      if (!store) return null;
      // getItem 在部分隐私模式 / 受限环境下会抛 SecurityError
      try {
        const main = parse(store.getItem(key));
        if (!main) return null;
        if (strategy === 'separate') {
          const rt = parse(store.getItem(refreshKey));
          if (rt?.refreshToken) main.refreshToken = rt.refreshToken;
        } else if (strategy === 'omit') {
          // 切换到 omit 后，历史数据中的 refreshToken 不能再被读出
          delete main.refreshToken;
        }
        return main;
      } catch {
        return null;
      }
    },
    write(snapshot) {
      const store = getStore();
      if (!store) return;
      try {
        if (!snapshot) {
          store.removeItem(key);
          if (refreshKeyDistinct) store.removeItem(refreshKey);
          return;
        }
        const now = Date.now();
        if (strategy === 'same') {
          store.setItem(key, JSON.stringify({ ...snapshot, _savedAt: now }));
          // 清理从 separate 迁移过来时遗留的独立 refreshToken
          if (refreshKeyDistinct) store.removeItem(refreshKey);
        } else if (strategy === 'omit') {
          const { refreshToken: _rt, ...rest } = snapshot;
          store.setItem(key, JSON.stringify({ ...rest, _savedAt: now }));
          if (refreshKeyDistinct) store.removeItem(refreshKey);
        } else {
          const { refreshToken, ...rest } = snapshot;
          store.setItem(key, JSON.stringify({ ...rest, _savedAt: now }));
          if (refreshToken) {
            store.setItem(refreshKey, JSON.stringify({ refreshToken, _savedAt: now }));
          } else {
            store.removeItem(refreshKey);
          }
        }
      } catch { /* 配额满 / 隐私模式静默降级 */ }
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      const handler = (e: StorageEvent) => {
        // key 为 null 表示其他 tab 调用了 storage.clear()
        if (e.key !== null && e.key !== key && e.key !== refreshKey) return;
        try {
          // 任一 key 变化都重新读完整快照
          const store = getStore();
          const next = store ? parse(store.getItem(key)) : null;
          if (next && strategy === 'separate' && store) {
            const rt = parse(store.getItem(refreshKey));
            if (rt?.refreshToken) next.refreshToken = rt.refreshToken;
          } else if (next && strategy === 'omit') {
            delete next.refreshToken;
          }
          listener(next);
        } catch {
          /* 存储不可读时忽略本次同步 */
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}
