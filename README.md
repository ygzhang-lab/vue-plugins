# @ygzhang-lab/vue-plugins

一组独立的 Vue 3 插件包，用 pnpm Monorepo + Workspaces 统一管理：每个插件是一个可单独安装、独立版本号、独立语义化版本（SemVer）生命周期的 npm 包，发布时只发布真正有变更的包。

- 仓库：<https://github.com/ygzhang-lab/vue-plugins>
- 包名前缀：`@ygzhang-lab/vue-<feature>`，目录与包名严格对应，**看目录就知道包名**
- 版本与发布：Changesets + pnpm workspace，配合 GitHub Actions 自动发布

## 目录结构

```
.
├── pnpm-workspace.yaml        # workspace 定义 + pnpm 全局行为（如 allowBuilds）
├── package.json               # 只放仓库级脚本与开发依赖，不发布
├── .changeset/
│   └── config.json            # Changesets 配置（access: public，忽略 playground / internal / 模板）
├── packages/
│   ├── vue-http/              # @ygzhang-lab/vue-http（发布）：Axios 插件化 HTTP 客户端 + Vue 插件
│   ├── vue-event/             # @ygzhang-lab/vue-event（发布）：Vue 3 事件总线插件
│   └── internal/              # @ygzhang-lab/internal（private，共享代码，不发布）
├── templates/                 # 插件开发模板（private，不发布；复制到 packages/ 后改名）
│   ├── README.md              # 模板说明与改名清单
│   ├── vue-foo/               # 完整版：插件对象 + 组件 + 组合式函数 + 样式 + 测试
│   │   ├── package.json
│   │   ├── vite.config.ts     # 库模式构建配置
│   │   ├── tsconfig.json      # 类型检查（vue-tsc）
│   │   ├── tsconfig.build.json# 仅产出 .d.ts
│   │   └── src/
│   │       ├── index.ts       # 唯一入口
│   │       ├── plugin.ts      # 插件对象
│   │       ├── components/    # YgFoo 等组件
│   │       ├── composables/   # useFoo 等组合式函数
│   │       └── __tests__/
│   └── vue-bar/               # 最小版：插件对象 + 全局属性 + 类型扩展
├── playground/                # 独立测试应用（private，不发布），一个插件一个
│   ├── http/                  #   vue-http 测试页（mock adapter，http://localhost:5174）
│   └── event/                 #   vue-event 测试页（组件通信/自动清理/错误隔离，http://localhost:5175）
└── docs/
    └── maintain.md            # 维护管理使用说明（新增包、发版、发布清单、排错）
```

## 插件包与模板

| 包 / 模板 | 是否发布 | 说明 |
| --- | --- | --- |
| [`packages/vue-http`](packages/vue-http) | ✅ 发布 | Axios 插件化 HTTP 客户端：JWT / API Key 认证、无感刷新、Token 持久化与多 Tab 同步、统一错误归一化；默认导出 Vue 插件 `HttpPlugin` + `useHttp()` |
| [`packages/vue-event`](packages/vue-event) | ✅ 发布 | Vue 3 事件总线：类型安全的 `EventMap`、组件卸载自动清理（`useEvent` / `useEventOnce`）、多 App / SSR 隔离；默认导出 Vue 插件 `EventPlugin` |
| [`templates/vue-foo`](templates/vue-foo) | ❌ private | 完整模板：安装选项、`provide/inject` 配置、`YgFoo` 组件、`useFoo()`、独立 `style.css`、单元测试 |
| [`templates/vue-bar`](templates/vue-bar) | ❌ private | 最小模板：安装选项、`$bar` 全局属性、`ComponentCustomProperties` 类型扩展、单元测试 |
| [`packages/internal`](packages/internal) | ❌ private | 跨包共享代码，构建时内联，不发布 |

新增插件包时从 `templates/` 复制，模板本身仍是 workspace 成员，构建/类型检查/测试都会覆盖到它，避免模板腐坏。

