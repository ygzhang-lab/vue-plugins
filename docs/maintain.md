# 维护管理使用说明

本文面向仓库维护者：如何在 `@ygzhang-lab/vue-plugins` 中新增插件包、日常开发调试、以及用 Changesets 只发布有变更的包。

- 仓库：<https://github.com/ygzhang-lab/vue-plugins>
- 包名与目录一一对应：`@ygzhang-lab/vue-request` ⇔ `packages/vue-request/`
- 模板放在 `templates/`，新增插件包时复制到 `packages/` 后改名
- 项目介绍、目录总览与命名约定见 [README](../README.md)

---

## 1. 仓库模型

| 位置 | 是否发布 | 说明 |
| --- | --- | --- |
| `packages/vue-*` | ✅ 发布 | 每个目录一个独立 npm 包，独立版本号、独立 CHANGELOG |
| `packages/internal` | ❌ `private: true` | 跨包共享代码，构建时内联进插件产物 |
| `templates/vue-*` | ❌ `private: true` | 插件开发模板，新增包时复制到 `packages/` 并改名；仍在 workspace 内，参与构建/类型检查/测试 |
| `playground/*` | ❌ `private: true` | 每个插件一个独立测试应用（Vite），通过 alias 直接引用对应包 `src/` |
| 根 `package.json` | ❌ `private: true` | 只承载仓库级脚本与开发依赖 |

workspace 由 `pnpm-workspace.yaml` 定义：`packages/*`、`templates/*`、`playground/*`。所有包共享一把 `pnpm-lock.yaml`。

包之间的依赖一律使用 `workspace:` 协议：

```json
{
  "dependencies": {
    "@ygzhang-lab/internal": "workspace:*"
  }
}
```

`pnpm publish` / `changeset publish` 时会把 `workspace:*` 改写成真实版本范围，消费者不会看到该协议。

> `packages/internal` 不产出 `dist`，`exports` 直接指向 `src/index.ts`：只有本仓库的构建过程会读取它，产物里已被打包内联。

---

## 2. 环境准备

```bash
corepack enable          # 使用 package.json 中固定的 pnpm@12.0.0
node -v                  # 需要 >= 22
pnpm install             # 安装全部 workspace 依赖
```

`package.json` 的 `engines.node` 与 `packageManager` 是唯一版本来源，不要在本地随意升级 pnpm 后提交 `pnpm-lock.yaml`（lockfile 版本会随之变化）。

### pnpm 12 配置要点

pnpm 10 起不再读取 `package.json` 里的 `pnpm` 字段，配置统一写在 `pnpm-workspace.yaml`：

```yaml
# 允许执行安装脚本的依赖（pnpm 12 字段名为 allowBuilds，值 true/false）
allowBuilds:
  esbuild: true
```

若安装时报 `ERR_PNPM_IGNORED_BUILDS`，说明有依赖需要执行 postinstall，把该依赖加入 `allowBuilds` 后重新 `pnpm install`。

`minimumReleaseAgeExclude` 由 pnpm 在安装较新版本包时自动写入，用于放行刚发布的版本，保留即可。

---

## 3. 日常开发流程

```bash
pnpm dev          # 启动全部测试应用（playground/*）
pnpm dev:http     # 只启动 vue-http 测试应用
pnpm dev:event    # 只启动 vue-event 测试应用
pnpm test         # 单元测试
pnpm typecheck    # vue-tsc 类型检查（包 + 模板 + 测试应用）
pnpm build        # 构建全部包
```

1. 在 `packages/vue-xxx/src`（或模板 `templates/vue-xxx/src`）下修改代码，对应测试应用通过 alias 直接读源码，保存即 HMR，无需先构建。
2. 在 `playground/<feature>/src/App.vue` 中补充使用示例，确认交互与样式符合预期。
3. 为新增能力补测试（`src/__tests__/*.spec.ts`，vitest + @vue/test-utils，jsdom 环境）。
4. 跑通 `pnpm build`、`pnpm typecheck`、`pnpm test` 后再提交。

只调试单个包时可以缩小范围：

```bash
pnpm --filter @ygzhang-lab/vue-foo build        # 某个包（模板名同理）
pnpm --filter @ygzhang-lab/vue-foo typecheck
pnpm vitest run templates/vue-foo                # 只跑某个包的测试
```

