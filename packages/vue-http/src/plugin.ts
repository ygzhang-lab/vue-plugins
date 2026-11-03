/**
 * Vue 插件：把配置好的 AxiosInstance 挂到应用上。
 *
 * 安装后可通过两种方式访问：
 *   - 组合式：`const http = useHttp()`
 *   - 选项式：`this.$http`
 * 非 Vue 场景（纯 axios、SSR 工具函数）直接使用 `createAppHttp` / `createHttp`。
 */
import type { AxiosInstance } from 'axios';
import type { App, InjectionKey, Plugin } from 'vue';

import { createAppHttp, type HttpFactoryOptions } from './create-app-http';

declare module 'vue' {
  interface ComponentCustomProperties {
    /** 由 @ygzhang-lab/vue-http 注入，需先 app.use(HttpPlugin) */
    $http: AxiosInstance;
  }
}

/** 注入键：useHttp() 通过 app 级 provide 读取实例 */
export const httpKey: InjectionKey<AxiosInstance> = Symbol('ygzhang-lab:http');

export interface HttpPluginWithInstance {
  /** 直接复用已构建好的 axios 实例（可自定义 adapter / 拦截器） */
  instance: AxiosInstance;
  baseURL?: undefined;
}

export interface HttpPluginWithOptions extends HttpFactoryOptions {
  instance?: undefined;
}

export type HttpPluginOptions = HttpPluginWithInstance | HttpPluginWithOptions;

/**
 * 插件对象。name 带 scope 前缀，避免 Vue Devtools 中重名。
 * 重复 app.use 由 Vue 自身按插件对象去重。
 */
export const HttpPlugin: Plugin<[HttpPluginOptions]> & { name: string } = {
  name: 'ygzhang-lab:http',

  install(app: App, options: HttpPluginOptions) {
    const http = options.instance ? options.instance : createAppHttp(options);
    app.provide(httpKey, http);
    app.config.globalProperties.$http = http;
  },
};

export default HttpPlugin;
