/**
 * JWT 认证插件：请求注入 + 临近过期主动刷新 + 401 被动刷新重放。
 *
 * 请求阶段：skipAuth 跳过；临近过期且不在冷却期时先刷新，再写 Authorization。
 * 响应阶段：401 时若请求发出后 token 版本已变化（别的请求刷新过），
 * 直接用新 token 重放；否则走 refresher 刷新后重放。_retry 保证最多重放一次。
 * 依赖独立的 TokenRefresher 单例，避免并发刷新。
 */
import type { AxiosError } from 'axios';
import type { HttpMiddleware } from '../types';
import type { TokenStore } from '../token-store';
import type { TokenRefresher } from '../token-refresher';

export interface JwtAuthOptions {
  tokenStore: TokenStore;
  refresher: TokenRefresher;
  refreshBeforeExpirationMs?: number;
}

export function jwtAuthPlugin(options: JwtAuthOptions): HttpMiddleware {
  const { tokenStore, refresher, refreshBeforeExpirationMs = 60_000 } = options;

  return {
    name: 'jwt-auth',
    setup(instance) {
      // 请求：注入 + 主动刷新
      instance.interceptors.request.use(async (config) => {
        if (config.skipAuth) return config;

        let token = tokenStore.getAccessToken();

        if (
          token &&
          tokenStore.isExpiringSoon(refreshBeforeExpirationMs) &&
          !refresher.isCoolingDown()
        ) {
          try {
            token = (await refresher.refresh('proactive')).accessToken;
          } catch {
            // 刷新失败时应以 TokenStore 的当前状态为准；若已被登出清空，
            // 不能再用旧的局部 token 继续发送请求
            token = tokenStore.getAccessToken();
          }
        }

        if (token) {
          config.headers.set('Authorization', `${tokenStore.getTokenType()} ${token}`);
        }
        config._tokenVersion = tokenStore.getVersion();
        return config;
      });

      // 响应：401 → 刷新 → 重放（版本号去重）
      instance.interceptors.response.use(
        (r) => r,
        async (error: AxiosError) => {
          const config = error.config;
          if (!config || config.skipAuth || error.response?.status !== 401 || config._retry) {
            return Promise.reject(error);
          }
          config._retry = true;

          // 其他请求已刷新过 token，直接重放
          if (
            config._tokenVersion !== undefined &&
            config._tokenVersion !== tokenStore.getVersion()
          ) {
            const latest = tokenStore.getAccessToken();
            if (latest) {
              config.headers.set('Authorization', `${tokenStore.getTokenType()} ${latest}`);
              return instance(config);
            }
          }

          try {
            const snap = await refresher.refresh('unauthorized');
            config.headers.set('Authorization', `${snap.tokenType} ${snap.accessToken}`);
            return instance(config);
          } catch {
            // 刷新失败（冷却 / 无 refreshToken / 接口异常）时保留原始 401，
            // 让 error-normalizer 仍归一化为 http(status=401)，避免降级成 unknown
            return Promise.reject(error);
          }
        }
      );
    },
  };
}
