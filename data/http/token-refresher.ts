/**
 * TokenRefresher —— 刷新编排单例，bootstrap 与 401 兜底共用。
 *
 * - inflight 去重：并发刷新只真正执行一次
 * - 失败冷却：cooldownMs 内非 bootstrap 刷新直接失败，避免雪崩
 * - timeoutMs 兜底并 abort 底层请求，防止启动阶段被无响应的刷新接口挂死
 * - refresh 实现必须用独立 axios 实例（不挂本套拦截器），否则 401 递归
 * - requireRefreshToken 可避免无 refreshToken（same 策略未登录）时的空刷新
 * - 成功后写回 TokenStore；失败仅 markInvalid，不自动登出
 */
import type { AuthTokens, TokenSnapshot } from './types';
import type { TokenStore } from './token-store';

export type RefreshReason = 'bootstrap' | 'proactive' | 'unauthorized';

export interface TokenRefresherOptions {
  tokenStore: TokenStore;
  /**
   * 刷新函数：必须使用独立 axios 实例（不挂本套拦截器）。
   * refreshToken 可能为 undefined（httpOnly cookie 模式），由实现决定如何处理；
   * signal 会在超时时 abort，可用于取消底层请求。
   */
  refresh: (refreshToken: string | undefined, signal: AbortSignal) => Promise<AuthTokens>;
  /** 失败冷却（毫秒），默认 10s */
  cooldownMs?: number;
  /** 刷新超时（毫秒），默认 10s；超时会 abort 传给 refresh 的 signal */
  timeoutMs?: number;
  /**
   * 是否要求必须存在 refreshToken 才发起刷新，默认 false（兼容 httpOnly cookie 模式）。
   * refreshToken 落盘（same / separate）时建议设为 true，避免无意义请求。
   */
  requireRefreshToken?: boolean;
  onRefreshed?: (snapshot: TokenSnapshot, reason: RefreshReason) => void | Promise<void>;
  onRefreshFailed?: (error: unknown, reason: RefreshReason) => void | Promise<void>;
}

/** 执行通知类回调并隔离其异常，避免回调故障影响刷新主流程 */
async function invokeSafely(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* 回调异常不影响刷新结果 */
  }
}

export class TokenRefresher {
  private inflight: Promise<TokenSnapshot> | null = null;
  private lastFailedAt = 0;
  private readonly opts: Required<Pick<TokenRefresherOptions, 'cooldownMs' | 'timeoutMs'>> &
    TokenRefresherOptions;

  constructor(options: TokenRefresherOptions) {
    // 用 ?? 而非对象展开：显式传入 undefined 时仍应回落到默认值
    this.opts = {
      ...options,
      cooldownMs: options.cooldownMs ?? 10_000,
      timeoutMs: options.timeoutMs ?? 10_000,
    };
  }

  isCoolingDown(): boolean {
    return this.opts.cooldownMs > 0 && Date.now() - this.lastFailedAt < this.opts.cooldownMs;
  }

  async refresh(reason: RefreshReason): Promise<TokenSnapshot> {
    if (this.inflight) return this.inflight;

    if (reason !== 'bootstrap' && this.isCoolingDown()) {
      throw new Error('[TokenRefresher] cooling down after recent failure');
    }

    const rt = this.opts.tokenStore.getRefreshToken();

    // 落盘策略下没有 refreshToken 时没有刷新意义，直接失败
    if (!rt && this.opts.requireRefreshToken) {
      const err = new Error('[TokenRefresher] refresh token is missing');
      await this.recordFailure(err, reason);
      throw err;
    }

    this.inflight = (async () => {
      const tokens = await this.withTimeout((signal) => this.opts.refresh(rt, signal));
      const snapshot = this.opts.tokenStore.setTokens(tokens, { event: 'refresh' });
      // 成功刷新后立即解除失败冷却，避免刚换到新 token 仍被旧失败阻塞
      this.lastFailedAt = 0;
      // 回调只做通知，异常不能反过来把已成功的刷新判为失败
      await invokeSafely(() => this.opts.onRefreshed?.(snapshot, reason));
      return snapshot;
    })();

    try {
      return await this.inflight;
    } catch (err) {
      await this.recordFailure(err, reason);
      throw err;
    } finally {
      this.inflight = null;
    }
  }

  private async recordFailure(err: unknown, reason: RefreshReason): Promise<void> {
    this.lastFailedAt = Date.now();
    this.opts.tokenStore.markInvalid(`refresh failed: ${reason}`);
    // 通知回调异常不能覆盖原始刷新错误
    await invokeSafely(() => this.opts.onRefreshFailed?.(err, reason));
  }

  private withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const { timeoutMs } = this.opts;
    const controller = new AbortController();
    const promise = run(controller.signal);
    if (!timeoutMs) return promise;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error('[TokenRefresher] timeout'));
      }, timeoutMs);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }
}
