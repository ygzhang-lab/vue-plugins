/**
 * 公共类型与契约。
 *
 * - 通过 declare module 'axios' 扩展请求级开关：skipAuth / skipApiKey
 * - TokenSnapshot 是持久化与跨 tab 同步的最小单位（version 单调递增）
 * - NormalizedError 是业务层唯一需要识别的错误形状
 */
import type { AxiosInstance, AxiosError } from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean;
    skipApiKey?: boolean;
    _retry?: boolean;
    _tokenVersion?: number;
  }
}

/** 后端登录/刷新接口返回的标准化 token 契约 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  /** 有效期，单位秒 */
  expiresIn?: number;
  /** 绝对过期时间（毫秒），优先级高于 expiresIn */
  expiresAt?: number;
}

/** TokenStore 状态快照（持久化单位） */
export interface TokenSnapshot {
  accessToken?: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  /** 每次变更自增，用于并发去重与跨 tab 冲突检测 */
  version: number;
}

/** 存储适配器：read 支持同步/异步，subscribe 可选 */
export interface TokenStorage {
  read(): TokenSnapshot | null | Promise<TokenSnapshot | null>;
  write(snapshot: TokenSnapshot | null): void | Promise<void>;
  subscribe?(listener: (snapshot: TokenSnapshot | null) => void): () => void;
}

export interface HttpMiddleware {
  name: string;
  setup(instance: AxiosInstance): void;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface NormalizedError {
  kind: 'network' | 'timeout' | 'http' | 'business' | 'canceled' | 'unknown';
  status?: number;
  code?: number;
  message: string;
  raw: unknown;
}

export type { AxiosError };
