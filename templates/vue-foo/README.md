# @ygzhang-lab/vue-foo

Vue 3 插件模板（完整版）：演示插件对象、`provide/inject` 配置、组件、组合式函数与独立样式表的标准组织方式。

> 本目录是模板，`package.json` 带 `private: true`，不会被发布。新增插件包时复制本目录到 `packages/<包名>` 并按 [templates/README.md](../README.md) 的改名清单替换命名；下方安装说明即复制后应保留的 README 形态。维护流程见 [维护管理使用说明](../../docs/maintain.md)。

## 安装

```bash
pnpm add @ygzhang-lab/vue-foo
```

`vue` 为 peer 依赖（>= 3.5），需由宿主应用提供。

## 使用

```ts
import FooPlugin from '@ygzhang-lab/vue-foo'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).use(FooPlugin, { prefix: 'App' }).mount('#app')
```

组件带有独立样式，需要显式引入（未引入时组件仍可渲染，但没有默认外观）：

```ts
import '@ygzhang-lab/vue-foo/style.css'
```

模板中使用：

```vue
<template>
  <YgFoo name="World" @greet="(message) => console.log(message)" />
</template>
```

## API

### `FooPlugin`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `prefix` | `string` | `'YgFoo'` | 文案前缀，通过 `provide` 注入给 `useFoo()` 与 `YgFoo` |

插件对象 `name` 为 `ygzhang-lab:foo`；全局注册组件 `YgFoo`。

### `<YgFoo />`

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 被问候的对象，默认 `'Vue'` |
| `@greet` | `(message: string) => void` | 点击按钮时抛出拼接好的文案 |

### `useFoo()`

读取插件配置（未安装插件时回退默认配置）：

```ts
import { useFoo } from '@ygzhang-lab/vue-foo'

const { prefix, greet } = useFoo()
greet('World') // => 'YgFoo: World'
```

返回 `{ prefix: ComputedRef<string>; greet: (name: string) => string }`。

### 其他导出

- `YgFoo`：组件本体，可局部注册。
- `FooPluginOptions`、`FooConfig`、`UseFooReturn`：类型。
- `fooConfigKey`：`InjectionKey`，自定义注入时可使用。

## 许可

[MIT](./LICENSE)
