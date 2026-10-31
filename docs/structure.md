# EvoHarness 项目结构（Structure）

> 本文档回答：**这段代码该放哪儿，为什么放那儿，什么时候才允许它出现。**
> 运行时怎么跑见 [`architecture.md`](./architecture.md)；内核能不能改见根目录 [`KERNEL.md`](../KERNEL.md)；与上游的差异见 [`kernel/divergence.md`](./kernel/divergence.md)。
>
> 结构是**目标态**。当前代码与目标的差距只出现在 §9 条件表，且该节在条件满足后逐行销账 —— 台账是过渡物，不是常驻文档。

范围约定：正文用中文描述职责；目录名、包名、文件路径、标识符一律英文。

---

## 1. 六条原则

1. **只有一条运行时**：`coding-agent`（经 `@evoharness/agent-core` 的 `Agent`，目录为 `packages/agent`）是唯一的 agent 运行时。多 agent、主动式、自我改进、持久化都挂在它的扩展机制上，不再长出第二个 loop。
2. **能力即包**：一个语义能力 = 一个 `cap-*` 包；一个用户能感知的功能 = 一个 `feature-*` 包。两者是不同的纵向切片，不是二选一（见 §3.3）。
3. **依赖单向**：`apps → surfaces → features → capabilities → runtime-kit → kernel → platform`。反向 import 即架构破损。
4. **能力自描述**：能力通过 `Capability` descriptor 声明自己，由装配层统一注册。禁止在 kernel 或表面里写 `if (name === "browser")`。
5. **入口不动、实现可搬**：`bin`、`exports`、CLI 参数、配置文件格式保持稳定；内部实现随时可搬，搬家不改变行为。
6. **文件与包都要小**：单文件 ≤ 1500 行；禁止纯转发包与桶文件（包公共入口的 `index.ts` 只做导出，不算桶文件）。拆分必须让人少犯错，否则维持原状并把理由写进注释。

---

## 2. 目录结构树

分层是**逻辑**的；物理上平铺在 `packages/` 下，用命名前缀区分：`cap-*` / `feature-*` / `surface-*` / `runtime-kit` / `kernel` / `capability`，其余为 platform。

**物理布局决策：平铺 + 前缀，不建分类目录。**

- 不建 `packages/capabilities/` 这类**逻辑嵌套**目录（把包塞进同名容器，只是多一层 `cd`）。
- 也不建 `packages/cap/`、`packages/feature/` 这类**分类目录**：前缀在 `ls` 时已经天然相邻，分组已经成立；再加一层要让 `workspaces`、`tsconfig` paths、`build` 链、bundle 的 metafile 匹配、install-lock、各包相对链接六处基础设施一起改，换来的只是视觉层级。分类目录真正带来机器价值的前提是"每层需要不同的 `tsconfig`/lint/发布策略"，我们还没到那一步 —— 反转条件见 §7。
- 后缀要求：单数、不带层级（`cap-browser` 而不是 `cap-browsers` 或 `cap-browser/tools`）。
- 人找东西靠这棵树与 `packages/README.md` 的分类索引（索引出现条件见 §7），不靠目录层级。

标记：无标记 = 已存在；`[P0]`–`[P3]` = 迁移阶段（见 §9）；`[未建]` = 尚未创建，第一次实现时按 §5 骨架出现，**不预先建空壳**。

