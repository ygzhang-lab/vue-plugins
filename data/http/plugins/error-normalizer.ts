/**
 * 错误归一化插件：把所有失败统一成 NormalizedError。
 *
 * 必须最后注册——响应链上它排在最后，response-unwrap 抛出的业务错误
 * 才会落到这里的 rejected 分支。
 * 分类：business / canceled / timeout / network / http / unknown。
 */
import type { AxiosError } from 'axios';
import type { HttpPlugin, NormalizedError } from '../types';

export function errorNormalizerPlugin(): HttpPlugin {
  return {
    name: 'error-normalizer',
    setup(instance) {
      instance.interceptors.response.use(undefined, (e) => Promise.reject(normalize(e)));
    },
  };
}

const KINDS: ReadonlySet<string> = new Set([
  'network',
  'timeout',
  'http',
  'business',
  'canceled',
  'unknown',
]);

/** 401 重放产生的新请求会再次经过本拦截器，需保证归一化幂等 */
function isNormalized(error: unknown): error is NormalizedError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<NormalizedError>;
  return typeof candidate.message === 'string' && KINDS.has(candidate.kind as string);
}

function normalize(error: unknown): NormalizedError {
  if (isNormalized(error)) return error;

  if (
    error instanceof Error &&
    '__business__' in error &&
    (error as { __business__?: boolean }).__business__
  ) {
    const e = error as Error & { code?: number; raw?: unknown };
    return { kind: 'business', code: e.code, message: e.message, raw: e.raw ?? e };
  }

  const axiosError = error as AxiosError | undefined;
  if (!axiosError?.isAxiosError) {
    return {
      kind: 'unknown',
      message: error instanceof Error ? error.message : '未知错误',
      raw: error,
    };
  }

  if (axiosError.code === 'ERR_CANCELED') {
    return { kind: 'canceled', message: '请求已取消', raw: error };
  }
  if (
    axiosError.code === 'ECONNABORTED' ||
    axiosError.code === 'ETIMEDOUT' ||
    axiosError.message?.includes('timeout')
  ) {
    return { kind: 'timeout', message: '请求超时，请稍后重试', raw: error };
  }
  if (!axiosError.response) {
    return { kind: 'network', message: '网络异常，请检查连接', raw: error };
  }
  const { status, data } = axiosError.response;
  return {
    kind: 'http',
    status,
    message: pickServerMessage(data) ?? `请求失败（${status}）`,
    raw: error,
  };
}

/** 从后端错误响应体中提取可展示文案（兼容字符串 / { message } / { msg }） */
function pickServerMessage(data: unknown): string | undefined {
  if (typeof data === 'string') {
    const text = data.trim();
    return text || undefined;
  }
  if (data && typeof data === 'object') {
    const body = data as { message?: unknown; msg?: unknown };
    for (const value of [body.message, body.msg]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return undefined;
}
