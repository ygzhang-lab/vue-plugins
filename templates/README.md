# 插件开发模板

本目录存放新建插件包时使用的模板代码。模板**不发布**（均带 `"private": true`），但仍是 pnpm workspace 成员，因此 CI 与本地命令会照常对它们执行构建、类型检查和测试，避免模板随工具链演进腐坏。

- 新增插件包时：复制模板 → 改名 → 放入 `packages/`。
- 模板本身不写 changeset，也不出现在发布流程中。

## 两个模板

| 模板 | 适用场景 | 包含内容 |
| --- | --- | --- |
| [`vue-foo`](vue-foo)（完整版） | 需要组件、样式、组合式函数的插件 | 插件对象与安装选项、`provide/inject` 配置、`YgFoo` 组件（props/emits）、`useFoo()` 组合式函数、scoped 样式 + 独立 `style.css` 导出、单元测试 |
| [`vue-bar`](vue-bar)（最小版） | 只提供全局 API / 类型扩展的插件 | 插件对象与安装选项、`app.config.globalProperties.$bar`、`ComponentCustomProperties` 类型扩展、单元测试 |

两者共用同一套构建与类型配置（`vite.config.ts`、`tsconfig.json`、`tsconfig.build.json`），差别只在 `src/` 的内容。

## 从模板创建插件包

以新增 `@ygzhang-lab/vue-request` 为例：

```bash
# 1. 复制模板（Windows PowerShell 用 Copy-Item -Recurse）
cp -r templates/vue-foo packages/vue-request
```

```powershell
Copy-Item -Recurse templates\vue-foo packages\vue-request
```

2. 按下面的清单改名，然后回到 [维护管理使用说明](../docs/maintain.md) 完成 playground 接入与发布流程。

## 改名清单

以 `vue-request` / `RequestPlugin` / `YgRequest` / `useRequest` 为准：

- [ ] 目录名：`templates/vue-xxx` → `packages/vue-request`
- [ ] `package.json`：`name` → `@ygzhang-lab/vue-request`，`version` → `0.1.0`，重写 `description` / `keywords`，**删除 `private: true`**
- [ ] 插件对象 `name`：`ygzhang-lab:request`（范围固定、特性名与包名一致）
- [ ] 默认导出：`RequestPlugin`（文件 `src/plugin.ts` 中的常量与默认导出）
- [ ] 组件：`src/components/YgRequest.vue`，`app.component('YgRequest', ...)`，`defineOptions({ name: 'YgRequest' })`
- [ ] 组合式函数：`src/composables/useRequest.ts`，注入 key 使用 `Symbol('ygzhang-lab:request')`
- [ ] 指令（如有）：注册名 `yg-request`，模板中写 `v-yg-request`
- [ ] CSS 类名：`.yg-request`、`.yg-request__xxx`
- [ ] 全局类型扩展的注释与属性名：`$request`、`RequestApi`
- [ ] `README.md`：安装、用法、选项表、API 全部按新包重写
- [ ] 测试：`src/__tests__/vue-request.spec.ts`，并更新断言中的插件名与文案
- [ ] 接入：新建/复用 `playground/<feature>/` 测试应用（依赖、vite alias、tsconfig paths）与 `vitest.config.ts` alias
- [ ] 校验：`pnpm install && pnpm build && pnpm typecheck && pnpm test`

模板里的 `vue-foo` / `vue-bar` 只是可直接运行的示例，替换命名后即可成为正式插件包。
