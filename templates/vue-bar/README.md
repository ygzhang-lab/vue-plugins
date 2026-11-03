# @ygzhang-lab/vue-bar

Vue 3 插件模板（最小版）：演示安装选项、`app.config.globalProperties` 注入与 `ComponentCustomProperties` 类型扩展。

> 本目录是模板，`package.json` 带 `private: true`，不会被发布。新增插件包时复制本目录到 `packages/<包名>` 并按 [templates/README.md](../README.md) 的改名清单替换命名；下方安装说明即复制后应保留的 README 形态。

## 安装

```bash
pnpm add @ygzhang-lab/vue-bar
```

`vue` 为 peer 依赖（>= 3.5）。

## 使用

```ts
import BarPlugin from '@ygzhang-lab/vue-bar'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).use(BarPlugin, { greeting: 'hello' }).mount('#app')
```

安装后可在任意组件中通过 `this.$bar`（Options API）或 `getCurrentInstance()` 访问：

```vue
<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const bar = getCurrentInstance()?.proxy?.$bar
console.log(bar?.ping())
</script>

<template>
  <p>{{ $bar.ping() }}</p>
</template>
```

`$bar` 的类型通过 `declare module 'vue'` 扩展 `ComponentCustomProperties`，引入本包即可获得提示。

## API

### `BarPlugin`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `greeting` | `string` | `'pong'` | `ping()` 使用的问候语 |

插件对象 `name` 为 `ygzhang-lab:bar`。

### `$bar`

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `greeting` | `string` | 安装时传入的问候语 |
| `ping()` | `() => string` | 返回 `bar: <greeting>` |

### 类型

- `BarPluginOptions`：安装选项。
- `BarApi`：`$bar` 的形状。

## 许可

[MIT](./LICENSE)
