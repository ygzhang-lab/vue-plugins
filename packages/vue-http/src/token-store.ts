/**
 * TokenStore —— token 领域状态的唯一数据源（不依赖 Vue / axios）。
 *
 * - 显式 hydrate() 从存储恢复；构造时不读存储，保证启动时序可控
 * - setTokens / clear 写入后推进 version（时间戳兜底），用于并发刷新与跨 tab 回退守卫
 * - 变更派发细粒度事件（hydrate/login/refresh/expire/invalid/clear），并补发 'change'
 * - 状态：anonymous / valid / expiring / expired / unknown
 * 注意：业务层不要另存 accessToken，一律通过本类读取。
 */
import type { AuthTokens, TokenSnapshot, TokenStorage } from './types';

export type TokenStatus = 'anonymous' | 'valid' | 'expiring' | 'expired' | 'unknown';

export type TokenEventType =
  | 'change'
  | 'hydrate'
  | 'login'
  | 'refresh'
  | 'expire'
  | 'invalid'
  | 'clear';

export interface TokenEventPayload {
  type: TokenEventType;
  snapshot: TokenSnapshot;
  previous: TokenSnapshot | null;
  reason?: string;
}

export interface TokenStoreOptions {
  storage?: TokenStorage;
  /** getStatus / isExpiringSoon 的默认阈值，默认 60s */
  expiringThresholdMs?: number;
}

export interface WatchExpirationOptions {
  intervalMs?: number;
  expiringThresholdMs?: number;
}

type Listener = (payload: TokenEventPayload) => void;

const EMPTY: TokenSnapshot = { tokenType: 'Bearer', version: 0 };

/** 字段级规范化：处理旧版本持久化数据缺字段 / 类型不符 */
function normalizeSnapshot(raw: unknown): TokenSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<TokenSnapshot>;
  if (!s.accessToken && !s.refreshToken) return null;
  return {
    accessToken: typeof s.accessToken === 'string' ? s.accessToken : undefined,
    refreshToken: typeof s.refreshToken === 'string' ? s.refreshToken : undefined,
    tokenType: typeof s.tokenType === 'string' ? s.tokenType : 'Bearer',
    expiresAt: typeof s.expiresAt === 'number' ? s.expiresAt : undefined,
    version: typeof s.version === 'number' ? s.version : 0,
  };
}

export class TokenStore {
  private state: TokenSnapshot = { ...EMPTY };
  private hydrated = false;
  private hydratePromise: Promise<boolean> | null = null;
  private expirationTimer: ReturnType<typeof setInterval> | null = null;
  private expiredEmitted = false;
  private readonly listeners = new Map<TokenEventType, Set<Listener>>();
  private readonly expiringThresholdMs: number;
  private readonly options: TokenStoreOptions;

  constructor(options: TokenStoreOptions = {}) {
    this.options = options;
    this.expiringThresholdMs = options.expiringThresholdMs ?? 60_000;
  }

  // ───────────────────────── 水合（启动恢复）─────────────────────────

  /**
   * 从持久化中恢复状态并触发 'hydrate' 事件。
   * 必须在使用 store 前 await。仅执行一次。
   * @returns 是否有有效数据被恢复
   */
  async hydrate(): Promise<boolean> {
    if (this.hydrated) return !!this.state.accessToken || !!this.state.refreshToken;
    // 并发调用共享同一次读取；失败后清空 in-flight，允许重试
    if (!this.hydratePromise) {
      this.hydratePromise = this.hydrateOnce().finally(() => {
        this.hydratePromise = null;
      });
    }
    return this.hydratePromise;
  }

  private async hydrateOnce(): Promise<boolean> {
    const raw = await Promise.resolve(this.options.storage?.read() ?? null);
    // 仅在读取成功后标记已水合，存储 IO 失败时可再次尝试
    this.hydrated = true;
    const normalized = normalizeSnapshot(raw);
    if (!normalized) return false;

    const previous = this.getSnapshot();
    this.state = {
      ...normalized,
      version: Math.max(normalized.version, previous.version + 1),
    };
    this.expiredEmitted = false;
    this.emit('hydrate', previous, 'storage-restore');
    return true;
  }

