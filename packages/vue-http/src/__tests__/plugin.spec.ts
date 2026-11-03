import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import DefaultExport, { createHttp, HttpPlugin, useHttp } from '../index';

/** 探针组件：读取 useHttp() 注入的实例 */
const Probe = defineComponent({
  setup() {
    const http = useHttp();
    return () => `${http.defaults.baseURL}|${http.defaults.timeout}`;
  },
});

describe('@ygzhang-lab/vue-http Vue 插件', () => {
  it('默认导出即插件对象，name 带 scope 前缀', () => {
    expect(DefaultExport).toBe(HttpPlugin);
    expect(HttpPlugin.name).toBe('ygzhang-lab:http');
  });

  it('按工厂选项创建实例并注入 useHttp() / $http', () => {
    const wrapper = mount(Probe, {
      global: {
        plugins: [[HttpPlugin, { baseURL: 'https://api.test', timeout: 1_234 }]],
      },
    });

    expect(wrapper.text()).toBe('https://api.test|1234');
    expect(wrapper.vm.$http.defaults.baseURL).toBe('https://api.test');
  });

  it('传入已有实例时直接复用，不再创建新实例', () => {
    const instance = createHttp({ plugins: [] });
    instance.defaults.baseURL = 'https://existing.test';

    const wrapper = mount(Probe, {
      global: { plugins: [[HttpPlugin, { instance }]] },
    });

    expect(wrapper.vm.$http).toBe(instance);
    expect(wrapper.text()).toBe('https://existing.test|0');
  });

  it('未安装插件时 useHttp() 抛出明确错误', () => {
    expect(() => mount(Probe)).toThrow('useHttp() 必须在 app.use(HttpPlugin) 之后调用');
  });
});
