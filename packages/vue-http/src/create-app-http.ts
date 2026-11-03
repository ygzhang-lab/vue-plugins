/**
 * createAppHttp —— 开箱装配：按固定顺序注册内置插件。
 *
 * 注册顺序：request-config → jwt-auth → api-key-auth → headers
 *   → response-unwrap → error-normalizer
 * 注意 axios 拦截器顺序：请求拦截器 LIFO（后注册先执行），响应拦截器 FIFO。
 *   请求链：headers → api-key-auth → jwt-auth（认证头最后写入，优先级最高）
 *   响应链：jwt-auth(401) → response-unwrap → error-normalizer
 * error-normalizer 必须最后注册，才能兜住 response-unwrap 抛出的业务错误。
 */
import { createHttp } from './create-http';
import { apiKeyAuthPlugin, type ApiKeyAuthOptions } from './plugins/api-key-auth';
import { errorNormalizerPlugin } from './plugins/error-normalizer';
import { headersPlugin } from './plugins/headers';
import { jwtAuthPlugin, type JwtAuthOptions } from './plugins/jwt-auth';
import { requestConfigPlugin } from './plugins/request-config';
import { responseUnwrapPlugin } from './plugins/response-unwrap';

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