---

## 4. 新增插件包（SOP）

以新增请求插件 `@ygzhang-lab/vue-request` 为例。

### 4.1 从模板复制

模板说明与完整改名清单见 [templates/README.md](../templates/README.md)。

```bash
cp -r templates/vue-foo packages/vue-request       # 完整版：组件 + 组合式函数 + 样式
# 或 cp -r templates/vue-bar packages/vue-request  # 最小版：只要全局 API / 类型扩展
```

```powershell
Copy-Item -Recurse templates\vue-foo packages\vue-request
```

| 模板 | 命名骨架 |
| --- | --- |
| `templates/vue-foo` | `FooPlugin` / `YgFoo` / `useFoo` / `.yg-foo` |
| `templates/vue-bar` | `BarPlugin` / `$bar` / `BarApi` |

### 4.2 重命名清单

以 `vue-request` 为例，逐项替换：

| 位置 | 由（模板） | 改为 |
| --- | --- | --- |
| 目录 | `templates/vue-foo` | `packages/vue-request` |
| `package.json` `name` | `@ygzhang-lab/vue-foo` | `@ygzhang-lab/vue-request` |
| `package.json` `private` | `true` | **删除该字段**（否则永远不会发布） |
| `package.json` 元信息 | `version` / `description` / `keywords` | `0.1.0` / 新描述 / 新关键词 |
| 插件对象 `name` | `ygzhang-lab:foo` | `ygzhang-lab:request` |
| 默认导出 | `FooPlugin` | `RequestPlugin` |
| 组件 | `YgFoo` / `YgFoo.vue` | `YgRequest` / `YgRequest.vue` |
| 组合式函数 | `useFoo` / `useFoo.ts` | `useRequest` / `useRequest.ts` |
| 注入 key | `Symbol('ygzhang-lab:foo')` | `Symbol('ygzhang-lab:request')` |
| 指令（如有） | `yg-foo` / `v-yg-foo` | `yg-request` / `v-yg-request` |
| CSS 类名 | `.yg-foo`、`.yg-foo__xxx` | `.yg-request`、`.yg-request__xxx` |
| 全局属性（最小版） | `$bar` / `BarApi` | `$request` / `RequestApi` |
| 测试文件 | `__tests__/vue-foo.spec.ts` | `__tests__/vue-request.spec.ts`（同步断言里的插件名与文案） |
| `README.md` | 模板内容 | 按新包重写安装、用法、选项表、API |
| `LICENSE` | 随模板带一份 | 保留（npm 会自动打进 tarball） |

### 4.3 `package.json` 关键字段

以 [templates/vue-foo/package.json](../templates/vue-foo/package.json) 为准，复制后重点确认：

- `files: ["dist"]`：只发布产物，源码与配置不进 tarball。
- `exports` 同时给出 `types` / `import` / `require`，且 `types` 条件放在最前。
- 有样式的包保留 `"./style.css"` 导出与 `sideEffects`，否则 CSS 可能被宿主 tree-shake；无样式的包（如最小版）删除该导出。
- `vue` 只放 `peerDependencies` + `devDependencies`，绝不能进 `dependencies`，否则会出现多份 Vue 实例。
- `publishConfig.access = "public"`：scope 包默认私有，必须显式公开。

### 4.4 构建与类型配置

直接沿用模板中的 `vite.config.ts`、`tsconfig.json`、`tsconfig.build.json`，不要改动结构：

- `vite.config.ts`：库模式，`external: ['vue']`；`cssFileName: 'style'` 固定产出 `dist/style.css`；`output.exports: 'named'` 让 CJS 消费者通过 `.default` 取插件对象。无样式的包可删掉 `cssFileName`。
- `tsconfig.json`：`rootDir: src`，`include` 覆盖 `.ts` / `.d.ts` / `.vue`，排除 `__tests__`。
- `tsconfig.build.json`：`emitDeclarationOnly: true`，`.vue` 的声明必须由 `vue-tsc`（而不是 `tsc`）产出。
- 根 `tsconfig.base.json` 已开启 `strict`、`verbatimModuleSyntax`、`isolatedModules`，不要在新包里放宽。

