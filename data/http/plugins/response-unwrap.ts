/**
 * 响应解包插件：把 ApiResponse<T>（{ code, message, data }）解成 T。
 *
 * 业务码不成功时抛出带 __business__ 标记的 Error，交给 error-normalizer 归一化；
 * 响应体没有 code 字段（文件流、第三方接口等）时原样返回。
 * 注意：运行时 response.data 已是业务数据，调用方泛型应写 T 而非 ApiResponse<T>。
 */
import type { HttpPlugin, ApiResponse } from '../types';

export function responseUnwrapPlugin(options?: {
  isSuccess?: (code: number) => boolean;
}): HttpPlugin {
  const isSuccess = options?.isSuccess ?? ((code: number) => code === 0 || code === 200);
  // 401 重放时同一个响应对象会再次经过本拦截器，必须保证只解包一次
  const unwrapped = new WeakSet<object>();
  return {
    name: 'response-unwrap',
    setup(instance) {
      instance.interceptors.response.use((response) => {
        if (unwrapped.has(response)) return response;
        const body = response.data as ApiResponse;
        if (body == null || typeof body !== 'object' || !('code' in body)) {
          unwrapped.add(response);
          return response;
        }
        if (!isSuccess(body.code)) {
          // 后端 message 可能缺失或不是字符串，避免把 [object Object] 透给 UI
          const message =
            typeof body.message === 'string' && body.message.trim()
              ? body.message
              : 'Business error';
          const err = new Error(message);
          Object.assign(err, { __business__: true, code: body.code, raw: body });
          throw err;
        }
        response.data = body.data;
        unwrapped.add(response);
        return response;
      });
    },
  };
}
