/**
 * SessionBootstrap —— 启动静默恢复。
 *
 * 前置：await tokenStore.hydrate()；调用时机：app.mount 之前。
 * 按 token 状态分流：anonymous 进登录页 / valid 直接放行 /
 * expiring|expired|unknown 尝试 refresh；失败返回 expired，
 * 但保留 refreshToken 以便冷却后重试。
 */
import type { TokenStatus, TokenStore } from './token-store';
import type { TokenRefresher } from './token-refresher';

export type RestoreStatus = 'anonymous' | 'authenticated' | 'refreshed' | 'expired';

export interface RestoreResult {
  status: RestoreStatus;
  tokenStatus: TokenStatus;
}

export interface RestoreOptions {
  tokenStore: TokenStore;
  refresher: TokenRefresher;
  expiringThresholdMs?: number;
  /** accessToken 仍有效时是否后台预热刷新，默认 false */
  preemptive?: boolean;
}

/**
 * 启动静默恢复：在 app.mount 之前 await。
 * 前置条件：已调用 await tokenStore.hydrate()。
 */
export async function restoreSession(options: RestoreOptions): Promise<RestoreResult> {
  const { tokenStore, refresher, expiringThresholdMs = 60_000, preemptive = false } = options;

  const status = tokenStore.getStatus(expiringThresholdMs);

  if (status === 'anonymous') {
    return { status: 'anonymous', tokenStatus: status };
  }

  if (status === 'valid') {
    if (preemptive) void refresher.refresh('proactive').catch(() => {});
    return { status: 'authenticated', tokenStatus: status };
  }

  // expiring / expired / unknown → 尝试静默刷新
  try {
    await refresher.refresh('bootstrap');
    return { status: 'refreshed', tokenStatus: tokenStore.getStatus() };
  } catch {
    // 刷新失败：不清空 refreshToken，保留冷却后可重试
    return { status: 'expired', tokenStatus: tokenStore.getStatus() };
  }
}