### 4.5 源码入口与插件对象

`src/index.ts` 是唯一入口，统一导出插件对象、组件、组合式函数与类型：

```ts
export { default, FooPlugin, type FooPluginOptions } from './plugin'
export { useFoo } from './composables/useFoo'
export { default as YgFoo } from './components/YgFoo.vue'
```

插件对象遵循命名约定（`name` 带 scope 前缀）：

```ts
import type { App, Plugin } from 'vue'

export const RequestPlugin: Plugin<[RequestPluginOptions?]> & { name: string } = {
  name: 'ygzhang-lab:request',
  install(app: App, options: RequestPluginOptions = {}) {
    // app.provide / app.component / app.directive / globalProperties
  },
}

export default RequestPlugin
```

重复 `app.use` 由 Vue 自身按插件对象去重并给出警告，无需自行维护安装标记。

### 4.6 接入测试应用

每个插件一个独立测试应用：`playground/<feature>/`（例如 `playground/http`、`playground/event`），各自独立 `vite` 进程与端口。

1. 复制一个现有应用作为模板：`cp -r playground/event playground/request`，改 `package.json` 的 `name`（如 `playground-request`）、`description` 与依赖。
2. `playground/request/package.json` 的 `dependencies` 增加 `"@ygzhang-lab/vue-request": "workspace:*"`。
3. `playground/request/vite.config.ts` 的 `resolve.alias` 指向源码，并加入 `optimizeDeps.exclude`：

```ts
{ find: /^@ygzhang-lab\/vue-request$/, replacement: resolve('../../packages/vue-request/src/index.ts') },
```

4. `playground/request/tsconfig.json` 的 `compilerOptions.paths` 同步加上该包（TS 不读 vite alias，否则类型检查会解析到未构建的 `dist`）。
5. 改 `server.port`，并在根 `package.json` 增加 `dev:request` 脚本。
6. `playground/request/src/App.vue` 中补充使用示例。
7. 根 `vitest.config.ts` 的 `resolve.alias` 同步增加该包（测试直接跑源码）。
8. 执行 `pnpm install` 让 workspace 链接生效。

### 4.7 校验

```bash
pnpm install
pnpm --filter @ygzhang-lab/vue-request build
pnpm typecheck
pnpm test
```

---

## 5. 包的内容规范

| 项 | 约定 |
| --- | --- |
| 包名 / 目录 | `@ygzhang-lab/vue-<feature>` ⇔ `packages/vue-<feature>` |
| 插件对象 `name` | `ygzhang-lab:<feature>`，避免 Devtools 重名 |
| 默认导出 | `<Feature>Plugin` |
| 组合式函数 | `use<Feature>`，从入口导出 |
| 组件 | `Yg<Feature>`，组件名与 `defineOptions({ name })` 一致 |
| 指令 | `vg-<feature>`（注册名 `yg-<feature>`，模板中写 `v-yg-<feature>`） |
| CSS 类名 | `yg-<feature>`，BEM 后缀，如 `.yg-foo__prefix` |
| 类型导出 | 所有 public 类型从 `src/index.ts` 导出，便于 `import type` |
| 运行时依赖 | 需要随包安装的第三方库放 `dependencies`（如 `axios`），并在 Vite `external` 中排除；`vue` 永远只放 `peerDependencies` |
| 环境判断 | SSR 场景不要直接访问 `window`，可用 `@ygzhang-lab/internal` 的 `isClient` |
| 日志 | 使用 `@ygzhang-lab/internal` 的 `warn`，统一前缀 |

---

## 6. 构建与产物

`pnpm build` 等价于对 `packages/*`、`templates/*` 中的每个项目逐个执行（测试应用 `playground/*` 不在发布构建范围内）：

```bash
vite build && vue-tsc -p tsconfig.build.json
```

以 `templates/vue-foo` 为例，产出：

```
dist/
├── index.js        # ESM
├── index.cjs       # CJS（默认导出在 .default）
├── index.d.ts      # 类型入口
├── plugin.d.ts
├── composables/
│   └── useFoo.d.ts
├── components/
│   └── YgFoo.vue.d.ts
├── style.css
└── *.map
```