```
evoharness/
├── apps/                                     可执行入口，只做装配
│   ├── evoharness-cli/                       [未建] 默认发行版，由 coding-agent 收敛而来
│   │   ├── src/main.ts                       进程入口：参数 → 注册 → 启动表面
│   │   ├── src/registry.ts                   唯一的注册清单（feature 与 cap 都在这列一行）
│   │   └── src/lifecycle.ts                  信号、退出码、崩溃上报接线
│   ├── evoharness-server/                    [未建] HTTP / RPC 服务入口
│   └── evoharness-desktop/                   [未建] 桌面壳
│
├── packages/
│   ├── capability/                           [P0] Capability 契约与注册表校验，无实现
│   ├── runtime-kit/                          [未建] 扩展侧共享服务：storage / schedule / lifecycle
│   │   ├── src/storage/                      命名空间、schema 迁移注册、后端 adapter
│   │   ├── src/schedule/                     定时与空闲触发（向 kernel 请求，不自己起 turn）
│   │   └── src/lifecycle/                    session start/shutdown、退出与崩溃钩子
│   ├── kernel/                               [P3] 与能力无关的运行时
│   │   ├── src/loop/  src/session/  src/context/
│   │   ├── src/registry/  src/policy/  src/events/  src/compaction/
│   │   └── src/hooks/                        扩展挂点：tools / events / sections
│   │
│   ├── cap-fs/                               [P2] 文件读写编辑、glob/grep
│   ├── cap-shell/                            [P2] 命令执行、后台进程、审批
│   ├── cap-mcp/                              [P1] MCP 工具暴露（协议实现留在 packages/mcp）
│   ├── cap-codemode/                         [P1] 沙箱 JS 执行
│   ├── cap-tool-search/                      [P2] 工具检索与按需暴露
│   ├── cap-llama/                            [P2] 本地 llama.cpp provider
│   ├── cap-lsp/                              [未建] 语言服务
│   ├── cap-browser/                          [未建] 浏览器工具（无 UI）
│   ├── cap-computer-use/                     [未建] 桌面工具（无 UI）
│   │
│   ├── feature-memory/                       [未建] 长期记忆
│   ├── feature-subagent/                     [未建] 子代理与并行
│   ├── feature-proactive/                    [未建] 主动式（无人值守发起）
│   ├── feature-approvals/                    [未建] 审批与能力上限
│   ├── feature-settings/                     [未建] 配置面板
│   ├── feature-workflow/                     [未建] 工作流编排
│   ├── feature-rsi/                          [未建] 自我改进（带评测闸门）
│   ├── feature-mcp/                          [未建] MCP 配置与登录 UI
│   ├── feature-browser/                      [未建] 浏览器面板
│   ├── feature-computer-use/                 [未建] 桌面面板与录屏
│   │
│   ├── surface-tui/                          [P2–P3] 终端应用壳（建在 packages/tui 之上）
│   ├── surface-rpc/                          [P3] JSON-RPC / ACP 协议
│   ├── surface-sdk/                          [P3] 内嵌 SDK 门面
│   │
│   ├── tui/                                  TUI 原语库：layout / editor / keybindings（platform 工具包）
│   ├── mcp/                                  MCP 协议实现：protocol / transports / oauth / testing
│   ├── ai/                                   LLM 调用、流式、工具调用协议、模型目录
│   ├── telemetry/                            遥测契约与 schema
│   ├── chord/                                插件宿主：contract / state / link / 热重载
│   ├── durable/                              持久化与远程执行（窄后端，见 §3.5）
│   ├── env/                                  SSH 远程执行与 daemon
│   ├── codemode/                             沙箱执行原语（被 cap-codemode 使用）
│   ├── evals/                                评测夹具
│   └── coding-agent/                         现默认发行版；内部布局见 §9 条件表（不在此复述现状）
│
├── docs/
│   ├── README.md  structure.md  architecture.md
│   ├── kernel/divergence.md                  内核决策与偏离账本（D-xxx）
│   ├── plan/parked.md                        现在不做的点子 + 叫醒条件（`check:parked` 守）
│   ├── capabilities.md                       [未建] 能力清单与状态
│   └── decisions/                            [未建] 架构决策记录
│
├── scripts/                                  仓库级工具：构建、检查、发布、生成
├── nix/                                      Nix 打包与 pin
├── .github/                                  CI、issue 模板、贡献者治理
└── .evoharness/                              本仓库自用的 skills / prompts / extensions
```

结构树里的 `[未建]` 不等于目录存在。**磁盘只放现在有人用的东西**；树回答"将来放哪儿"，`git ls-files` 回答"现在有什么"。

---

## 3. 每一层放什么

| 层 | 一句话职责 | 能否依赖具体能力/功能 |
|---|---|---|
| apps | 用户启动的那个进程 | 可以（装配层必须知道装了哪些） |
| surfaces | 把 agent 状态呈现或传输出去 | 不可以，只依赖 kernel 公共视图与 `tui` |
| features | 用户能感知的完整功能（UI + 契约 + 后端） | 可以依赖 `cap-*` 与 `runtime-kit` |
| capabilities | 给模型新动作或新事实，无 UI、无 wire 契约 | 不可以依赖另一个 capability，也不依赖 feature |
| runtime-kit | 扩展侧共享服务（存储/调度/生命周期） | 不可以依赖任何 cap / feature / surface |
| kernel | 被 ≥2 个上层依赖、且不含任何具体业务 | 不可以出现任何能力/UI/provider 名字 |
| platform | 与 agent 语义无关的技术底座 | 不可以认识能力 |

