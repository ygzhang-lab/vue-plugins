import { formatLabel } from '@ygzhang-lab/internal'
import { computed, inject, type ComputedRef, type InjectionKey, type Ref } from 'vue'

/** 插件安装时注入的配置 */
export interface FooConfig {
  /** 文案前缀，默认与组件名前缀一致 */
  prefix: string
}

/** 配置注入的 key：插件与组合式函数之间的约定 */
export const fooConfigKey: InjectionKey<Ref<FooConfig>> = Symbol('ygzhang-lab:foo')

export interface UseFooReturn {
  /** 当前生效的前缀 */
  prefix: ComputedRef<string>
  /** 按插件配置拼接文案 */
  greet: (name: string) => string
}

/**
 * 读取插件配置。
 * 未安装插件（或未 provide）时回退到默认配置，因此组件可以脱离插件单独使用。
 */
export function useFoo(): UseFooReturn {
  const config = inject(fooConfigKey, null)
  const prefix = computed(() => config?.value.prefix ?? 'YgFoo')

  return {
    prefix,
    greet: (name: string) => formatLabel(prefix.value, name),
  }
}
