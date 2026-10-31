# 前端移植 Spec — `apps/evoharness-web`

> 状态：**草案 v2，待所有者批准**。
> 流程：本 spec → 所有者批准 → 每 Phase 一页执行 spec（模板见 §5）→ 新子代理构建 → 两轮评审（判据见 §6）→ 修复 → 所有者验收 → 提交。
> 参照物：`D:\DEVELOP\Project-main\TypeScript\Pi-Desktop\pi-agent-desktop-main`（`@agegr/pi-web` 0.10.0，MIT，Copyright (c) 2026 agegr；本身是 `agegr/pi-web` 的 fork）。
> 本文定位：**迁移工作 spec（临时产物）**。落地后正文归位 `apps/evoharness-web/docs/`，本文件删除；架构决策另立 `docs/decisions/` ADR（`structure.md` §7 的「第一条 ADR」条件由本变更满足）。
> 数据口径：本文所有数字都是实测，取数命令写在 §9，不在正文里堆快照——文档会漂，命令不会。

---

## 0. 开工必读：靠参照物开发，会踩什么

### 0.1 三条结构性差异（本仓 ≠ 参照物，编译器查不出前两条）

| # | 差异 | 事实 | 后果 |
|---|---|---|---|
| **D1** | **只跑在 `dist` 上** | 参照物依赖 npm 上已发布的 `@earendil-works/pi-*`（编译好的 dist）；本仓 5 个包的 `exports` 全部指向 `dist/`，`coding-agent` 只导出 `.` 与 `./rpc-entry` | `next dev` 之前**必须先**跑根 `npm run build`；改 `packages/*/src` 必须重新 build，**没有热更新**；`@evoharness/mcp` 的 dist 缺失时 MCP 静默 `ok:false`（不报错，只是面板空） |
| **D2** | **SDK 单例约束** | `lib/pi-sdk-internals.ts` 按**文件路径 + file URL** 加载 SDK 私有模块，并校验 `mcpExtension.createMcpExtension === 根部 import 的那个`、`probe instanceof StdioTransport` | 任何"双副本"（workspace 软链未 realpath、`npm link`、路径别名指到 src）都会让 MCP 关掉。`importPiSdkInternals` 里已有 `realpathSync` 与同实体校验，**原样保留，不许"优化"** |
| **D3** | **工具链相反** | 参照物 eslint + `node --test`（`--experimental-strip-types`）+ Next 16/webpack + Tailwind v4；本仓 biome + vitest + 根 tsconfig + 一组自研守卫脚本 | 不要缝合。app 保留自己的工具链，主仓只经一个入口 `check:web` 收编（§3） |

**D1 的正确姿势（写进执行 spec 的禁止项）：**

```
改 UI        → 只动 apps/evoharness-web/**
改 SDK 契约  → 动 packages/**，然后回根目录 npm run build，再回 app 验证
禁止         → tsconfig paths / webpack alias / package.json exports 指到 packages/*/src
```

### 0.2 十条铁律（坑 → 后果 → 机器检查）

| # | 坑 | 后果 | 机器检查 |
|---|---|---|---|
| **R1** | SDK 私有模块按 dist 路径加载，`tsc` 完全看不见 | 跑到 MCP 才断，症状是"设置页空白" | 随迁 `pi-sdk-internals.test.mjs`；Phase 0 逐一验证 Annex F 的 7 个模块 / 16 个符号 |
| **R2** | 配置目录名 `.pi` → `.evoharness` | 读写到不存在的目录，静默建出一份影子状态 | 走 `CONFIG_DIR_NAME` 的自动生效；**硬编码 `.pi` 字面量的**逐个改（Annex B.3 清单）；随迁 `project-trust.test.mjs` 当安全网 |
| **R3** | 环境变量改名（Annex D） | 离线语义分裂、令牌失效、孤儿进程不被回收 | `scripts/check-web-names.mjs` 零命中；矩阵是**下限**，以守卫为准 |
| **R4** | 品牌与键名散布（Annex E） | 用户数据键混用两套命名，将来再改要挖第二遍 | 同上守卫 + 新增 `lib/app-keys.ts` 单点常量 + 一条钉住它的测试 |
| **R5** | 剪除不彻底 | 留着不报错，但**运行期真的会去请求别人的仓库** | `scripts/check-web-names.mjs` 零命中；`app/api/updates` 必须不存在 |
| **R6** | node-pty 是唯一原生模块 | 拖到打包才发现装不上 | Phase 0 就 `node -e "require('node-pty')"`；`.npmrc` 是 `save-exact`，`postinstall` 会跑 `bin/prepare-terminal.js`（只 macOS chmod）。Windows 下 ConPTY kill 不接受 POSIX 信号，`pty.kill()` 不带信号的写法**原样保留** |
| **R7** | 工具链隔离 | 根 biome/tsc/守卫红一片，然后被"顺手"改松 | 根侧改动只允许 §3 那几张表的行；`check:web` 是唯一入口 |
| **R8** | 依赖闭包必须整组本地解析 | `npm link` 单包必 404（兄弟包从未发布） | 进仓成 workspace 成员（根 `workspaces` 已含 `apps/*`），从根上消灭 |
| **R9** | Next 文件追踪（NFT）与 Windows 主目录 | NFT 会去枚举用户目录，跨盘/中文用户名下报错或卡死 | 保留 `lib/user-home.ts` 的 `userHome()`（**App 私有重定向变量**，core 不读它）与 `next.config.ts` 的 `outputFileTracingRoot`；这两处"看起来多余"，删了只在 Windows 实机上炸 |
| **R10** | 测试是安全网，不是行李 | 门禁变绿的最快路径是改测试 | 随迁测试**不得修改断言**；要改必须在评审里逐条说明理由（§6 红线） |

### 0.3 每个文件四选一，不许第五种"先放着"

| 判定 | 规则 | 处理 |
|---|---|---|
| **原样** | 纯 UI / 纯算法 / 对 SDK 的通用驱动，无品牌无壳耦合 | 复制后只过机械改名（Annex A/D/E） |
| **适配** | 引用改名点（env、路径、品牌常量、entry 类型、`.pi` 字面量） | 复制 + 按 Annex 表改，逐文件写进执行 spec 的清单 |
| **剪除** | updater / release 检查 / Homebrew / Tauri 客户端桥 / 上游同步工具 | 删除 + 清理引用点（Annex B.2） |
| **新写** | hostBridge 接口与其两个实现 | Phase 0 立接口 + web no-op；Phase 3 填 Electron 实现 |

