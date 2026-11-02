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
| D-011 | A | Git Bash 从 PATH 上的 git 反推 | `coding-agent/src/utils/shell.ts`、`durable/src/env/node.ts` |
| D-012 | 决策 | 多智能体底座自研，不移植 `pi-subagents` | 未来的 `feature-subagent`；参考件在 `archive/subagents-port` |

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

---

## D-011 · A · Git Bash 从 PATH 上的 git 反推

**改了什么**：`packages/coding-agent/src/utils/shell.ts` 与 `packages/durable/src/env/node.ts` 的 Windows shell 解析（两份代码互相注释为 "keep in sync"），在「Git Bash 已知安装位置」与「PATH 上的 bash.exe」之间插入一步：用 `where git.exe` 定位 git，再在它的安装树里找 `bin\bash.exe` / `usr\bin\bash.exe`。找不到 git 时行为不变。

**为什么**：原实现的已知位置只有 `%ProgramFiles%\Git\bin\bash.exe` 与 `%ProgramFiles(x86)%\Git\bin\bash.exe` 两条。便携安装、按用户安装、装在非系统盘（本机即 `D:\DevelopTools\Git`）都不在其中，而 PATH 通常只带 `cmd\git.exe`、不带 `bin\`，于是 bash 工具直接抛 `No bash shell found`，唯一出路是手写 `shellPath`。硬编码清单永远会漏掉某个人的安装路径，从 git 自身反推则与安装位置无关。

**影响面**：仅影响「Windows + 未配置 shellPath + Git 不在默认目录」这一种原本直接报错的场景，现变为解析成功。查找顺序仍是优先 Git Bash，其次 PATH 上的 Cygwin / MSYS2 / WSL bash。报错信息现在列出反推出的候选，诊断不再靠猜。非 Windows 路径零改动。

**兜底**：`packages/coding-agent/test/shell-path-exists.test.ts` 的 `Git Bash beside the git on PATH`（四例：反推命中、优先于 PATH 上无关 bash、无 git 时回落、报错含反推候选）；`packages/durable/test/env-node.test.ts` 的 `Windows shell discovery beside git`（不传 `shellPath` 直接跑一次 POSIX 命令，仅当 git 在 PATH 上时运行）。

**为什么编号是 D-011 而不是 D-009**：`D-009` / `D-010` 已被归档分支 `archive/web-port` 占用并推到 origin（打包器豁免注释、根 TypeScript 降级）。账本规定 ID 稳定且不复用，该分支将来若 rebase 回主干会带着这两个 ID，所以这里跳过 009–010。

---

## D-012 · 决策 · 多智能体底座自研，不移植 `pi-subagents`

**改了什么**：本条不改任何代码，只定路线。`feature-subagent` 的运行时段（委派、并行、后台、监督、取消、恢复、预算）用本仓已有底座实现：`packages/chord` v2 的 child host 与 replicated state、`chord/context` 的显式取消、`packages/durable` 的持久化、`packages/agent` 的唯一 loop。已完成的移植分支 `feat/subagents-port`（PR #2，19 个提交、+363,745 行）**不合入 main**，归档为 `archive/subagents-port`，身份降为三样：参考实现、需求规格（unit 4235 例）、内容库（`agents/*.md` 七个角色、`prompts/`、`skills/`、编排范式文档）。

**为什么**：判据是「这块正确性归谁负责」，三条都指向上游形态不可持续。

1. **分层不兼容。** [`docs/structure.md`](../structure.md) §1 公理 1 要求多 agent 挂在唯一 loop 的扩展机制上，公理 3 规定 `features` 不得依赖 `product`，而 §2 目标树里 `feature-subagent` 明确标 `[未建]`。移植件依赖宿主全栈，为让它过守卫才在 `scripts/check-package-layers.mjs` 里加了一个目标树中不存在的 `extension` 层。它永远成不了 `feature-subagent`：要么保持外挂，要么造成 manifest 循环。
2. **正确性寄存在没有测试权的私有实现上。** 六处反射点各带 `SAFETY` 注释，全在 `archive/subagents-port` 的 `packages/subagents/src/` 下：`child-session.ts` 写 loader 的私有 `loaded` 字段、`tool-activation.ts` 与 `declaration-pinning.ts` 强转取 `buildSessionContext`、`fleet-status.ts` 结构探测 TUI 的 `focusedComponent`、`child-cache-retention.ts` 包装 `agent.streamFunction`。已付过账：宿主 1.2.0→1.4.0 的一次正常演进（同一文件双拼写加载两次）就让上游测试的 SAFETY 前提失效，排障花掉整个 wave 3。
3. **与 [`KERNEL.md`](../../KERNEL.md) §3.1 正面冲突。** 该条规定 `turn_request` / `storage` / `schedule` 三个扩展点未落地前，扩展不得自造 timer、上下文拼装、消息注入，否则会静默绕过 policy 与审计。移植件全部自造：`scheduled-runs.ts` 自带 `setTimeout` 调度器并直接起一轮，另有约 15 处 `setInterval` 轮询文件协议。

**影响面**：main 不接收 1041 文件的 vendored 快照，也不接收为它开的六处根配置豁免（`biome.json` 对该包关 lint、`check-ts-relative-imports` 豁免、`file-size.baseline.json` +51 行即 86 条超限基线、根 `tsconfig` 排除其测试、`extension` 层、`ci.yml` 的 subagents job）。`packages/subagents` 不在 main，其 env 前缀与协议常量的改名成果留在归档分支上。上游同步（移植计划里的 R12）不再是义务，改为按需取内容与测试。后续 `feature-subagent` 必须自带契约测试，且 §3.1 三个扩展点是它的前置工作而非可选项。

**兜底**：本条无代码，兜底 = 三条可复现实测，都是这一刀在归档分支上量出来的，会被 `feature-subagent` 直接继承：

1. 后台子代理是独立进程，靠宿主 `package.json` 的 `bin` 解析出可 spawn 的 JS 入口，且 Windows 分支只接受 `.mjs` / `.cjs` / `.js`；解析不到直接抛 `Could not resolve the evoharness CLI on Windows`。因此源码直载的宿主（未构建 `packages/coding-agent/dist/bundle/cli.js`）跑后台子代理必然失败，与有没有 API key 无关。
2. `packages/subagents/src/extension/tool-activation.ts` 的 `auto` 只在会话历史为空时 eager；一旦有历史，声明的只有 `subagents_enable`。所以「扩展已加载但模型说没有子代理工具」是设计行为，不是加载失败。
3. 移植件把「工具注册成功」当成 Gate 5 的通过标准，但注册不等于端到端跑通；真实 spawn 从未验证过。后续每一刀验收必须跑到模型真的收到子代理结果为止，不接受只断接口存在的空壳测试。

**引用它的正确方式**：写 `D-012`，不写标题。将来若路线翻转（真的把移植件合进 main），在本条标题标 `superseded by D-xxx` 并保留正文，新条目必须说明这六处豁免与 §3.1 的冲突如何处置。