  /** 从外部（其他 tab）注入状态；version 守卫防止旧数据回退新状态 */
  hydrateFromExternal(snapshot: TokenSnapshot | null): void {
    if (snapshot === null) {
      if (!this.state.accessToken && !this.state.refreshToken) return;
      const previous = this.getSnapshot();
      this.state = { tokenType: this.state.tokenType ?? 'Bearer', version: this.nextVersion() };
      this.expiredEmitted = false;
      this.emit('clear', previous, 'external-sync');
      return;
    }

    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return;
    if (normalized.version <= this.state.version) return; // 忽略旧状态

    const previous = this.getSnapshot();
    this.state = normalized;
    this.expiredEmitted = false;
    const type: TokenEventType = !previous.accessToken ? 'login' : 'refresh';
    this.emit(type, previous, 'external-sync');
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  // ───────────────────────── 写入 ─────────────────────────

  setTokens(
    tokens: AuthTokens,
    opts: { event?: 'login' | 'refresh'; reason?: string } = {}
  ): TokenSnapshot {
    const previous = this.getSnapshot();
    const now = Date.now();
    const expiresAt =
      tokens.expiresAt ??
      (tokens.expiresIn !== undefined ? now + tokens.expiresIn * 1000 : undefined);

    this.state = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? this.state.refreshToken,
      tokenType: tokens.tokenType ?? this.state.tokenType ?? 'Bearer',
      expiresAt,
      version: this.nextVersion(),
    };
    this.expiredEmitted = false;

    const type: TokenEventType = opts.event ?? (previous.accessToken ? 'refresh' : 'login');
    this.persist();
    this.emit(type, previous, opts.reason);
    return this.getSnapshot();
  }

  updateTokens(partial: Partial<AuthTokens>, reason?: string): TokenSnapshot {
    if (!this.state.accessToken) throw new Error('[TokenStore] updateTokens requires existing token');
    const prev = this.state;
    // 未提供新的过期信息时沿用旧 expiresAt；提供 expiresIn 时交由 setTokens 重新计算
    const expiresAt =
      partial.expiresAt ?? (partial.expiresIn === undefined ? prev.expiresAt : undefined);
    return this.setTokens(
      {
        accessToken: partial.accessToken ?? prev.accessToken!,
        refreshToken: partial.refreshToken ?? prev.refreshToken,
        tokenType: partial.tokenType ?? prev.tokenType,
        expiresIn: partial.expiresIn,
        expiresAt,
      },
      { event: 'refresh', reason }
    );
  }

  clear(reason = 'logout'): void {
    const previous = this.getSnapshot();
    this.state = { tokenType: this.state.tokenType ?? 'Bearer', version: this.nextVersion() };
    this.expiredEmitted = false;
    // 过期监控属于应用生命周期，不随单次登出停止：SPA 内重新登录后仍能继续收到 expire
    // 需要彻底销毁时调用 stopExpirationWatch()
    // 写 null 而非空快照：存储层会删除 key，其他 tab 才能通过 storage 事件感知登出
    this.persist(null);
    this.emit('clear', previous, reason);
  }

  markInvalid(reason = 'invalid'): void {
    this.emit('invalid', this.getSnapshot(), reason);
  }

  markExpired(reason = 'expired'): void {
    if (this.expiredEmitted) return;
    this.expiredEmitted = true;
    this.emit('expire', this.getSnapshot(), reason);
  }

  // ───────────────────────── 读取 ─────────────────────────

  getAccessToken(): string | undefined { return this.state.accessToken; }
  getRefreshToken(): string | undefined { return this.state.refreshToken; }
  getTokenType(): string { return this.state.tokenType; }
  getVersion(): number { return this.state.version; }
  getSnapshot(): TokenSnapshot { return { ...this.state }; }
  hasAccessToken(): boolean { return !!this.state.accessToken; }
  hasRefreshToken(): boolean { return !!this.state.refreshToken; }

