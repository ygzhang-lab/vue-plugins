# @ygzhang-lab/internal

仓库内部共享代码，**不发布到 npm**（`private: true`）。

- 通过 `workspace:*` 被各插件包引用，构建时被 Vite 内联进产物，消费者不会安装到它。
- `exports` 直接指向 `src/index.ts`，因此不需要构建步骤。
- 只放与具体插件无关的工具函数（环境判断、日志、文案拼装等）。

## 导出

| 导出 | 说明 |
| --- | --- |
| `LOG_PREFIX` | 统一日志前缀 `[ygzhang-lab]` |
| `isClient` | 是否处于浏览器环境（SSR 安全） |
| `warn(message, ...rest)` | 带统一前缀的 `console.warn` |
| `formatLabel(prefix, content)` | 拼装 `前缀: 内容` |
