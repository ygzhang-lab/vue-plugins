import { describe, expect, it } from 'vitest';
import { AxiosError, CanceledError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { createHttp } from '../create-http';
import { responseUnwrapPlugin } from '../plugins/response-unwrap';
import { errorNormalizerPlugin } from '../plugins/error-normalizer';
import { okAdapter, throwAdapter, httpError } from './helpers';

function makeHttp(plugins: Parameters<typeof createHttp>[0]['plugins']) {
  return createHttp({ plugins });
}

describe('responseUnwrapPlugin', () => {
  it('把 ApiResponse<T> 解包为 T', async () => {
    const http = makeHttp([responseUnwrapPlugin()]);
    http.defaults.adapter = okAdapter({ code: 0, message: 'ok', data: { id: 1 } });

    const response = await http.get('/user');

    expect(response.data).toEqual({ id: 1 });
  });

  it('isSuccess 可自定义', async () => {
    const http = makeHttp([responseUnwrapPlugin({ isSuccess: (code) => code === 201 })]);
    http.defaults.adapter = okAdapter({ code: 201, message: 'created', data: 'done' });

    const response = await http.get('/create');

    expect(response.data).toBe('done');
  });

  it('业务码失败时抛出带标记的错误', async () => {
    const http = makeHttp([responseUnwrapPlugin()]);
    http.defaults.adapter = okAdapter({ code: 4001, message: '余额不足', data: null });

    const error = await http.get('/pay').then(
      () => null,
      (e: unknown) => e as Error & { __business__?: boolean; code?: number }
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('余额不足');
    expect(error?.__business__).toBe(true);
    expect(error?.code).toBe(4001);
  });

  it('业务错误 message 非法时使用兜底文案', async () => {
    const http = makeHttp([responseUnwrapPlugin(), errorNormalizerPlugin()]);
    http.defaults.adapter = okAdapter({ code: 4001, message: { text: 'bad' }, data: null });

    await expect(http.get('/pay')).rejects.toMatchObject({
      kind: 'business',
      code: 4001,
      message: 'Business error',
    });
  });

  it('无 code 字段的响应原样返回（文件流 / 第三方接口）', async () => {
    const body = { list: [1, 2, 3] };
    const http = makeHttp([responseUnwrapPlugin()]);
    http.defaults.adapter = okAdapter(body);

    const response = await http.get('/raw');

    expect(response.data).toBe(body);
  });

  it('空响应体原样返回', async () => {
    const http = makeHttp([responseUnwrapPlugin()]);
    http.defaults.adapter = okAdapter(null);

    await expect(http.get('/empty')).resolves.toMatchObject({ data: null });
  });
});

describe('errorNormalizerPlugin', () => {
  function makeErrorHttp(adapter: ReturnType<typeof throwAdapter>) {
    const http = makeHttp([errorNormalizerPlugin()]);
    http.defaults.adapter = adapter;
    return http;
  }

  it('网络错误 → network', async () => {
    const http = makeErrorHttp(
      throwAdapter((config) => new AxiosError('Network Error', 'ERR_NETWORK', config))
    );

    await expect(http.get('/x')).rejects.toMatchObject({
      kind: 'network',
      message: '网络异常，请检查连接',
    });
  });

  it('超时（ECONNABORTED / ETIMEDOUT）→ timeout', async () => {
    const aborted = makeErrorHttp(
      throwAdapter((config) => new AxiosError('timeout', 'ECONNABORTED', config))
    );
    await expect(aborted.get('/x')).rejects.toMatchObject({ kind: 'timeout' });

    const timedOut = makeErrorHttp(
      throwAdapter((config) => new AxiosError('timeout', 'ETIMEDOUT', config))
    );
    await expect(timedOut.get('/x')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('取消请求 → canceled', async () => {
    const http = makeErrorHttp(
      throwAdapter(() => new CanceledError('canceled'))
    );

    await expect(http.get('/x')).rejects.toMatchObject({
      kind: 'canceled',
      message: '请求已取消',
    });
  });

  it('HTTP 错误优先使用后端 message / msg', async () => {
    const withMessage = makeErrorHttp(
      throwAdapter((config) => httpError(config, 422, { message: '名称不能为空' }))
    );
    await expect(withMessage.get('/x')).rejects.toMatchObject({
      kind: 'http',
      status: 422,
      message: '名称不能为空',
    });

    const withMsg = makeErrorHttp(
      throwAdapter((config) => httpError(config, 500, { msg: '服务繁忙' }))
    );
    await expect(withMsg.get('/x')).rejects.toMatchObject({ message: '服务繁忙' });

    const withString = makeErrorHttp(
      throwAdapter((config) => httpError(config, 503, '维护中'))
    );
    await expect(withString.get('/x')).rejects.toMatchObject({ message: '维护中' });
  });

  it('无后端文案时回落为「请求失败（status）」', async () => {
    const http = makeErrorHttp(
      throwAdapter((config) => httpError(config, 500, { reason: 'unknown' }))
    );

    await expect(http.get('/x')).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      message: '请求失败（500）',
    });
  });

  it('业务错误被归一化为 business', async () => {
    const http = makeHttp([responseUnwrapPlugin(), errorNormalizerPlugin()]);
    http.defaults.adapter = okAdapter({ code: 4001, message: '余额不足', data: null });

    await expect(http.get('/pay')).rejects.toMatchObject({
      kind: 'business',
      code: 4001,
      message: '余额不足',
    });
  });

  it('非 axios 错误 → unknown', async () => {
    const http = makeErrorHttp(throwAdapter(() => new Error('boom')));

    await expect(http.get('/x')).rejects.toMatchObject({
      kind: 'unknown',
      message: 'boom',
    });
  });

  it('保留 status 供调用方做 403/401 跳转', async () => {
    const http = makeErrorHttp((config: InternalAxiosRequestConfig) =>
      throwAdapter(() => httpError(config, 403))(config)
    );

    await expect(http.get('/x')).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});
