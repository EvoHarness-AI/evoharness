# 内核决策与偏离账本

记录本项目内核层的**重大决策**，以及仍然与上游 `pi` 不同的地方。规则见根目录 [`KERNEL.md`](../../KERNEL.md)。

> **本项目自 `0.0.2` 起独立演进，不再跟随上游 `pi`。**
> 因此本账本不记录"上游状态"，也不是同步清单。它只回答三件事：为什么这么定、影响面是什么、用什么测试兜住。用途是解释历史、防止后人把有意的决策"修回"上游的样子。

记账规则：

- 条目只增不删。决策被推翻时，在标题标 `superseded by D-xxx`，保留正文。
- **ID 稳定且不复用**：`D-001` 起，按加入顺序编号。引用某条决策时写 ID，不写标题。
- 每条必须写清：改了什么、为什么、影响面、用什么测试兜住。**没有测试兜住的 B 档改动不允许合并。**

## 总览

| ID | 档位 | 条目 | 位置 |
|---|---|---|---|
| D-001 | B | 移除 radius 网关 | `packages/ai`、`coding-agent` |
| D-002 | B | 品牌与包 scope 重命名 | 全仓 |
| D-003 | B | 环境变量 `PI_*` → `EVOHARNESS_*` | 全仓 |
| D-004 | B | 配置目录 `~/.pi` → `~/.evoharness` | `coding-agent/config.ts` |
| D-005 | B | 模型目录与版本检查端点指向 `evoharness.dev` | `coding-agent/core/remote-catalog-provider.ts`、`utils/version-check.ts` |
| D-006 | A | latex 符号表恢复 `pi` / `Pi` | `packages/tui/src/latex.ts` |
| D-007 | A | vendored marked 的 `\p{Pi}` 修复 | `coding-agent/src/core/export-html/vendor/marked.min.js` |
| D-008 | B | install telemetry 默认值恢复为开启 | `coding-agent/core/settings-defaults.ts` |
| D-009 | A | node 内建动态 import 加打包器豁免注释（auth context 与 env-api-keys 两处） | `packages/ai/src/auth/context.ts`、`packages/ai/src/env-api-keys.ts` |

---

## D-001 · B · 移除 radius 网关

**改了什么**：删除 radius OAuth 流程、provider、catalog 条目、登录选择器、bug 报告上传、`/share` 的 radius 目的地、登录后引导 MCP 的逻辑。

**为什么**：该网关与上游商业服务绑定，属于本 fork 不提供的渠道。

**影响面**：曾用 radius 登录的旧会话与凭据失去对应 provider；`/share` 只剩 gist；bug 报告只能导出 zip。

**兜底**：`packages/ai` 与 `coding-agent` 的相关测试同步删除；构建期校验每个 `importOAuthModule` 都有对应的 lazy bundle entry，缺一个就构建失败。

---

## D-002 · B · 品牌与包 scope 重命名

**改了什么**：`@earendil-works/pi-*` → `@evoharness/*`；用户可见文案、仓库 URL、文档命名空间；扩展虚拟模块的兼容别名 `@mariozechner/*` 一并删除。

**为什么**：fork 的品牌与发布命名空间独立。

**影响面**：任何 import 旧 scope 的第三方扩展立即失效，且没有过渡期别名（见 D-002 的已知代价，如需兼容层另立决策）。

**兜底**：`tsc --noEmit` + `check:ts-imports` + 全量测试；虚拟模块表在 `virtual-modules.ts` 里是显式的，不会静默回落。

---

## D-003 · B · 环境变量 `PI_*` → `EVOHARNESS_*`

**改了什么**：全部环境变量更名，包括 `PI_OFFLINE`、`PI_TELEMETRY`、`PI_TUI_*`、`PI_NAPI_*` 宏、`PI_ALLOW_LOCKFILE_CHANGE`（提交守卫）等；终端光标控制序列同步改为 `_evoharness:`。

**为什么**：与品牌一致，且避免用户在同一个 shell 里被两套变量互相干扰。

**影响面**：任何按旧变量名配置的脚本、CI secret、编辑器集成失效；旧发布工具链若仍读旧名会静默不生效。

**兜底**：全仓 `grep -rnI '\bPI_'` 归零；pre-commit 的 `scripts/check-lockfile-commit.mjs` 读新名并有测试覆盖。

---

## D-004 · B · 配置目录 `~/.pi` → `~/.evoharness`

**改了什么**：配置、凭据（`auth.json`）、会话、技能、扩展的用户目录改名为 `~/.evoharness/agent`。

**为什么**：与产品名一致，且避免与其它 harness 共用同一份凭据导致 refresh token 互相顶掉。

**影响面**：从 pi 迁移过来的用户升级后被视为全新安装（无凭据、无会话、无设置）。**目前没有自动迁移脚本**，这是已知缺口。

**兜底**：无（已知缺口）。补迁移脚本属于 A 档改动，加时应同时补一条回归测试与一条新决策记录。

---

## D-005 · B · 模型目录与版本检查端点