### 3.1 `apps/`

允许：读配置与参数、选择要注册的能力集合、启动 surface、进程级生命周期。
禁止：工具实现、提示词内容、权限判断。

`apps/.../registry.ts` 是**唯一**允许同时 import `cap-*` 与 `feature-*` 的地方。一个 app 应当能在十几行内读懂"它装了什么"。

### 3.2 `surfaces/`

- `surface-tui`：终端应用壳（快捷键、面板编排、主题、输入法），建在 `packages/tui` 之上。
- `surface-rpc`：JSON-RPC / ACP 等对外协议。
- `surface-sdk`：给第三方内嵌用的门面。

**渲染器依赖方向（关键）**：`tui` 是 platform 工具包，`surface-tui` 是应用壳。
`cap-*` 与 `feature-*` 的渲染代码**只准 import `packages/tui` 的原语**，不准 import `surface-tui` 的任何文件。否则 capability → surface 的向上依赖会立刻成立。

### 3.3 capability 与 feature 的分工（纵向切片，不是二选一）

| | `cap-<name>` | `feature-<name>` |
|---|---|---|
| 是什么 | agent 的一个纯语义能力 | 用户能感知的一个完整功能 |
| 含什么 | tools + hooks + doc + prompt section | `src/contract/*`（契约成员）+ `src/host/*`（后端，本质是一个 cap 的装配）+ `src/client/*`（面板/卡片/渲染器）+ 配置 |
| 不含什么 | 没有 UI，没有 wire 契约成员，没有独立面板 | 不向 capability registry 注册自己（它不是工具面） |
| 例子 | `cap-codemode`、`cap-tool-search`、`cap-mcp`、`cap-fs` | `feature-memory`、`feature-subagent`、`feature-proactive`、`feature-approvals`、`feature-workflow` |
| 何时拆出 feature | 不需要 UI 与契约时不拆 | 有面板、有跨进程状态、有用户可配置项时 |

**feature 内部三层，依赖单向**：

```
src/contract/   只依赖 chord 与纯类型；host 与 client 都可 import
src/host/       依赖 contract、runtime-kit、cap-*、kernel 公共类型
src/client/     依赖 contract、packages/tui 原语、surface 的注册点
```

规则：`client` 不得 import `host`；`host` 不得 import `client`；两者只通过 `contract` 见面。这样同一个 feature 可以"只装 host"（服务端/无头模式）或"host+client"（桌面/TUI 模式）。

**两处容易混淆的边界（明确写死）**：

1. MCP 的协议实现留在 `packages/mcp`（可被任何引擎、任何 feature 使用）；`cap-mcp` 只做"把 MCP 服务器变成工具"；登录与服务器配置面板属于 `feature-mcp`。
2. `feature-*` 的 host 半**不是**一个新的 capability：它装配工具，但不注册新的 `Capability` 条目。feature 暴露的是 commands / panels / contract，不是 tool 面。

### 3.4 `kernel/`

模块划分与职责见 [`architecture.md`](./architecture.md) §3（同一事实只有一处权威，这里不复述模块清单）。本节只写内核对外的挂点。

**扩展挂点（内核对外承诺的三个面）**：

| 挂点 | 现有形态 | 用途 |
|---|---|---|
| tools | `registerTool()` | 给模型新动作；工具自带 schema、执行、摘要 |
| events（hooks） | `on(event, handler)`：session / turn / agent / provider / context / compact / fork / tree 等 | 观察与介入 turn；返回值可改写上下文、阻止动作 |
| sections | 可变 prompt sections + 工具的 `snippet` / `guideline` | 给模型新事实或规则，替代改 `system-prompt.ts` |

**三个"现有挂点覆盖不到"的需求，属于必须在 KERNEL.md 里归档的改动**（归档见 [`KERNEL.md`](../KERNEL.md) §3.1，闸门见 §12）：

