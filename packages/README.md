# packages 索引（现状）

本文回答：**现在 `packages/` 下每个包是什么、改一个需求该去哪个目录。**
它是"已存在代码"的索引；`docs/structure.md` §2 是目标态的分层树，两者说的不是一件事。
包内细节看该包的 `README.md` 与 `docs/`；这里只做定位，不复述包内约定。

| 包 | npm 名 | 现在做什么 | 目标态去向 |
|---|---|---|---|
| `agent` | `@evoharness/agent-core` | 唯一的 agent loop：`Agent`、`runAgentLoop`、transport 抽象、状态与附件 | `kernel/loop`（P3） |
| `coding-agent` | `@evoharness/coding-agent` | 现默认发行版：CLI、各 mode（TUI / RPC / print）、会话、上下文、内置工具、内置扩展、装配 | 拆向 `apps/evoharness-cli` + `surface-*` + `cap-*` + `kernel/*`（P1–P3，逐行见 `docs/structure.md` §9） |
| `ai` | `@evoharness/ai` | 模型调用：provider 目录、流式、工具调用协议、模型元数据 | `platform`，不迁移 |
| `chord` | `@evoharness/chord` | 插件宿主与契约、复制状态、JSON link 上的 RPC；`src/next/` 是 v2，切片计划在 `docs/next/slices.md` | `platform`，不迁移 |
| `durable` | `@evoharness/durable` | 持久化窄后端：会话、任务、文档；`src/harness/` 内有一条**不启用**的 loop | `platform`；scheduler / task-graph → `runtime-kit/schedule`（P2） |
| `env` | `@evoharness/env` | 远程执行：SSH 部署的 daemon（Rust）+ `ExecutionEnv` 客户端 | `platform`，不迁移 |
| `codemode` | `@evoharness/codemode` | 沙箱 JS 执行原语，唯一能力是调用注入的工具 | `platform`，被 `cap-codemode` 使用 |
| `mcp` | `@evoharness/mcp` | MCP 协议实现：protocol / transports / oauth / testing | `platform`；`cap-mcp` 只做"把服务器变成工具" |
| `tui` | `@evoharness/tui` | 终端渲染原语：差分渲染、editor、layout、keybindings | `platform`；应用壳是 `surface-tui` |
| `telemetry` | `@evoharness/telemetry` | 遥测契约与 typed schema，含内存 / 测试 adapter | `platform`，不迁移 |
| `evals` | `@evoharness/evals` | 评测夹具与运行器：`evals/*.eval.ts`、docker 沙箱、报告 | `platform` |

## `coding-agent` 内部（日常改动最常落到这里）

| 目录 | 放什么 | 目标态 |
|---|---|---|
| `src/cli/` | 参数解析、登录与配置、凭证打印、文件预处理 | `apps/evoharness-cli` |
| `src/modes/` | `interactive/`（TUI 编排与主循环）、`rpc/`、`print-mode.ts`、`json-event.ts` | `surface-tui` / `surface-rpc` |
| `src/core/` | 会话与上下文：`agent-session.ts`、`session-manager.ts`、`resource-loader.ts`、`system-prompt.ts`、`compaction/`、`tools/`、`extensions/`（扩展 API 的实现）、`export-html/` | `kernel/session`、`kernel/context`、`kernel/compaction`、`cap-fs` / `cap-shell` |
| `src/extensions/` | 内置能力：`mcp/`、`codemode/`、`tool-search/`、`llama/` | `cap-mcp`、`cap-codemode`、`cap-tool-search`、`cap-llama` |
| `src/bun/`、`src/experimental/`、`src/utils/` | 运行时适配（bun、sandbox env）、开发期源码解析 shim、通用工具 | 留在 app 侧 |

`src/core/agent-session.ts` 与 `src/modes/interactive/interactive-mode.ts` 都在 `scripts/file-size.baseline.json` 里，净增行会被 `check:file-size` 拦下；改法见根 `AGENTS.md` 的 Frozen files 与 `docs/structure.md` §1。

## 改一个需求去哪儿（现状版）

| 想改 | 现在的位置 |
|---|---|
| 模型 / provider 行为 | `packages/ai` |
| 会话、上下文拼装、压缩 | `packages/coding-agent/src/core` |
| TUI 渲染与键位 | `packages/tui`（原语）+ `packages/coding-agent/src/modes/interactive`（编排） |
| 一个内置工具（read / bash / edit / …） | `packages/coding-agent/src/core/tools` |
| 内置扩展的行为 | `packages/coding-agent/src/extensions/<name>` |
| 扩展作者能用的 API | `packages/coding-agent/src/core/extensions`，文档 `packages/coding-agent/docs/extensions.md` |
| agent loop、transport | `packages/agent` |
| 持久化格式与会话文件 | `packages/durable` + `packages/coding-agent/src/core/session-manager.ts` |
| 远程执行 | `packages/env`（daemon 在 `daemon/`） |

表里没有的改动，先按 `docs/structure.md` §4 的归属决策树判断它属于目标态的哪一层，再看 §7 该层是否已经允许出现；不该出现的层不要为了"结构完整"提前建目录。