**改了什么**：默认目录基址、最新版本检查、installer API、schema `$id`、MCP 的 Client ID 元数据地址全部指向 `evoharness.dev`，而该域名尚未上线。

**为什么**：为将来的自有目录与发布站点预留接口，避免二次改名。

**影响面**：目录刷新必然失败；版本检查与安装引导无效；`evoharness update --models` 不起作用。

**兜底**：远程目录失败时回退到随包发布的模型数据（`--list-models` 在离线状态可用）；版本检查包在 `try/catch` 里，失败静默。启动时的 warning 是真实信号，不做掩盖。

---

## D-006 · A · latex 符号表恢复 `pi` / `Pi`

**改了什么**：`packages/tui/src/latex.ts` 的符号表恢复 `pi: "π"` 与 `Pi: "Π"`（曾被打成品牌名，导致所有 `\pi` 渲染成 `EvoHarness`）。

**为什么**：这是替换脚本误伤数学符号，属于缺陷修复。

**影响面**：无（修复）。

**兜底**：`packages/tui/test/latex.test.ts`（含矩阵、积分、欧拉恒等式等夹具）。

---

## D-007 · A · vendored marked 的 `\p{Pi}`

**改了什么**：`export-html/vendor/marked.min.js` 里的 Unicode 属性转义恢复为 `\p{Pi}`。

**为什么**：同一批替换把正则属性名改成了品牌名，运行时抛 `Invalid regular expression`，HTML 导出直接失败。

**影响面**：无（修复）。

**兜底**：`packages/coding-agent/test/export-html-cjk.test.ts`。

---

## D-008 · B · install telemetry 默认值

**改了什么**：`SETTINGS_DEFAULTS.enableInstallTelemetry` 从 `false` 恢复为 `true`。

**为什么**：该开关同时控制「安装版本 ping」与「请求 attribution 头」。默认关闭会让本项目静默关闭 attribution，且与既有测试矛盾。

**影响面**：默认向 provider 发送 attribution 头；若将来去掉该端点，这条要重新评估。

**兜底**：`packages/ai/test/identity.test.ts`、`packages/coding-agent/test/sdk-client-identity.test.ts`。

## D-009 · A · auth 的 node 内建动态 import 加打包器豁免注释

**改了什么**：`packages/ai` 两处变量形式的动态 import（`auth/context.ts` 的 `importNodeModule`、`env-api-keys.ts` 的 `dynamicImport`，后者还用字符串拼接躲静态分析）加上 `/* webpackIgnore: true */ /* turbopackIgnore: true */` 注释。

**为什么**：`@evoharness/web`（apps/evoharness-web，vendored Next.js 前端）的服务端 bundle 会把这个变量 import 编译成 webpack 动态上下文；上下文里没有 `node:` 内建，运行时每次路由加载都抛 `Cannot find module 'node:fs'`，后端 API 全部 500。上游 pi-web 以真实 npm 包安装 SDK（external，不进 bundle），从未触发；本仓 workspace 符号链接包被 Turbopack/webpack 一视同仁地打包，问题首次显形。

**影响面**：Node 侧语义零变化（原生动态 import 原样保留，Node 自行解析 `node:` 内建）；浏览器侧不执行该路径，`fileExists` 在浏览器由调用方的 try/catch 兜住。打包含义：webpack/Turbopack 不再为它建上下文，`node:fs/promises`、`node:os` 由运行时解析。

**兜底**：`apps/evoharness-web` 的 3030 个单测全量通过；浏览器冒烟覆盖 `/api/sessions`、`/api/home`、模型列表与调度器启动（`check:web` 之外的运行时验证）。

## D-010 · A · 根 TypeScript 7.0.2 → 6.0.3

**改了什么**：根 devDependencies 的 `typescript` 从 7.0.2 降到 6.0.3；`check-ts-relative-imports.mjs` 与 `check-runtime-deps.mjs` 两个守卫从 `typescript/unstable/ast` + tsgo transformer API（`API.updateSnapshot`）重写为 TS 稳定 API（`createSourceFile` / `createProgram` + 经典 is* 守卫）。

**为什么**：`@evoharness/web` 的 eslint 链（eslint-config-next 内嵌 typescript-eslint 8.72）peer 上限 `<6.1.0`，在 TS 7 下拒绝加载，4.8 万行移植代码从未被 lint。权衡过三条路：降级根 TS（本条）、npm overrides 强制 peer（实测无效）、eslint 永久豁免（守卫缺口）。上游桌面仓（pi-web）独立成仓就是为了避开这个冲突——它整仓只有 TS 5.9.3。

**影响面**：根 `tsc --noEmit` 在 TS 6 下零错误（实测）；两个守卫语义不变（同一批 AST 检查，换 API 实现）；packages 构建由 TS 6 编译（erasure 语义一致）。失去 TS 7 的构建加速与 `unstable/ast` API——若未来需要，回到 TS 7 的前提是 typescript-eslint 发布 TS 7 支持。

**兜底**：全链 `npm run check`（含重写后的两守卫与 app eslint）；`npm run test:web` 3030 用例；`build:offline` 以 TS 6 重编全部包。