1. `turn_request`：扩展请求"开始一轮"（proactive / schedule / RSI 用）。现在只能被动响应 turn，没有主动发起。
2. `storage`：扩展持久化句柄（统一迁移与命名空间）。现在 `ExtensionContext` 只有只读的 `sessionManager`。
3. `schedule`：把定时注册给内核的空闲调度器，而不是每个能力各自 `setInterval`。

在这三条落地之前，"不动内核"只对 tools / events / sections 成立，对主动式与持久化**不成立**——文档不能承诺做不到的事。

### 3.5 `runtime-kit`（扩展侧共享服务，不是内核）

三件能力，被所有 cap / feature import，不各自实现：

| 模块 | 提供 | 不提供 |
|---|---|---|
| `storage` | 命名空间、schema 版本与迁移注册、后端 adapter（`durable` / sqlite / jsonl） | 会话与消息树（那是 kernel/session） |
| `schedule` | 一次性/周期任务注册、空闲判定、重试与背压 | 自己起 turn（必须经 `turn_request`） |
| `lifecycle` | session start/shutdown、进程退出、崩溃钩子、资源释放 | 进程模型本身 |

**三条硬边界**（违反即视为长出第二个 kernel）：

1. 不拥有 loop / session / context / policy 的任何语义。
2. 不 import 任何 `cap-*` / `feature-*` / `surface-*`；只准 import platform（`durable`、`env`）与 Node 内置。
3. 任何"让 agent 动起来"的动作都必须经 kernel 的 `turn_request`，**不得自己轮询模型、自己拼上下文、自己执行工具**。

`durable` 的位置：**窄后端**。它只被 `runtime-kit` 的 storage/schedule adapter 调用，或者被 `env` 调用；`cap-*` / `feature-*` **不得直接 import `@evoharness/durable`**。durable 的 `harness/` 不再作为第二条 loop 存在：它的状态机与调度器降级为 `runtime-kit` 的后端实现，agent 循环不被使用。

### 3.6 `platform`

`ai`（模型调用）、`telemetry`、`chord`（插件宿主与契约）、`durable`（窄后端）、`env`（远程执行）、`tui`（渲染原语）、`mcp`（协议）、`codemode`（沙箱原语）。

**`durable` 是 platform 里的例外**：它仍包含一条**未启用**的 agent 循环（`src/harness/`）。"不启用"是运行期约定，不是物理事实，所以靠守卫兜住：除 `runtime-kit` / `env` 外，任何包 import `durable/src/harness` 即失败（规则见 §10 的 `check:package-layers` 第③条）。

`tui` 与 `mcp` 之所以在 platform 而不是 surface/capability：它们是**可被多个上层复用的工具包**，本身不认识 agent 语义。

---

## 4. 归属决策树（新增代码前必答）

1. 用户能直接感知它吗（面板、卡片、命令、跨会话状态、可配置项）？ → `feature-<name>`
2. 它只是给模型一个**新动作**（可被调用、有副作用）？ → `cap-<name>` 的一个 tool
3. 它只是给模型**新事实或规则**（提示词、技能、记忆注入、文档检索）？ → `cap-<name>` 的 context fragment；**不许改 `system-prompt.ts`**
4. 它要在多个 cap/feature 之间共享基础设施（存储、定时、生命周期）？ → `runtime-kit`
5. 它改变**模型怎么被调用**（provider、transport、重试、路由）？ → `packages/ai`
6. 它改变**人怎么看到**（渲染原语、协议）？ → `packages/tui` / `surface-*`
7. 跨会话/跨进程的**权威状态**？ → kernel 的 session，持久化走 `runtime-kit/storage`
8. 以上都不是，且被 **≥2 个上层**依赖？ → `kernel`
9. 都不满足 → **先不要写代码**，回来把这一条补进决策树

---

## 5. 两种骨架

### 5.1 `cap-*`（语义能力，无 UI）

```
packages/cap-browser/
├── package.json            依赖 @evoharness/capability（+ 自身 SDK）；不得依赖 durable
├── src/capability.ts       descriptor：id / title / tools / context / permissions / settings
├── src/tools/              每个工具一个文件：schema + execute + summary
├── src/context/browser.md  注入模型的说明（替代改 system-prompt.ts）
└── test/                   契约测试 + 离线夹具
```