**附加禁令（来自参照物自己的教训，`docs/ownership-boundaries.md`）：** 不许为了"整理"重写上游 JSX 结构、不许把逻辑跨文件搬家。参照物实测：cosmetic 改动 969 行、structural 1379 行，而 structural 的 80% 集中在三个文件——**这类改动 git 会干净合并，语义却是错的**。我们是快照 fork、不追上游，但同样的错在自己迭代里照样会发生：改样式就换 `className`，要复用就新增文件，不要动 JSX 树。

### 0.4 AI 子代理的七类典型翻车（对应门禁放在 §6）

1. **「找不到模块」→ 改 import 路径**（D1）。最高频，且"修复"方式会击穿分层。
2. **「门禁红了」→ 动门禁**：改 `scripts/file-size.baseline.json`、加 exclude、`--allow-grow`。看起来通过，实际把护栏拆了。
3. **「测试红了」→ 改测试**：408 个随迁测试里钉 SDK 契约的就那几个，改软之后断链会在 Phase 2 才炸。
4. **改名扫不干净**：改名点有 30 个 env、25+ 个存储键、10+ 个 `globalThis.__pi*`、7 个 session entry 类型，还有**拼在字符串里**的（User-Agent、临时目录前缀、`Symbol.for` 键）。靠眼睛永远漏，只能靠守卫。
5. **把 Tauri 洞留着**：`isTauriDesktop()` 是 9 个 `lib/desktop-*.ts` 的中心，剪除它必然连带 5 个文件断链（Annex B.2 的剪除陷阱）。不先立 `hostBridge`，UI 里会长出三套壳判断。
6. **自作聪明重构上游**（§0.3 禁令）。
7. **越过 Phase 做后续**：拿到总 spec 会顺手把 Phase 2/3 也做了，diff 无法评审。所以每 Phase 必须有独立执行 spec + 文件白名单。

---

## 1. 目标与范围

**为什么这条路 bug 最少：** App 与 `@evoharness/*` 是同一份代码的两种品牌，参照物又是"已发布、408 个测试、14 个 e2e"的成熟实现。所以 UI 与驱动层**最大化照抄**（bug 已被别人修完），新写的只有壳层和改名点，每处改名都有编译器或随迁测试兜底。

**范围（Phase 0–3，P4 另行批准）：**

- **Phase 0 落位**：复制 → 机械改名 → 立 hostBridge 接口 → 剪除 → `tsc` 清零 + 单测绿 + 根 `npm run build` 绿。
- **Phase 1 web 闭环**：浏览器可用（项目选择 + 会话列表 + 流式对话 + 模型 + 空闲回收）。
- **Phase 2 全量验收**：89 条路由按域过验 + 全量单测 + 非壳 e2e。
- **Phase 3 Electron 壳**：hostBridge 的 electron 实现 + main 进程。
- **Phase 4（可选）**：electron-builder / NSIS / 自更新，另写一页 spec。

**首版明确不做：** 自更新与签名、`demo/`（GitHub Pages 静态演示）、上游同步工具链（`fork-sync` / `measure-fork-drift` / `upstream-css-baseline`）、macOS 菜单深度打磨、**`packages/**` 的任何行为改动（本 spec 零核心改动）**。若构建中发现必须改 core：停下 → 记入 `docs/kernel/divergence.md` → 重新过批准。

---

## 2. 落点、命名与主仓关系

| 项 | 决定 | 理由 |
|---|---|---|
| 目录 | **`apps/evoharness-web/`** | 它首先是 web 应用，Electron 只是将来第二个宿主。叫 `desktop` 会让 4.9 万行 UI 住进一个名字说谎的目录，以后加 TUI/移动端宿主时命名体系就崩了 |
| 包名 | `@evoharness/web`（`private: true`） | 不进 npm 发布链，不进版本锁步 |
| 产品名 | `PRODUCT_NAME = "EvoHarness"`、`APP_DISTRIBUTION_NAME = "evoharness-desktop"`，集中在 `lib/branding.ts` | 品牌单点，随时可改；`APP_REPOSITORY*` / `APP_RELEASES_URL` 剪除 |
| bin | `evoharness-web` | |
| 默认端口 | 保留 30141 | 纯功能常量，改了只有噪音 |
| 版本 | 固定等于根 `package.json` 的 version，**不参与** `version:*` 锁步 | `sync-versions.js` 只扫 `packages/`；让它扫 apps 会把一个 private 应用拖进发布链。改为一条断言（`check:web` 内） |
| 数据目录 | 完全复用 core 的 `getAgentDir()`（`~/.evoharness/agent`） | 与 CLI 共享会话/模型/凭据/技能，无第二份状态 |
| 能力归属 | 定时任务、子代理、终端、Web Push、worktree、文件索引、MCP 管理/导入等**只在 app 侧存在**，不下降成 `cap-*` | 这棵树不是纯前端：它自己实现了一批产品能力（存储文件见 Annex B.5）。核心里没有对应物（实测：`scheduled-tasks` / `cron` / `web-push` / `node-pty` 在 `packages/**` 零命中；`subagent` 只出现在 `packages/coding-agent/examples/extensions/subagent/` 的示例里）。代价必须记进 `docs/kernel/divergence.md`：这些能力目前只有 web 宿主，TUI/CLI 没有。否则以后会有人以为内核已经具备 |
| 署名 | `apps/evoharness-web/README.md` 顶部注明 derived from `abcwyc/pi-agent-desktop` / `agegr/pi-web`（MIT 义务，与随迁 `LICENSE` 配对） | 合规；也是将来溯源的唯一线索 |
| 结构文档 | `structure.md` §2 树里把 `evoharness-desktop [未建]` 改为 `evoharness-web [建]`；§3.1 增一条 **vendored surface 例外** | `apps/` 原本的规矩是"只做装配"。这棵树是 MIT 上游 fork，必须显式豁免，否则规矩和现实互相说谎 |
| AGENTS | **不迁**参照物的 `AGENTS.md`/`CONTEXT.md`，改为根 `AGENTS.md` 增一节 | 两份 AGENTS 必然漂移；边界规则只写一处 |
| 文档 | 本 spec 的正文落 `apps/evoharness-web/docs/` | 包内文档跟包走；根 `docs/` 长期 ≤12 个手写文件 |

**vendored surface 例外条款（写进 `structure.md` §3.1，一字不改地照录）：**

