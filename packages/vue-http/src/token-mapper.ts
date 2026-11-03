/**
 * TokenMapper —— 后端返回结构 → AuthTokens 的声明式字段映射。
 *
 * 字段来源支持：点路径（含数组下标，如 'data.tokens[0].value'）或函数。
 * accessToken 必填，缺失直接抛错；其余字段类型不符时降级为 undefined。
 * 与传输层无耦合，登录 / 刷新等任意接口都可复用。
 */
import type { AuthTokens } from './types';

export type FieldSource<T> = string | ((raw: T) => unknown);

export interface TokenFieldMap<T = unknown> {
  accessToken: FieldSource<T>;
  refreshToken?: FieldSource<T>;
  tokenType?: FieldSource<T>;
  expiresIn?: FieldSource<T>;
  expiresAt?: FieldSource<T>;
}

function getByPath(obj: unknown, path: string): unknown {
  // 同时支持 'a.b.c' 与 'a.list[0].c' 两种写法
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>((acc, key) => {
      if (acc == null) return undefined;
      if (Array.isArray(acc)) return acc[Number(key)];
      return (acc as Record<string, unknown>)[key];
    }, obj);
}

export function createTokenMapper<T = unknown>(map: TokenFieldMap<T>) {
  return (raw: T): AuthTokens => {
    const pick = (src?: FieldSource<T>): unknown =>
      src === undefined ? undefined : typeof src === 'function' ? src(raw) : getByPath(raw, src);

    const accessToken = pick(map.accessToken);
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('[token-mapper] accessToken is required');
    }

    const refreshToken = pick(map.refreshToken);
    const tokenType = pick(map.tokenType);
    const expiresIn = pick(map.expiresIn);
    const expiresAt = pick(map.expiresAt);

    return {
      accessToken,
      refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
      tokenType: typeof tokenType === 'string' ? tokenType : undefined,
      expiresIn: typeof expiresIn === 'number' ? expiresIn : undefined,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
    };
  };
}