### 5.2 `feature-*`（用户可感知功能）

```
packages/feature-memory/
├── package.json            依赖 contract 层 + runtime-kit + 需要的 cap-*
├── src/contract/           只依赖 chord 与纯类型；host 与 client 的公共语言
├── src/host/               backend：注册工具、订阅事件、写入 section、调度任务
├── src/client/             面板 / 卡片 / 渲染器；只依赖 contract 与 tui 原语
├── src/settings.ts         本功能的配置 schema（合并进全局 settings）
└── test/                   host 侧契约测试；client 侧渲染快照
```

### 5.3 Definition of Done（分级）

| 类型 | 必须有 |
|---|---|
| 有副作用的动作型 cap（shell / browser / computer-use） | 六件：descriptor、权限声明、渲染（或声明无）、上下文片段（或声明无）、离线行为、测试 |
| 上下文型 / 编排型 cap（skills / memory 注入 / plan） | 三件：descriptor、离线行为、测试 |
| feature | host 契约测试 + client 渲染快照 + 无 UI 时能只装 host 的验证 |

分级不是为了少写测试，而是避免让"挂一个 /goal 命令"这类小功能背上与 shell 同重的仪式。

---

## 6. 命名与编码约定

| 对象 | 约定 | 例子 |
|---|---|---|
| 能力包 | `cap-<名词>`，单数 | `cap-browser`、`cap-computer-use` |
| 功能包 | `feature-<名词>` | `feature-memory`、`feature-proactive` |
| 表面包 / 工具库 | `surface-<名词>` / 领域名 | `surface-tui`、`tui`、`mcp` |
| 工具名 | `snake_case`，动词_对象 | `read_file`、`click_element` |
| 能力 id | `kebab-case` | `computer-use` |
| 事件名 | `<domain>.<thing>.<past-tense>` | `tool.call.completed` |
| 单文件 | ≤ 1500 行 | — |

---

## 7. 目录出现时机

条件未满足就建目录 = 提前背维护成本。

| 目录 | 出现条件 |
|---|---|
| `packages/capability` | 现在（P0）：契约与校验先于第一个 `cap-*` |
| `packages/runtime-kit` | 第二个 cap/feature 需要持久化，或第一个 feature 需要调度时；只做一处需要时先写在 feature 内，出现第二处再抽出 |
| `packages/cap-*` | 该能力第一次真的被实现时；不是为"结构完整" |
| `packages/feature-*` | 有 UI 或契约需求时；纯工具能力不要造 feature |
| `packages/kernel` | 第二个上层需要复用 loop/session，或 `coding-agent/core` 到达拆分阈值时 |
| `apps/evoharness-cli` | `coding-agent` 里只剩装配代码时 |
| `surfaces/surface-*` | 第二种界面或外部协议出现时；单一 TUI 阶段不拆 |
| `docs/decisions` | 第一条 ADR 真的要写时 |
| `docs/plan/` | 出现第一条"现在不做、将来要判断"的点子时（已发生）；没有条目的空文件应删除，不留占位 |
| `docs/capabilities.md` | 能力数量超过一屏、且需要对外呈现状态时 |
| `packages/README.md`（包索引，按层分组的表） | 包数超过一屏时（现在已接近），加包时加一行 |
| `packages/<layer>/`（分类目录，如 `packages/cap/`） | 满足任一条：① `cap-*` 与 `feature-*` 各超过 8–10 个（总包数 > 30）；② 需要按层配不同的 `tsconfig` / lint / 发布策略；③ 守卫必须靠路径而非包名判断层 |

---

## 8. 明确不建

| 不建 | 原因 |
|---|---|
| 第二个 agent loop | `durable/harness` 的 loop 不启用；主动式与多 agent 都从扩展侧驱动同一条 loop |
| `cap-*` 自带存储或自带定时器 | 会出现 N 套迁移与 N 个 timer；一律走 `runtime-kit` |
| `feature-*` 注册为 capability | feature 暴露 commands/panels/contract，不是新的工具面 |
| `cap-*` import `surface-tui` | 渲染只能用 `tui` 原语，否则能力向上依赖表面 |
| `cap-*` / `feature-*` 直接 import `durable` | 只有 `runtime-kit` 允许；durable 是窄后端 |
| `packages/capabilities/` 中间目录 | 逻辑分层不等于物理嵌套 |
| 每包独立 `tsconfig` / 构建配置 | 统一由根配置管理 |
| 目录/骨架生成器 | 生成器会固化错误形状；骨架是文档里的一段，复制比生成可控 |
| 空的 `cap-*` / `feature-*` 占位包 | 只有 `package.json` 的包是噪音 |
| `utils/` 这个桶名 | 按用途归位 |
| `cap-*` 之间的直接 import | 协作走 kernel 的 registry / event |