> `apps/evoharness-web` 是 MIT 上游 fork 的移植体，不适用 §1 的 1500 行上限与"apps 只做装配"两条：它的单文件体积与装配密度由上游决定，改动原则是"最小偏离"而非"结构最优"。边界约束改为单向：它只能经 `@evoharness/*` 的**公共 exports** 使用内核；`packages/**` 不得 import 它；它不参与 `file-size` 棘轮。

---

## 3. 需主仓配合的改造（逐条，含脚本行号）

这张表是原草案漏掉的一整节，也是最容易让子代理卡住的地方。

| # | 文件 | 现状（实测） | 要做的改动 | 不改的后果 |
|---|---|---|---|---|
| 3.1 | `scripts/check-file-size.mjs` | `SOURCE_ROOTS = ["packages","apps","scripts"]`，`MAX_LINES=1500`；实测参照物有 **11 个文件超 1500 行**（AppShell 3288、ChatInput 3205、useAgentSession 3067、SessionSidebar 2932、rpc-manager 2917、ChatWindow 2463、ModelsConfig 2384、MessageView 2247、McpConfig 2143、locale-plugins 1952、FileViewer 1758） | 增加一个显式的 vendored 根豁免（`apps/evoharness-web`），并在脚本头部注释里写清理由与判定条件。**不要**把它们塞进 `file-size.baseline.json` | 塞进 baseline 后这 11 个文件"涨一行就红"。子代理只有两条错路：`--allow-grow` 或拆上游文件 |
| 3.2 | 根 `package.json` | `check` 链已有 12 个 `check:*` | 新增**两条**：`check:web`（静态：app 的 `tsc --noEmit` + `eslint` + 两个新守卫 + 版本断言）挂进 `check` 链；`test:web`（app 的 `node --test`）**独立成条，不进 check 链**——AGENTS.md 约定 `check` 不跑测试，且 pre-commit 会重跑整条 check，408 个单测会把每次提交拖到分钟级 | 不做隔离 → 每改一处 UI 都要过根 biome/vitest，且红的原因看不出在哪层 |
| 3.3 | `scripts/check-pinned-deps.mjs` | `collectPackageJsonFiles(".")` 全树递归 | 无需改脚本；**app 的全部依赖锁精确版本**（`^19.2.4`/`^4.2.2` 这类一律改死）。`.npmrc` 已是 `save-exact=true` | `npm run check` 立刻红 ~50 处 |
| 3.4 | 根 `package.json` `overrides` | 只有 `protobufjs` | 把参照物的 `overrides.katex` / `overrides.mammoth` **合并进根** | npm 只认根 overrides；忽略后 katex/mammoth 解析与参照物不一致，症状是"公式偶发崩"——最难查的一类 |
| 3.5 | `apps/evoharness-web/package.json` | 参照物脚本名是 `test` | 改名 `test:unit`（+`pretest:unit`），**不要**留 `test` | 根 `test` 是 `npm run test --workspaces --if-present`，会自动把它吞进根测试链（408 个文件 + `pretest: check:deps`），分钟级变十几分钟级 |
| 3.6 | `scripts/sync-versions.js` | `findPackageDirectories(process.argv[2] ?? "packages")` | 不改；另加断言（§2 版本行） | apps 版本被 `npm version --workspaces` bump 却无人校验，长期悄悄漂 |
| 3.7 | `biome.json` | 已有 `"!!apps"` | **不改** | — |
| 3.8 | 根 `tsconfig.json` | include 只覆盖 `packages/*`、`scripts/*.ts` | **不改**；根 `tsc --noEmit` 本来就不扫 apps | — |
| 3.9 | `scripts/check-doc-links.mjs` | 只扫根 `docs/**` 与根级 `*.md` | 不改；app 内文档靠 `check:web` 里的一条自检 | 文档腐烂无人守（可接受，写进 §9 欠账） |
| 3.10 | `scripts/check-package-layers.mjs`、`check-entry-graphs.mjs`、`check-runtime-deps.mjs` | 都只扫 `packages/` | **不改** | — |
| 3.11 | 新增 `scripts/check-web-boundary.mjs` | — | 两条静态断言：①`packages/**` 不 import `apps/**`；②`apps/evoharness-web` 不 import `packages/*/src/**`。**③（`packages/**` 零 diff）不进脚本**：本仓 cwd 多会话并发（AGENTS.md Git 节），别的会话在 `packages/` 的在途改动会让全局静态守卫误红；③改为评审 A 的逐条核对项（对照执行 spec 白名单核对提交文件清单） | §0.1 D1 的禁令没有机器检查就只是建议；但守卫本身不能成为多会话下的误报源 |
| 3.12 | 新增 `scripts/check-web-names.mjs` | — | 在 `apps/evoharness-web/{app,lib,components,hooks,bin,scripts}` 内 grep `abcwyc\|agegr\|earendil\|pi-web\|pi_web\|PI_[A-Z]`，白名单只放 `LICENSE`/`README` 的署名区 | 用 grep 做验收在 PowerShell 下语法不同，本机 grep 还是 ugrep（`parked.md` 已记过 `-e` 的坑）。跨平台守卫只能写成 mjs |

---

## 4. Phase 定义与 DoD

### Phase 0 — 落位（构建主体：机械改，不追求"能跑"）

