import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import type { NormalizedError } from "@/base/http";
import { createLogger, toLogError } from "./logger";

const startedAt = new WeakMap<InternalAxiosRequestConfig, number>();

function requestLabel(config: InternalAxiosRequestConfig): string {
  return `${(config.method ?? "get").toUpperCase()} ${config.url ?? ""}`;
}

function elapsed(config: InternalAxiosRequestConfig): number | undefined {
  const start = startedAt.get(config);
  return start === undefined ? undefined : Date.now() - start;
}

/**
 * 给业务 / 刷新实例挂上请求日志。
 *
 * 只记录 method、url、耗时和归一化错误，不记录请求体与 Authorization，
 * 避免手机号、验证码和 token 进入日志。
 */
export function attachHttpLogging(
  instance: AxiosInstance,
  label: string,
): void {
  const logger = createLogger(`http:${label}`);

  instance.interceptors.request.use(
    (config) => {
      startedAt.set(config, Date.now());
      logger.info(`→ ${requestLabel(config)}`, {
        baseURL: config.baseURL,
        paramKeys: config.params ? Object.keys(config.params) : undefined,
        skipAuth: config.skipAuth === true,
        timeout: config.timeout,
      });
      return config;
    },
    (error: unknown) => {
      logger.error("request interceptor failed", toLogError(error));
      return Promise.reject(error);
    },
  );

  instance.interceptors.response.use(
    (response) => {
      logger.info(`← ${response.status} ${requestLabel(response.config)}`, {
        ms: elapsed(response.config),
        hasData: response.data !== undefined && response.data !== null,
      });
      return response;
    },
    (error: unknown) => {
      const normalized = error as Partial<NormalizedError>;
      const config = (error as { config?: InternalAxiosRequestConfig }).config;
      logger.warn(`✕ ${config ? requestLabel(config) : label}`, {
        kind: normalized.kind,
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
        ms: config ? elapsed(config) : undefined,
      });
      return Promise.reject(error);
    },
  );
}