---

## 9. 迁移条件表（过渡节，逐行销账后删除）

阶段：**P0 立规则**（不改实现）→ **P1 搬独立能力** → **P2 拆工具** → **P3 收内核**。
每行都必须绑定它满足的 §7 条件；条件不满足时**不做**，而不是排期。

| 现状 | 去向 | 阶段 | 触发条件（满足才做） |
|---|---|---|---|
| `core/tools/*`（read/edit/write/glob/grep） | `cap-fs` | P2 | `capability` 契约与两个现有工具完成适配验证 |
| `core/tools/bash.ts` + `bash-executor.ts` | `cap-shell` + `runtime-kit`（后台进程） | P2 | 同上，且 `runtime-kit/schedule` 已就位 |
| `extensions/mcp/` | `cap-mcp`（协议留 `packages/mcp`） | P1 | `capability` 契约落地 |
| `extensions/codemode/` | `cap-codemode`（包保留） | P1 | 同上 |
| `extensions/tool-search/`、`extensions/llama/` | `cap-tool-search`、`cap-llama` | P2 | 同上 |
| `core/skills.ts` + `resource-loader.ts` 的 skill 部分 | `cap-skills` | P2 | `kernel/hooks` 的 sections 挂点可注册（现在只能改 `system-prompt.ts`） |
| `core/system-prompt.ts` 的能力段落 | `kernel/context` + 各 cap 的 fragment | P3 | 第二个 cap 需要注入片段时 |
| `core/agent-session*`、`event-bus.ts` | `kernel/loop`、`kernel/events` | P3 | `agent-core` 已被第二个上层复用，或 `agent-session.ts` 到达拆分阈值 |
| `core/compaction/` | `kernel/compaction` | P3 | 同上 |
| `core/model-*`、`provider-composer.ts` | `ai` + `kernel/policy` | P3 | 同上 |
| `modes/` | `surface-tui` + `apps/evoharness-cli` | P2–P3 | 出现第二种界面/协议（§7） |
| `cli/`、`rpc-entry.ts` | `apps/evoharness-cli` + `surface-rpc` | P3 | `coding-agent` 只剩装配代码（§7） |
| `agent-core` | `kernel/loop` | P3 | 与上一行同一条件 |
| `durable/src/harness/*` | loop 部分**不启用**；scheduler/task-graph → `runtime-kit/schedule` 后端 | P2 | `runtime-kit` 出现且有第二个调度消费者 |
| `durable/src/tools/*`（12 个文件，与 core/tools 重复） | `cap-fs` / `cap-shell` 的**持久侧 adapter** | P2 | `capability` 契约支持多 adapter |
| `packages/tui` | 保持 platform 工具包 | — | 不迁移；仅新增 `surface-tui` 应用壳 |
| `packages/mcp` | 保持协议包 | — | 不合并进 `cap-mcp` |

---

## 10. 守卫

守卫的**现状**是机器可读的，不要手写第二份：

```
node -e "console.log(Object.keys(require('./package.json').scripts).filter(k => k.startsWith('check')).join('\\n'))"
```

下表只记录"这条守卫拦什么语义"，不记录"建没建"。新增或删除守卫时不需要改本表。