1. 复制：`app/ components/ hooks/ lib/ bin/ public/ e2e/`、配置文件（`next.config.ts`、`postcss.config.mjs`、`tailwind.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`instrumentation.ts`、`instrumentation-node.ts`、`proxy.ts`、`LICENSE`）。**不含** `demo/ Casks/ src-tauri/ desktop/ .github/ AGENTS.md CONTEXT.md package-lock.json`。
2. `scripts/` 只迁**显式子集**（Annex B.4），其余全删。
3. `package.json` 重写：名称/依赖/脚本按 §2、Annex A.0、§3.3；`overrides` 上移到根。
4. 机械改名：Annex A.0（包名）、Annex D（env）、Annex E（品牌与键名）。
5. 立 `lib/host.ts`：`hostBridge` 接口 + `web` no-op 实现 + `isDesktopHost()`，替换全部 `isTauriDesktop()` 调用点（Annex G）。
6. 执行剪除（Annex B.2），清理引用点。
7. `lib/app-keys.ts`：把 localStorage / `Symbol.for` / session entry 类型 / `globalThis.__evoharness*` 收成单点常量，配一条钉住它的测试。
8. 主仓侧改动全部落地（§3 的 3.1 / 3.2 / 3.4 / 3.5 / 3.11 / 3.12）。

**DoD：**
- [ ] 根 `npm run build` 绿（D1 的前提：5 个包 + `@evoharness/mcp` 都产出 dist）
- [ ] `apps/evoharness-web` 内 `npx tsc --noEmit` 零错误
- [ ] `npm run test:unit` 全绿（含 R1/R2 的契约测试）
- [ ] Annex F 的 7 个模块 / 16 个符号逐一验证存在（写成一个测试，不是手敲）
- [ ] `node -e "require('node-pty')"` 通过（R6）
- [ ] `node scripts/check-web-names.mjs` 零命中；`node scripts/check-web-boundary.mjs` 零违规
- [ ] 根 `npm run check` 绿

### Phase 1 — web 闭环（第一个"能给人用"的产物）

- `npm run dev`（127.0.0.1:30141），浏览器完成：
  - [ ] 项目选择（`ProjectPicker` + `cwd/*` + `allowedRoots`）
  - [ ] 会话列表（`SessionSidebar` + `sessions/*` + 磁盘扫描缓存）
  - [ ] 流式对话（`agent/new` → `startRpcSession` → SSE `agent/[id]/events` → `useAgentSession`）
  - [ ] 模型选择与 thinking level
  - [ ] 会话空闲回收（`EVOHARNESS_WEB_IDLE_TIMEOUT_MS`，默认 10 分钟）
  - [ ] PTY 终端开一个 `cmd.exe` 与一个 `pwsh`
  - [ ] `EVOHARNESS_OFFLINE=1` 启动，全程无出网请求

**DoD：** 上述冒烟全过 + `test:unit` 仍全绿 + `check:web` 绿。

### Phase 2 — 全量验收（89 条路由逐域过）

按域分批（顺序即优先级）：sessions(12) → agent(7) → models/models-config(9) → skills(5) → mcp(4+import 全家) → auth(4) → scheduled-tasks(8) → worktrees/git(4) → subagents(3) → files/file-index/chat-attachments(12) → cwd(5) → terminal(4) → appearance/custom-css/artifacts(3) → push(2) → web-auth(4) → project-trust/provider-usage(2) → 其余(6)。

每批：路由手工过一遍 + 对应 `*.test.mjs` 绿 + i18n 三语键不缺。

**DoD：** `test:unit` 全绿；`npm run test:e2e` 的非壳子集过；`npm run build` 成功；`proxy.ts` 的鉴权在无 cookie 与有 cookie 两种状态下各验一次（这是唯一的安全面入口，不能只靠单测）。

### Phase 3 — Electron 壳（唯一新写层）

- `hostBridge` 的 `electron` 实现（preload `contextBridge`），`web` 实现保持降级。
- main 进程职责（全部有参照物 Rust 侧逻辑可译）：spawn 独立 Next server（standalone 产物 + `desktop-server.cjs` 启动器，保留其**孤儿看护 / dlopen ABI 守卫 / route-cache 自愈**三段逻辑）→ 就绪握手 `GET /api/desktop/identity`（204 + instance 头）→ 建窗（同源导航守卫、隐藏至 `app_ready`）→ 托盘（Windows 必有）→ 关闭藏托盘/退出开关。
- **保留** `/api/desktop/*` 路由与 `EVOHARNESS_DESKTOP_API_TOKEN` 令牌机制（壳无关的契约）；**删除**的只是 Tauri 客户端 invoke 层。

**DoD：** 桌面窗口全功能 = 浏览器全功能；`set_close_quits`、托盘、通知、原生对话框、剪贴板贴图逐项过。

---

## 5. 一页执行 spec 模板（每 Phase 开工前由本会话产出，所有者批准）

固定字段，缺一条不批：

```md
# Phase N 执行 spec
## 1. 范围（一句话）
## 2. 文件白名单（本次允许新增/修改的全部路径；白名单外一律不许动）
## 3. 禁止项（默认继承 §0.1 / §0.3 / §6 红线，本 Phase 追加的写这里）
## 4. 依赖前置（例如：Phase 0 起须先 npm run build）
## 5. 验收命令（可直接粘贴；跨平台；只写 §9 里登记过的命令）
## 6. 已知风险与本次的降级策略（例如：某路由本轮不做手工过验，写明为什么）
## 7. Carry-over（离开时仍未关的门，逐条带去向）
```

---

## 6. 两轮评审的判据（不写判据 = 评审会退化成"看起来没问题"）

**评审 A（对照型，本会话做）：** 拿执行 spec 逐条打勾 —— ①文件白名单逐文件核对，白名单外有没有多改；②DoD 每一条都现场复跑，不接受"上次跑过"；③禁止项零命中。

**评审 B（独立型，另一评审人做）：** 只看未提交 diff + §0 铁律，专找这四件事：门禁被削弱 / 上游被重构 / `packages/**` 被改 / 测试被改软。

**红线（任一命中即打回，不接受解释性修复）：**

1. 修改了随迁测试的断言（新增测试允许，改软的断言不允许）。**澄清**：测试文件里的机械改名（env 名、品牌字符串）不算改断言，必须与源码同批执行——否则 `check-web-names` 必红；红线锁的是 expect 的逻辑，不是字面量
2. 动了 `scripts/file-size.baseline.json`、给守卫加 exclude、用了 `--allow-grow`
3. `apps/evoharness-web` 里出现指向 `packages/*/src` 的 import/alias
4. `packages/**` 出现 diff（Phase 0/1）
5. 删除了本 Phase 文件清单之外的文件
6. 用"临时注释掉"绕过任何一条验收

---

## 7. 子代理边界

- 只读：`packages/**`、`scripts/**`（除 §3 登记的那几行）、根 `package.json`（除 §3.2/§3.4）。
- 只写：执行 spec 的文件白名单。
- 范围外发现一律写进执行 spec 的 Carry-over 与本文 §8，**不许顺手做**。
- 交付物：未提交的 diff + 一份自检记录（每条验收命令的原始输出，不许摘要）。

---

## 8. 扩展指南（这份结构对"以后大量开发"的承诺）

- **新增一个能力面板/路由**：`app/api/<域>/route.ts`（薄：校验 → 调 lib → `json-response`）+ `lib/<域>.ts`（逻辑，可单测）+ DTO 进 `lib/api-types.ts` + 组件进 `components/` + i18n 三语键 + `*.test.mjs`。照抄 `scheduled-tasks` 域的现有形状。
- **新增一个壳能力**：只改三处 —— `lib/host.ts` 的接口声明、Electron preload 实现、web 降级实现。**UI 永远不 import 壳 SDK**。
- **core 演进**：只对 5 个包名 + 一个 `@evoharness/mcp`；契约由随迁测试钉住，破坏性变更在 Phase 0 那批契约测试上直接红。
- **多项目**：应用以 cwd 为一等公民，新增"项目级"功能先看 `project-*` 与 `chat-workspace-policy` 的现有模式。
- **不许新增的耦合**：`packages/**` → `apps/**` 的反向依赖；app 内的跨域 import（`app/api/a` 直接 import `app/api/b` 的实现，应下沉到 `lib/`）。

---

## 9. 欠账表（全部关门，不留 TBD）

| 来源 | 事项 | 结论 / 去向 |
|---|---|---|
| v1 草案 §6 | `EVOHARNESS_HOME` 是否被 core 尊重 | **已结案：不。** core 只认 `EVOHARNESS_CODING_AGENT_DIR`（`packages/coding-agent/src/config.ts` 的 `ENV_AGENT_DIR` / `getAgentDir()`）。`EVOHARNESS_HOME` 是 **App 私有**的重定向变量，只服务于 `userHome()` 的 NFT 规避（R9）。不写进 core，也不写进交叉校验表 |
| v1 草案 §6 | 6 个 dist 路径逐一验证 | 升级为 Annex F：**7 个模块 / 16 个符号**，写成测试 |
| v1 草案 §6 | Windows 实机 PTY 冒烟 | Phase 1 DoD 已含 `cmd.exe` + `pwsh` |
| v1 草案 §6 | `list_apps_for_file` / `open_path_with`（macOS-only）是否需要 Windows 等价物 | **Phase 3 首版不做**，`openPath`/`revealItemInDir` 覆盖 Windows 主路径；需要时另开一条 |
| v1 草案 §6 | 参照物 `docs/agents/` 架构笔记与 7 篇 ADR | **迁 3 篇**（`ownership-boundaries.md`、`native-theme.md`、`scheduled-tasks-spec.md`）进 `apps/evoharness-web/docs/`；其余是上游同步语境，不迁 |
| 新增 | `check-doc-links` 不覆盖 app 内文档 | 接受；`check:web` 内加一条相对链接自检 |
| 新增 | 参照物 14 个 e2e 中与壳/菜单相关的 | Phase 2 只跑 `conversation-navigator / chat-prompt-anchor / composer-outbox / option-controls / appearance / settings-controls / streaming-markdown / session-delete` 八个；其余 Phase 3 再定 |
| 新增 | `apps/evoharness-web/docs/` 的 3 篇随迁文档与 §2 的 ADR | Phase 0 落地时一并提交 |
| v3 | §2 的两处 `structure.md` 编辑（§2 树 `evoharness-desktop`→`evoharness-web`、§3.1 vendored 例外条款）**暂缓**：另一会话正在大改 `structure.md`（六条→七条原则），多会话规矩下不碰在途文件；待其落地后补编辑，期间例外条款由本 spec、AGENTS.md app 节与 `check-file-size` 豁免注释代行 | structure.md 稳定后的第一个 docs 提交 |

**取数命令（文档不写快照，写命令）：**

```bash
# 路由条数
find apps/evoharness-web/app -name route.ts | wc -l
# 随迁测试条数
find apps/evoharness-web -name '*.test.mjs' -not -path '*/node_modules/*' | wc -l
# 超 1500 行的文件
node scripts/check-file-size.mjs
# 改名残留
node scripts/check-web-names.mjs
```

---

## Annex A — 包名映射（机械改名总表）

### A.0 映射

| 参照物 | 本仓（**实测**） | import 位点 |
|---|---|---|
| `@earendil-works/pi-coding-agent` | `@evoharness/coding-agent` | lib 60 文件 + 13 路由 + 3 组件（type-only） |
| `@earendil-works/pi-agent-core` | **`@evoharness/agent-core`** | lib 8 文件 + 1 路由 |
| `@earendil-works/pi-ai` | `@evoharness/ai` | lib 8 文件 + 2 路由 |
| `@earendil-works/pi-ai/providers/all` | `@evoharness/ai/providers/all` | lib 2 文件 |
| `@earendil-works/pi-tui` | `@evoharness/tui` | lib 1 文件 |
| `@earendil-works/pi-mcp` | `@evoharness/mcp` | **无静态 import**；由 `pi-sdk-internals.ts` 用 `findPackageJSON` 从 SDK 的 `runtime.js` 反查包根入口 |

> 原草案把第二行写成 `@evoharness/agent`，**不存在**。`packages/agent/package.json` 的 `name` 是 `@evoharness/agent-core`，根 `tsconfig.json` 的 paths 键也是 `@evoharness/agent-core`。

同步要改：`scripts/pi-packages.mjs` 的 `SCOPE`、`next.config.ts` 的 `serverExternalPackages` 清单、`lib/mcp-import-cli.ts` 里的 CLI 名映射。

### A.1 89 条路由处置

| 域（条数） | 处置 | 说明 |
|---|---|---|
| sessions (12) | 原样 | CRUD/搜索/导出/fork/auto-name；`SessionManager` 直接读写 |
| agent (7) | 原样 | 流式核心（SSE 心跳/背压/150ms 合并），Phase 1 主菜 |
| models + models-config (9) | 适配 | `models.dev` 代理、`models.json`、`completeSimple` 走 `@evoharness/ai/compat` |
| scheduled-tasks (8) | 适配 | 租约单例调度器 + entry 类型改名（Annex E）；默认读 `EVOHARNESS_WEB_DISABLE_SCHEDULER` |
| skills (5) | 原样 | 走 SDK `DefaultResourceLoader`；`SKILLS_API_URL` 保留 |
| mcp (4) + `lib/mcp-*` | 适配 | **R1/D2 主战场**：Annex F 全量验证；`PI_WEB_DISABLE_MCP`/`PI_WEB_MCP_IDLE_MS` 改名 |
| auth (4) | 原样 | OAuth + API key，凭据走 `getAgentDir()/auth.json` |
| worktrees/git (4) | 原样 | `execFile git`，`LC_ALL=C`、`GIT_TERMINAL_PROMPT=0` 保留 |
| subagents (3) | 原样 | profile CRUD + run 控制 |
| files / file-index / chat-* (12) | 原样 | allowed-roots 安全面原样保留 |
| cwd (5) | 适配 | `default-cwd` 的 `~/pi-cwd/` 草稿目录名改 `~/evoharness-cwd/` |
| terminal (4) | 原样 | node-pty；R6 提前实测 |
| desktop (4) | **保留 + 适配** | 令牌/instance 契约是壳无关的，Electron 沿用；env 改 `EVOHARNESS_DESKTOP_*` |
| appearance / custom-css / artifacts (3) | 适配 | custom.css 落 `getAgentDir()/desktop/`（自动跟随 R2） |
| push (2) | 原样 | VAPID + Web Push，密钥存 agentDir |
| web-auth (4) | 适配 | cookie 名 / realm 改名（Annex E）；密码模式保留 |
| updates (1) | **剪除** | 指向别人仓库的周更检查 |
| project-trust / provider-usage (2) | 适配 | trust 条目清单随 R2 |

**安全面两个必检文件（不属于路由但决定能不能上线）：** `proxy.ts`（Next 16 的 proxy = 中间件，匹配 `/api/:path*`）与 `instrumentation.ts` / `instrumentation-node.ts`（启动 RPC manager、调度器）。Phase 0 必须原样带过来，Phase 2 手工验鉴权。

### A.2 页面与组件

单路由 SPA：`app/page.tsx` → `AppShell`。大体量文件（行数见 §9 命令）：`AppShell`、`ChatInput`、`SessionSidebar`、`ChatWindow`、`MessageView`、`McpConfig`、`ModelsConfig`、`FileViewer`、`FileExplorer`、`hooks/useAgentSession`、`lib/rpc-manager`、`lib/i18n/locale-plugins`。**全部原样**；仅 `components/desktop/*` 由 hostBridge 重写，`AppUpdatesSection` / `UpdateReminder` 随 updates 剪除。i18n 三语（en / zh-CN / zh-TW）原样，键名无品牌耦合。

---

## Annex B — lib 层处置

### B.1 规则

281 个非测试源文件里绝大多数是通用驱动（[GEN]），**原样**过机械改名；产品/壳/品牌专属的 [PI] 按 B.2 / B.3 逐个决定。三个心脏**不重设计、照抄**（它们被 e2e 验证过）：

- `lib/rpc-manager.ts` —— 每会话一个 `AgentSessionWrapper`（`globalThis` 注册表防模块热重载丢失）、空闲回收、启动去重锁、fork/clone、扩展 UI 桥。
- `lib/agent-event-stream.ts` —— SSE 中枢。
- `lib/scheduled-tasks/*` —— `proper-lockfile` 租约单例。

### B.2 Strip list（Phase 0 一次删净）

- **真正删除（实测无非 strip 消费者，或消费者同批删除）**：`lib/app-updates.ts`、`lib/app-update-types.ts`、`lib/desktop-updater.ts`、`app/api/updates/**`、`components/AppUpdatesSection.tsx`、`components/UpdateReminder.tsx`、`lib/branding.ts`（重写为 EvoHarness 常量）、`scripts/upstream-css-baseline.*`、`components/fork-extractions.test.mjs`。
- **保留并重接为 hostBridge 适配层（v3 实测修订：这些文件有非 strip 消费者，删了必断链；函数签名不动、内部 Tauri invoke 改调 `lib/host.ts`，Phase 3 只在适配层下填 electron 实现，UI 零改动）**：`lib/desktop-native.ts`（24 个消费者，含 AppShell/ArtifactPanel/MessageView 等）、`lib/desktop-menu.ts` + `lib/desktop-menu-model.ts`（AppShell 直接 import `canUseNativeMenu/showNativeMenu`）、`lib/desktop-notify.ts`、`lib/desktop-window.ts`、`lib/desktop-connection.ts`（AppShell 的 `useDesktopConnection`）、`components/desktop/**`（AppShell 直接 import `WindowControls/useDesktopChrome/useWindowDrag`）、`hooks/useNativeAppMenu.ts`。
- **保留原样**：`lib/desktop-api.ts` 与 `lib/desktop-api-auth.ts` —— 服务端令牌契约，壳无关，Electron 沿用。
- **⚠ 剪除陷阱（v3 实测修订）**：`isTauriDesktop()` 定义在要删的 `desktop-updater.ts`，但全量 import 者是 **26 个文件**（Annex G 切点清单），不是早期估计的 5 个；`desktop-updater.ts` 本身被 18 个文件 import。**顺序必须是**：先建 `lib/host.ts` 并完成 `isTauriDesktop` → `isDesktopHost()` 全量切换（含测试文件），再删 `desktop-updater.ts`。
- **目录**：`demo/`、`Casks/`、`src-tauri/`、`desktop/`（Tauri 资源；`server-launcher.cjs` 的三段自愈逻辑先摘出留档，Phase 3 移植进 Electron 启动器）。
- **scripts**（全部删，除 B.4 白名单）：`bump-*`、`configure-updater-public-key`、`desktop-dev`、`desktop-platform`、`fork-ownership*`、`measure-fork-drift`、`prepare-desktop`、`release-*`、`resolve-component-releases`、`stage-package`、`test-platform`、`update-homebrew-cask`、`verify-*`、`write-component-versions`、`release-component-pins.json`。
- **workflows**：全部（主仓有自己的 CI 约定，Phase 4 再议）。

### B.3 硬编码 `.pi` 字面量（R2）

`codemode-settings.ts`、`mcp-config-read.ts`（link rule）、`mcp-host.ts`、`mcp-status.ts`、`project-trust.ts`、`default-preferences.ts`、`enabled-models*.ts`、`mcp-config-file.ts`。走 SDK 导出的 `CONFIG_DIR_NAME` 的那些自动生效，不动。

### B.4 scripts 白名单（只迁这些）

`build-preview-runtime.mjs`、`check-installed-deps.mjs`(+test)、`e2e-server-env.mjs`(+test)、`lan-server.mjs`(+test)、`web-dev.mjs`、`web-logging.test.mjs`、`web-package-layout.test.mjs`、`pi-packages.mjs`（按 A.0 重写）、`home-tracing.test.mjs`、`route-cache-cleanup.test.mjs`、`trace-stray-scandir.cjs`、`ui-menu-consistency.test.mjs`、`preview-runtime.test.mjs`。

---

## Annex C — SDK 符号面（Phase 0 的 tsc 只是第一道，测试是第二道）

必须存在于 `@evoharness/*`：`coding-agent` 约 53 个符号（`AgentSession`、`SessionManager`、`SettingsManager`、`createAgentSessionServices`、`createAgentSessionFromServices`、`getAgentDir`、`getPackageDir`、`CONFIG_DIR_NAME`、`DefaultPackageManager`、`DefaultResourceLoader`、`ProjectTrustStore`、`hasTrustRequiringProjectResources`、`createMcpExtension`、`createCodemodeExtension`、`createToolSearchExtension`、`createBashToolDefinition`、`createLocalBashOperations`、`defineTool`、`ModelRegistry`、`Theme`、`initTheme`、`parseFrontmatter`、`resolveModelScopeWithDiagnostics`、…）；`agent-core` 4（`Agent`、`AgentMessage`、`ThinkingLevel`）；`ai` 9 + `./compat`；`ai/providers/all` 2；`tui` 2。**加 Annex F 的 16 个 dist 私有符号。**

---

## Annex D — 环境变量矩阵

**矩阵是下限，不是上限**：以 `scripts/check-web-names.mjs` 零命中为准。

| 组 | 参照物 → 本应用 |
|---|---|
| 认证 | `PI_WEB_PASSWORD`→`EVOHARNESS_WEB_PASSWORD`；`PI_WEB_AUTH_USERNAME`→`EVOHARNESS_WEB_AUTH_USERNAME`；`PI_WEB_ALLOW_UNAUTHENTICATED`→同后缀 |
| 绑定 | `PI_WEB_HOSTNAME`、`PI_WEB_ALLOWED_HOSTS` → `EVOHARNESS_WEB_*` |
| 会话 | `PI_WEB_SESSION_COOKIE`、`PI_WEB_SESSION_MAX_AGE`、`PI_WEB_IDLE_TIMEOUT_MS`、`PI_WEB_SHUTDOWN_DEADLINE_MS` → `EVOHARNESS_WEB_*` |
| 流 | `PI_WEB_SSE_BACKLOG_LIMIT_BYTES`、`PI_WEB_PERF` → `EVOHARNESS_WEB_*` |
| 开关 | `PI_WEB_NO_OPEN`、`PI_WEB_VERBOSE`、`PI_WEB_SKIP_VERSION_CHECK`、`PI_WEB_DISABLE_MCP`、`PI_WEB_MCP_IDLE_MS`、`PI_WEB_DISABLE_SCHEDULER`、`PI_WEB_DESKTOP_BUILD` → `EVOHARNESS_WEB_*` |
| 生命周期 | `PI_WEB_PARENT_PID` → `EVOHARNESS_WEB_PARENT_PID`（孤儿看护） |
| 推送 | `PI_WEB_PUSH_SUBJECT` → `EVOHARNESS_WEB_PUSH_SUBJECT` |
| 壳契约 | `PI_DESKTOP_API_TOKEN`、`PI_DESKTOP_INSTANCE_ID`、`PI_DESKTOP_COMPILE_CACHE_DIR`、`PI_DESKTOP_NODE` → `EVOHARNESS_DESKTOP_*`（Electron 沿用） |
| **语义项** | `PI_PACKAGE_DIR`→`EVOHARNESS_PACKAGE_DIR`（core 已支持；`pi-sdk-internals` 有硬守卫，设了会让 SDK 路径与 `getPackageDir()` 不一致）；`PI_PACKAGED_TERMINAL_OK`→`EVOHARNESS_PACKAGED_TERMINAL_OK`；`PI_OFFLINE`→`EVOHARNESS_OFFLINE`（core 原生）；`PI_CODING_AGENT_DIR`→`EVOHARNESS_CODING_AGENT_DIR`（core 原生，e2e 夹具用） |
| **App 私有** | `PI_AGENT_HOME`→`EVOHARNESS_HOME`。**core 不读它**，它只给 `userHome()` 用（R9 的 NFT 规避）。文档里必须这样写，避免下一个人误以为改它能改 agent 目录 |
| 不变 | `PORT`、`NEXT_*`、`XDG_*`、`SystemRoot`、`LC_ALL`、`SKILLS_API_URL` |

---

## Annex E — 品牌与键名矩阵

**做法：先收敛，再改名。** 新增 `lib/app-keys.ts` 作为唯一常量源；Phase 0 结束后，源码里除该文件外不许再出现字面量。

| 类别 | 参照物 | 本应用 |
|---|---|---|
| bin / 日志前缀 | `pi-web` / `[pi-web]` | `evoharness-web` / `[evoharness-web]` |
| User-Agent | `"pi-web"` | `"evoharness-web"` |
| cookie | `pi_web_session` | `evoharness_web_session` |
| Basic realm | `"Pi Web"` | `"EvoHarness"` |
| 会话 registry 键 | `@agegr/pi-web/*` | `@evoharness/web/*`（跟包名走，不跟产品名，否则两套词表） |
| `globalThis` | `__pi*`（subagent runs/queue/consumed、sessionViewCache、sessionScanCache、projectCache/Generation/Refresh、webPushNotifier、webTerminals、piSdkInternals） | `__evoharness*` |
| localStorage | `pi-theme`、`pi-tool-preset`、`pi-thinking-expanded`、`pi-web:last-open-by-workspace`、`pi-web:tab-open-session`、`pi-web:settings-navigation`、`pi-web:unread-session-ids` 等 | `evoharness-*`（`lib/app-prefs.ts` 已是集中点，保留并 re-export） |
| `Symbol.for` | `pi-web:scheduler`、`pi-web:scheduled-run-index`、`pi-web:scheduled-task-listeners` | `evoharness-web:*` |
| 会话 entry / customType | `pi-web:scheduled-run`、`pi-web:tool-selection`、`pi-web:subagent`、`pi-web:subagent-status`、`pi-web:subagent-result`、`pi-web:subagent-notification` | `evoharness-web:*` |
| 工具 kind | `pi-web-subagent` | `evoharness-web-subagent` |
| 临时目录前缀 | `pi-web-skill-check-` | `evoharness-web-skill-check-` |
| **落盘文件名**（在共享 agentDir 内） | `pi-web-session-index.json` | `evoharness-session-index.json`。其余自研状态文件名本身不带品牌（`scheduled-tasks.json`、`scheduled-tasks/`、`web-push.json`、`agents/`、`trust.json`、`chats-trash/`、`desktop/`），不动 |
| codemode 自测 id | `pi-web-self-test` | `evoharness-web-self-test` |
| 登录页文案 | `<h1>Pi Web</h1>` | i18n 化（不走字面量） |

**这套改名安全的前提（写进 Phase 0 的说明）：** 全新数据目录、无存量用户；且这些 entry 类型是 App 自己写的扩展条目，core 只做透传，不会因改名拒绝解析。`project-trust` 的 registry 键改名后老键残留无害。

---

## Annex F — SDK 私有模块契约（R1 / D2）

`lib/pi-sdk-internals.ts` 实际加载 **7 个模块**：

| # | 模块 | 来源 |
|---|---|---|
| 1 | `dist/extensions/mcp/index.js` | `@evoharness/coding-agent` |
| 2 | `dist/extensions/mcp/runtime.js` | 同上 |
| 3 | `dist/extensions/mcp/config.js` | 同上 |
| 4 | `dist/extensions/mcp/oauth.js` | 同上 |
| 5 | `dist/core/mcp-servers.js` | 同上 |
| 6 | `dist/core/resolve-config-value.js` | 同上 |
| 7 | `@evoharness/mcp` **包根入口** | 用 `findPackageJSON` 从第 2 项的 file URL 反查，再按条件导出解析 |

**16 个符号**（少一个 MCP 就整体 `ok:false`）：`McpServerConnection`、`createDefaultTransport`、`StdioTransport`、`loadMcpConfig`、`addMcpServerConfig`、`updateMcpServerConfig`、`removeMcpServerConfig`、`validateMcpServerConfig`、`getMcpToolExposure`、`signInMcpServer`、`McpOAuthCredentialStore`、`McpSignInCancelledError`、`resolveConfigValueOrThrow`、`resolveHeadersOrThrow`、`getConfigValueEnvVarNames`、`isCommandConfigValue`。

**三条不可动的校验**（删掉就是"能跑但错误"）：`realpathSync` 同实体比较；`createMcpExtension` 引用相等；`probe instanceof StdioTransport`。第 7 项还要求 `@evoharness/mcp` **已 build 出 dist**——这是 D1 的具体落点。

---

## Annex G — hostBridge 接口（Phase 0 立，Phase 3 填）

从 Tauri 实际调用点反推。接口放 `lib/host.ts`，两个实现：`web`（no-op/降级，Phase 0）与 `electron`（preload，Phase 3）。

| 能力 | 方法 | web 实现 | Electron 实现要点 |
|---|---|---|---|
| 宿主识别 | `isDesktopHost()` | `false` | `true` |
| 服务生命周期 | `getServerPort` / `getDesktopApiToken` | 读 `location` / 返回 undefined | spawn standalone server（编译缓存目录、`EVOHARNESS_PARENT_PID` 看护沿用 `server-launcher.cjs`）；就绪握手 `GET /api/desktop/identity` |
| 窗口 | `minimize` / `toggleMaximize` / `close` / `isMaximized` / `startDragging` | no-op | 无边框窗 + `-webkit-app-region`；close→藏托盘开关 |
| 菜单 | `onMenuAction` | no-op | Phase 3 定（Windows 首版可不做） |
| 对话框 | `selectDirectory` / `selectFiles` / `selectSavePath` | 返回 `null`（UI 走 `<input type=file>` 降级已有） | `dialog.showOpenDialog/showSaveDialog` |
| 剪贴板 | `writeText` / `readImage` | `navigator.clipboard` / `read-images` 路由 | `clipboard` 模块 |
| 通知 | `isPermissionGranted` / `sendNotification` / `isFocused` / `focusWindow` | Web Notifications | `Notification` + `BrowserWindow.isFocused()` |
| 打开/展示 | `openExternalUrl` / `openPath` / `revealItemInDir` / `openLogDir` | 仅 `openExternalUrl` → `window.open`，其余 no-op | `shell.*`；仅允许 http/https/mailto |
| 自启动 | `autostartIsEnabled/enable/disable` | 恒 `false` / no-op | `app.setLoginItemSettings`（带 `--autostart` 保持隐藏启动） |
| 进程 | `relaunch` / `quitApp` | no-op | `app.relaunch/quit` |
| 主题/缓存 | `setUiTheme` / `clearAppCache` | `ui-prefs` 落 localStorage / no-op | 落 `ui-prefs.json` / `session.clearCache` |

**切点清单（2026-10-31 实测全量，Phase 0 必须全部改完，验收 = `grep isTauriDesktop` 零命中）：**

- lib（5）：`clipboard.ts`、`desktop-menu.ts`、`desktop-native.ts`、`desktop-notify.ts`、`desktop-updater.ts`（定义处，删除）
- hooks（7）：`useAudio.ts`、`useChatAccess.ts`、`useFileContextMenu.ts`、`useHtmlPreviewFrame.ts`、`useNativeAppMenu.ts`、`useScheduledRunNotifications.ts`、`useTheme.ts`
- components（14）：`AppShell.tsx`、`AppearanceSettings.tsx`、`FileViewer.tsx`、`FontSettings.tsx`、`MarkdownBody.tsx`、`ProjectPicker.tsx`、`PwaRegistration.tsx`、`SavedFileCard.tsx`、`SessionSidebar.tsx`、`SessionSidebar.test.mjs`（测试文件同样切换）、`desktop/DesktopAppSection.tsx`、`desktop/WindowControls.tsx`、`desktop/index.ts`、`desktop/useDesktopChrome.ts`

切法：`isTauriDesktop` → `host.ts` 的 `isDesktopHost()`；各 `lib/desktop-*.ts` 保留为适配层（见 B.2），其内部 Tauri invoke 全部改调 hostBridge。

---

## 验收命令速查

全部写在 §9，跨平台（`.mjs` 脚本），Phase 0 起生效：

```
node scripts/check-web-names.mjs      # 品牌/env 残留零命中
node scripts/check-web-boundary.mjs   # 单向依赖 + packages 零改动
npm run check:web                     # app 静态门禁：tsc + eslint + 守卫 + 版本断言（不含单测）
npm run test:web                      # app 单测（独立成条，Phase DoD 与 CI 跑，不进 check 链）
npm run check                         # 根门禁（含 file-size / pinned-deps）
```

Phase 2 起追加 `npm run --prefix apps/evoharness-web build` 与 `test:e2e` 子集。

---

**批准记录**

| 日期 | 范围 | 结论 |
|---|---|---|
| — | — | 待所有者批准 |