```bash
cp -r templates/vue-foo packages/vue-request   # 1. 复制模板
# 2. 按 templates/README.md 的改名清单替换包名、插件名、组件名、CSS 类名
```

## 环境要求

- Node.js >= 22
- pnpm 12（`packageManager` 已固定为 `pnpm@12.0.0`，建议 `corepack enable` 后直接使用 `pnpm`）

## 快速开始

```bash
pnpm install        # 安装全部 workspace 依赖
pnpm dev            # 同时启动全部测试应用（http:5174 / event:5175）
pnpm dev:http       # 只启动 vue-http 测试应用
pnpm dev:event      # 只启动 vue-event 测试应用
pnpm build          # 构建所有插件包（ESM + CJS + .d.ts，含样式的包另出 style.css）
pnpm typecheck      # vue-tsc 类型检查（包、模板、测试应用）
pnpm test           # vitest（jsdom 环境）
```

测试应用直接 alias 到各包 `src/`，改动插件源码即时 HMR，无需先构建。

| 应用 | 地址 | 覆盖场景 |
| --- | --- | --- |
| `playground/http` | <http://localhost:5174> | 完整 HTTP 场景（Vant 4 + Pinia + mock 后端）：身份信息统一存 Pinia identity store；JWT / API Key / 两者共存、401 无感刷新重放、临期主动刷新、持久化与二次进入恢复（token 与 API Key 均可恢复）、跨 Tab 同步、错误归一化、22 条插件用例自测；阶段与结果同时输出到 console 和页面 |
| `playground/event` | <http://localhost:5175> | 兄弟组件通信、`useEvent` / `useEventOnce` 自动清理、handler 异常隔离（onError 上报） |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖（锁文件：`pnpm-lock.yaml`） |
| `pnpm dev` / `pnpm dev:http` / `pnpm dev:event` | 启动全部 / 单个测试应用 |
| `pnpm build` | 递归构建 `packages/*` 与 `templates/*` |
| `pnpm typecheck` | 递归执行 `vue-tsc --noEmit`（含 playground 应用） |
| `pnpm test` / `pnpm test:watch` | 运行 / 监听单元测试 |
| `pnpm changeset` | 为本次改动生成 changeset 文件 |
| `pnpm changeset:status` | 查看待发布版本变化 |
| `pnpm version-packages` | 消费 changeset，提升版本号并生成 CHANGELOG |
| `pnpm release` | 构建 + 测试 + `changeset publish`（只发布版本有变化的包） |

## 命名约定

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| Vue 3 功能插件包 | `@ygzhang-lab/vue-<feature>` | `@ygzhang-lab/vue-request` |
| 内部共享包 | `@ygzhang-lab/internal` | `@ygzhang-lab/internal` |
| 插件对象 `name` | `ygzhang-lab:<feature>` | `ygzhang-lab:foo` |
| 默认导出 | `<Feature>Plugin` | `export default FooPlugin` |
| 组合式函数 | `use<Feature>` | `useFoo()` |
| 组件 | `Yg<Feature>` | `app.component('YgFoo', Foo)` |
| 指令 | `v-yg-<feature>` | `app.directive('yg-foo', ...)` |
| CSS 类名 | `yg-<feature>`（BEM 后缀） | `.yg-foo`、`.yg-foo__prefix` |

插件对象 `name` 带 `ygzhang-lab:` 前缀，避免多个插件在 Vue Devtools 中重名。

## 发布

只发布有变更的包，由 Changesets 根据 changeset 文件决定版本提升与发布范围：

```bash
pnpm changeset           # 1. 描述本次改动（选择包与 bump 类型）
pnpm changeset:status    # 2. 预览将要发布的版本
pnpm version-packages    # 3. 提升版本 + 生成 CHANGELOG
pnpm release             # 4. 构建、测试并发布到 npm
```

推送到 `main` 后，`.github/workflows/release.yml` 会自动创建/更新 “Version Packages” PR，合并该 PR 即自动发布。完整流程、发布前检查清单与常见问题见 **[docs/maintain.md](docs/maintain.md)**。

## 许可

[MIT](LICENSE)