  isAccessTokenValid(thresholdMs?: number): boolean {
    return this.hasAccessToken() && this.getStatus(thresholdMs) !== 'expired';
  }

  isRefreshTokenAvailable(): boolean { return this.hasRefreshToken(); }

  isExpiringSoon(thresholdMs?: number): boolean {
    if (this.state.expiresAt === undefined || !this.state.accessToken) return false;
    const remain = this.state.expiresAt - Date.now();
    return remain > 0 && remain <= (thresholdMs ?? this.expiringThresholdMs);
  }

  /** 路由守卫 / 组件判断用；'unknown' 视为已登录（交给 401 兜底） */
  isAuthenticated(thresholdMs?: number): boolean {
    const s = this.getStatus(thresholdMs);
    return s === 'valid' || s === 'expiring' || s === 'unknown';
  }

  getStatus(thresholdMs?: number): TokenStatus {
    const s = this.state;
    if (!s.accessToken) return s.refreshToken ? 'expired' : 'anonymous';
    if (s.expiresAt === undefined) return 'unknown';
    const remain = s.expiresAt - Date.now();
    if (remain <= 0) return 'expired';
    if (remain <= (thresholdMs ?? this.expiringThresholdMs)) return 'expiring';
    return 'valid';
  }

  // ───────────────────────── 事件 ─────────────────────────

  on(type: TokenEventType, listener: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => this.off(type, listener);
  }

  once(type: TokenEventType, listener: Listener): () => void {
    const wrap: Listener = (p) => {
      this.off(type, wrap);
      listener(p);
    };
    return this.on(type, wrap);
  }

  off(type: TokenEventType, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** 向后兼容：等价于 on('change', p => listener(p.snapshot)) */
  subscribe(listener: (s: TokenSnapshot) => void): () => void {
    return this.on('change', (p) => listener(p.snapshot));
  }

  // ───────────────────────── 过期监控 ─────────────────────────

  watchExpiration(opts: WatchExpirationOptions = {}): () => void {
    this.stopExpirationWatch();
    const intervalMs = opts.intervalMs ?? 30_000;
    this.expirationTimer = setInterval(() => {
      const s = this.state;
      if (!s.accessToken || s.expiresAt === undefined || this.expiredEmitted) return;
      if (Date.now() >= s.expiresAt) this.markExpired('access token expired');
    }, intervalMs);
    (this.expirationTimer as unknown as { unref?: () => void }).unref?.();
    return () => this.stopExpirationWatch();
  }

  stopExpirationWatch(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  // ───────────────────────── 内部 ─────────────────────────

  /**
   * 单调递增的版本号：取「当前版本 + 1」与当前时间戳的较大者。
   * 用时间戳兜底，保证跨 tab 的 clear / 登录交替时版本不会回退。
   */
  private nextVersion(): number {
    return Math.max(this.state.version + 1, Date.now());
  }

  private persist(snapshot: TokenSnapshot | null = this.state): void {
    try {
      const result = this.options.storage?.write(snapshot);
      // 异步适配器 reject 时也吞掉，避免 unhandled rejection
      void Promise.resolve(result).catch(() => { /* 持久化失败不影响内存态 */ });
    } catch {
      /* 持久化失败不影响内存态 */
    }
  }

  private emit(type: TokenEventType, previous: TokenSnapshot | null, reason?: string): void {
    const payload: TokenEventPayload = { type, snapshot: this.getSnapshot(), previous, reason };
    this.dispatch(type, payload);
    if (type !== 'change') this.dispatch('change', { ...payload, type: 'change' });
  }

  private dispatch(type: TokenEventType, payload: TokenEventPayload): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch { /* 订阅者异常隔离 */ }
    }
  }
}
