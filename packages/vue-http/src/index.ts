/**
 * @ygzhang-lab/vue-http 包入口：统一导出传输层、领域层、中间件插件与 Vue 集成。
 */
export { default, HttpPlugin, httpKey, type HttpPluginOptions } from './plugin';
export { useHttp } from './composables/useHttp';

export { createHttp } from './create-http';
export type { CreateHttpOptions } from './create-http';
export { createAppHttp } from './create-app-http';
export type { HttpFactoryOptions } from './create-app-http';

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
  HttpMiddleware,
  ApiResponse,
  NormalizedError,
} from './types';
export type { JwtAuthOptions } from './plugins/jwt-auth';
export type { ApiKeyAuthOptions } from './plugins/api-key-auth';

export { requestConfigPlugin } from './plugins/request-config';
export { headersPlugin } from './plugins/headers';
export { apiKeyAuthPlugin } from './plugins/api-key-auth';
export { jwtAuthPlugin } from './plugins/jwt-auth';
export { responseUnwrapPlugin } from './plugins/response-unwrap';
export { errorNormalizerPlugin } from './plugins/error-normalizer';