| 守卫 | 拦什么 |
|---|---|
| `check:ts-imports` | 相对 import 缺扩展名、跨包越界 |
| `check:entry-graphs` | 入口依赖图膨胀 |
| `check:install-lock:coding-agent` | 安装锁与依赖不一致 |
| `check:pinned-deps` / `check:runtime-deps` | 依赖未钉版或运行时依赖未声明 |
| `check:browser-smoke` / `check:package-install` | 浏览器构建与打包安装的冒烟 |
| `scripts/check-lockfile-commit.mjs`（pre-commit 直接调用） | 锁文件变更需要显式开关 |
| `check:package-layers` | 层间反向依赖（已建）。同时锁三条现状规则：① `coding-agent` 只能依赖它现有的内部包；② `ai`/`telemetry`/`chord`/`mcp`/`tui`/`codemode` 不得依赖 `coding-agent`/`durable`/`env`；③ 除 `runtime-kit`/`env` 外任何包 import `durable/src/harness` 即失败 |
| `check:capability-boundaries` | 能力 descriptor 的注册与依赖。未建，`packages/capability` 落地时建 |
| `check:file-size` | 单文件 > 1500 行。未建，任一源文件接近阈值时建 |
| `check:doc-links` | `docs/` 死链。未建，`docs/` 手写文件超过 5 篇时建 |
| `check:parked` | `docs/plan/parked.md` 每条必须有 条件/复核/前提/判断依据 四行；触发条件成立或复核日期到点即红，逼一次决策（做 / 改条件 / 作废） |

未建守卫不是待办清单，是带触发条件的规则。**不写生成器**：守卫读事实（manifest、文件图），不读语义。

---

## 11. 三类变更的检查清单

**新增一个 cap**
- [ ] 按 §4 确认它是"新动作/新事实"，不是功能
- [ ] 按 §5.3 对应档位的 DoD
- [ ] 存储与定时走 `runtime-kit`，不新增自己的后端
- [ ] 权限写成 `permissions[]`，不在代码里擅自放行
- [ ] registry 只加一行

**新增一个 feature**
- [ ] `contract` / `host` / `client` 三层齐全，且依赖单向
- [ ] 只装 host 时功能仍可用（无头模式）
- [ ] client 只用 `tui` 原语与 surface 的注册点
- [ ] 不注册为 capability

**修改 kernel**
- [ ] 先按 `KERNEL.md` 归档（A 加扩展点 / B 改语义 / C 结构手术）
- [ ] 确认 ≥2 个上层需要它
- [ ] 不引入具体能力 / UI / provider 的名字
- [ ] 补契约测试；更新 `architecture.md` §3

---

## 12. 自治能力的闸门（主动式 / 自我改进）

"挂在扩展机制上"不等于"没有闸门"。三类自治能力必须有对应的限制，否则扩展会成为绕过 policy 的后门。

| 能力 | 必须的前提 | 现状 |
|---|---|---|
| 主动式（`feature-proactive`，含定时与事件触发源） | kernel 的 `turn_request` + `runtime-kit/schedule` 的触发源注册 + 审批上限（无人值守时只能拒绝）；定时与事件是它的内部 trigger（`src/host/triggers/`），**不各自建 feature** | 挂点与触发源都未建 |
| 自我改进（RSI） | 改动只允许落在扩展侧资产（prompt / skill / tool 描述）；**改完必须跑评测**（`evals`）且通过才生效；内核与 policy 不可自改 | 未建 |

独立 `feature-schedule` 的出现条件：它长出用户可感知的排程面（日历、时区、cron 编辑器、跨设备同步）；只是"每 N 分钟跑一次"时留在 `feature-proactive` 内部。

三条红线：

1. 任何自治动作都要带来源标记（`proactive` / `schedule` / `rsi`），事件与审计里可区分于用户输入。
2. 无人值守时没有"人工确认"通道，只能按预先声明的 `permissions[]` 放行或拒绝。
3. 自我改进不得修改 `kernel`、`policy`、本文件（`docs/structure.md`）——这三处只能由人改。

---

## 13. 参考

- 生态形态：pi 的扩展生态里，browser / computer-use / workflow / memory 以**独立 npm 包**分发，工具目录与执行器分层、再绑定到具体 harness；workflow 用子 agent 扇出或子进程编排，没有内建调度器。核对方式：在 `awesome-pi-coding-agent` 的 Extensions 区按 `browser` / `computer` / `workflow` 搜索。
- `pi-subagents-main` 的目录形态（`src/extension`、`src/runs/{foreground,background}`、`src/workflows`、`src/policy`、`src/tui`、`src/watchdog`，以及 `capability-ceiling` 与 workflow 子进程入口）可作为 `feature-*` 的现成参照。这些是本地参考仓，不引具体 npm 版本号以免过期。
