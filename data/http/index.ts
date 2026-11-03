/**
 * @/base/http 包入口：统一导出领域层与插件，并提供默认装配。
 *
 * createAppHttp 固定插件注册顺序：
 *   request-config → jwt-auth → api-key-auth → headers
 *   → response-unwrap → error-normalizer
 * 注意 axios 拦截器顺序：请求拦截器 LIFO（后注册先执行），响应拦截器 FIFO。
 * 本文件按实际执行顺序安排注册：
 *   请求链：headers → api-key-auth → jwt-auth（认证头最后写入，优先级最高）
 *   响应链：jwt-auth(401) → response-unwrap → error-normalizer
 * error-normalizer 必须最后注册，才能兜住 response-unwrap 抛出的业务错误。
 */
import { createHttp } from './create-http';
import { requestConfigPlugin } from './plugins/request-config';
import { headersPlugin } from './plugins/headers';
import { apiKeyAuthPlugin, type ApiKeyAuthOptions } from './plugins/api-key-auth';
import { jwtAuthPlugin, type JwtAuthOptions } from './plugins/jwt-auth';
import { responseUnwrapPlugin } from './plugins/response-unwrap';
import { errorNormalizerPlugin } from './plugins/error-normalizer';

export { TokenStore } from './token-store';
export type {
  TokenStatus,
  TokenEventType,
  TokenEventPayload,
  TokenStoreOptions,
  WatchExpirationOptions,
} from './token-store';

export { TokenRefresher } from './token-refresher';
export type { RefreshReason, TokenRefresherOptions } from './token-refresher';

export { restoreSession } from './session-bootstrap';
export type { RestoreStatus, RestoreResult, RestoreOptions } from './session-bootstrap';

export { createTokenMapper } from './token-mapper';
export type { TokenFieldMap, FieldSource } from './token-mapper';

export { memoryStorageAdapter } from './storage/memory';
export { webStorageAdapter } from './storage/web-storage';
export type { WebStorageOptions, RefreshTokenStrategy } from './storage/web-storage';
export { syncTokenStoreWithStorage } from './storage/synced';

export type {
  AuthTokens,
  TokenSnapshot,
  TokenStorage,
  HttpPlugin,
  ApiResponse,
  NormalizedError,
} from './types';
export type { JwtAuthOptions } from './plugins/jwt-auth';
export type { ApiKeyAuthOptions } from './plugins/api-key-auth';

export interface HttpFactoryOptions {
  baseURL: string;
  timeout?: number;
  staticHeaders?: Record<string, string>;
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
}

export function createAppHttp(options: HttpFactoryOptions) {
  const plugins = [
    requestConfigPlugin({
      baseURL: options.baseURL,
      timeout: options.timeout ?? 15_000,
      headers: { 'Content-Type': 'application/json' },
    }),
    // 认证插件先注册 = 请求链上后执行 = 认证头最终生效
    ...(options.jwt ? [jwtAuthPlugin(options.jwt)] : []),
    ...(options.apiKey ? [apiKeyAuthPlugin(options.apiKey)] : []),
    ...(options.staticHeaders ? [headersPlugin(options.staticHeaders)] : []),
    responseUnwrapPlugin(),
    errorNormalizerPlugin(), // 最后注册 = 最后执行 = 兜底所有错误
  ];
  return createHttp({ plugins });
}
