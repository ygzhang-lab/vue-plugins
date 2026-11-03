import { describe, expect, it } from 'vitest';
import { createTokenMapper } from '../token-mapper';

describe('createTokenMapper', () => {
  it('支持点路径与数组下标', () => {
    const map = createTokenMapper({
      accessToken: 'data.access_token',
      refreshToken: 'data.tokens[0].value',
      tokenType: 'data.token_type',
      expiresIn: 'data.expires_in',
      expiresAt: 'data.expires_at',
    });

    expect(
      map({
        data: {
          access_token: 'a',
          tokens: [{ value: 'r' }],
          token_type: 'Bearer',
          expires_in: 7_200,
          expires_at: 1_700_000_000_000,
        },
      })
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 7_200,
      expiresAt: 1_700_000_000_000,
    });
  });

  it('支持函数取值', () => {
    const map = createTokenMapper<{ token: string; exp: number }>({
      accessToken: (raw) => raw.token,
      expiresAt: (raw) => raw.exp * 1_000,
    });

    expect(map({ token: 'a', exp: 123 })).toEqual({
      accessToken: 'a',
      refreshToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      expiresAt: 123_000,
    });
  });

  it('accessToken 缺失或非字符串时抛错', () => {
    const missing = createTokenMapper({ accessToken: 'data.access_token' });
    expect(() => missing({ data: {} })).toThrow('accessToken is required');
    expect(() => missing({ data: { access_token: 123 } })).toThrow('accessToken is required');
  });

  it('可选字段类型不符时降级为 undefined', () => {
    const map = createTokenMapper({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 't',
      expiresIn: 'e',
      expiresAt: 'x',
    });

    expect(
      map({
        a: 'token',
        r: 42,
        t: 1,
        e: '3600',
        x: '1700000000000',
      })
    ).toEqual({
      accessToken: 'token',
      refreshToken: undefined,
      tokenType: undefined,
      expiresIn: undefined,
      expiresAt: undefined,
    });
  });

  it('中间路径为空时安全返回 undefined', () => {
    const map = createTokenMapper({ accessToken: 'a', refreshToken: 'a.b.c' });
    expect(map({ a: 'token' })).toMatchObject({
      accessToken: 'token',
      refreshToken: undefined,
    });
  });
});