- JS/CSS 由 Vite 库模式打包，`vue` 外部化。
- `.d.ts` 由 `vue-tsc --emitDeclarationOnly` 生成，能正确产出 `.vue` 文件的声明；`tsconfig.build.json` 基于 `tsconfig.json`，因此测试目录被自动排除。
- 先 `build` 再发布：`types` 指向的 `dist/index.d.ts` 必须存在。

---

## 7. 测试

- 框架：Vitest 5 + @vue/test-utils 2 + jsdom，配置在根 `vitest.config.ts`。
- 位置：`packages/<包名>/src/__tests__/*.spec.ts`。
- alias 直接指向各包 `src/`，因此测试不需要先构建。
- 每个包至少覆盖：插件安装后的注册行为（组件/全局属性/provide）、核心组合式函数、关键 props/emits。

```bash
pnpm test                  # 全量
pnpm vitest run templates/vue-foo   # 单包
pnpm test:watch            # 监听
```

---

## 8. 版本管理与发布

### 8.1 核心原则

- **一个包一个版本号**，不做全仓库统一版本。
- **只发布有变更的包**：由 Changesets 根据 changeset 文件推导出需要 bump 的包；没有 changeset 的包版本不变、不会发布。
- 版本号变更与 CHANGELOG 由工具生成，不手改 `version` 字段（首次创建包除外）。

### 8.2 日常流程

```bash
# 1. 改动完成、本地验证通过后，生成 changeset
pnpm changeset
#    → 交互选择受影响的包、bump 类型（patch/minor/major）与一句摘要
#    → 生成 .changeset/<随机名>.md，随代码一起提交

# 2. 预览影响
pnpm changeset:status
```

changeset 文件示例：

```md
---
"@ygzhang-lab/vue-request": minor
---

新增 `prefix` 安装选项，支持自定义文案前缀
```

### 8.3 发布流程（推荐：CI 自动）

1. 改动合并到 `main` 后，`.github/workflows/release.yml` 运行 Changesets Action：
   若存在待发布 changeset，自动创建/更新 **Version Packages** PR（内含版本号提升与 CHANGELOG）。
2. Review 并合并该 PR：Action 在 `main` 上执行 `pnpm release`（`build` + `test` + `changeset publish`），只把版本有变化的包推送到 npm，并打 `@ygzhang-lab/vue-request@0.2.0` 形式的 git tag。
3. 仓库需要配置 secret `NPM_TOKEN`（npm Automation Token），以及 `contents: write` / `pull-requests: write` 权限（workflow 已声明）。

### 8.4 手动发布（应急）

```bash
git checkout main && git pull
pnpm install
pnpm version-packages     # 消费 changeset：改版本号、写 CHANGELOG、删除 changeset 文件
pnpm release              # build + test + changeset publish
git push --follow-tags
```

发布前请确认已登录 npm（`npm login`）或设置 `NPM_TOKEN` 环境变量。

### 8.5 bump 规则

| 场景 | 类型 | 示例 |
| --- | --- | --- |
| 修复缺陷、类型声明修正 | patch | `0.1.0 → 0.1.1` |
| 新增向后兼容的能力 | minor | `0.1.0 → 0.2.0` |
| 破坏性变更 | major | `0.2.0 → 1.0.0` |

- 尚未 `1.0.0` 的包，破坏性变更可以按 minor 处理，但必须在 CHANGELOG 摘要中写明。
- 包依赖了 `@ygzhang-lab/internal`（`workspace:*`）时，`internal` 的改动会内联进产物，需要给受影响的**插件包**分别写 changeset。
- `.changeset/config.json` 中 `updateInternalDependencies: "patch"`：内部包版本变化时，依赖它的包至少 patch 一级。

### 8.6 首次发布某个包

新包（如 `0.1.0`）在 npm 上尚不存在时，`changeset publish` 会直接发布当前版本，不需要先有 changeset；但更稳妥的做法是照常 `pnpm changeset`（选 minor）让发布链路与 CHANGELOG 一致。

### 8.7 回滚

```bash
npm unpublish @ygzhang-lab/vue-request@0.2.0   # 仅在刚发布、无下游依赖时使用
# 常规做法：发布一个新的 patch 版本修正问题
```

---

## 9. 发布前检查清单

- [ ] `pnpm build`、`pnpm typecheck`、`pnpm test` 全部通过
- [ ] 本次改动的包都有对应 changeset，摘要面向使用者（说明“做了什么”而非“改了哪行”）
- [ ] `package.json` 的 `files`、`exports`、`types` 与实际产物一致
- [ ] 有样式的包已导出 `./style.css` 且声明 `sideEffects`
- [ ] `vue` 只出现在 `peerDependencies`
- [ ] `README.md` 与导出 API 保持同步（安装、用法、选项表）
- [ ] `npm pack --dry-run` 检查 tarball 内容（只含 `dist`、`README`、`LICENSE`、`package.json`）
- [ ] `publishConfig.access` 为 `public`
- [ ] 仓库 secret `NPM_TOKEN` 有效（Automation Token，非交互式）

---

## 10. CI 工作流

| 文件 | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | PR / push 到 `main` | `pnpm install --frozen-lockfile` → `build` → `typecheck` → `test` |
| `.github/workflows/release.yml` | push 到 `main` | Changesets Action：维护 Version Packages PR，合并后自动发布到 npm |

两个 workflow 都通过 `pnpm/action-setup` 读取 `packageManager` 字段确定 pnpm 版本，`actions/setup-node` 固定 Node 22 并缓存 pnpm store。

---

## 11. 常见问题排查

**安装报 `ERR_PNPM_IGNORED_BUILDS`**
某些依赖需要执行 postinstall。把它们加入 `pnpm-workspace.yaml` 的 `allowBuilds`（`esbuild: true` 已在其中）。

**改了源码测试应用没反应**
检查对应 `playground/<feature>/vite.config.ts` 的 alias 是否指向该包 `src/index.ts`，以及 `optimizeDeps.exclude` 是否包含该包；类型检查报「找不到导出」时，确认 `playground/<feature>/tsconfig.json` 的 `paths` 也指向源码。

**发布后样式丢失**
宿主需要显式引入样式入口：`import '@ygzhang-lab/vue-request/style.css'`；确认包的 `exports["./style.css"]` 与 `dist/style.css` 一致。

**发布后类型报找不到 `.vue` 声明**
`types` 必须指向 `dist/index.d.ts`，且发布前已执行 `pnpm build`；`.vue` 声明由 `vue-tsc -p tsconfig.build.json` 产出，不要用普通 `tsc`。

**`app.use` 后出现 “Plugin has already been applied”**
同一个插件对象被安装了两次（例如多版本共存）。确认依赖只解析到一份 `@ygzhang-lab/vue-*`，`pnpm why @ygzhang-lab/vue-request` 排查。

**发布 403 / 404**
- `@ygzhang-lab` scope 在 `.npmrc` 中指向 `https://registry.npmjs.org/`，npmmirror 只读，不能用于发布。
- scope 包必须 `access: public`，否则默认私有。
- 确认 `NPM_TOKEN` 有效且具备该 scope 的发布权限。

**`changeset status` 提示没有变更**
尚未执行 `pnpm changeset`，或在交互中没有勾选任何包。

**私有包出现在待发布列表**
`packages/internal`、`templates/vue-*`、`playground/*` 已是 `private: true`，不应出现在待发布列表；若新增了私有包，记得同步加入 `.changeset/config.json` 的 `ignore`。

---

## 12. 维护约定

- 依赖升级：在根目录用 `pnpm up -r <pkg>@<version>` 统一升级，并同步各包 `devDependencies` 里的版本区间、`peerDependencies` 的 Vue 下限，以及 `templates/*` 中的版本。
- 新增/重命名包：同步更新 `README.md`、`vitest.config.ts` 以及对应测试应用 `playground/<feature>/` 的 alias、`tsconfig.paths` 与依赖。
- 模板同步：修改构建配置、`tsconfig`、插件写法时，先改 `templates/` 再同步到已有包；`templates/README.md` 的改名清单也要一起更新。
- 弃用包：先在该包 README 顶部与 CHANGELOG 标注弃用（`npm deprecate`），再在后续 major 版本移除。
- 文档：本文件记录流程与约定；面向使用者的 API 说明写在各自包的 `README.md`。
