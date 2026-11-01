# pi-subagents → evoharness 移植计划

- 状态:修订稿 v2(已并入外部审计修正,2026-11-01;v1 的 F4"内核 env 仅 1 个"经源码复核修正为 5 个,并新增 R13)
- 源:`D:\DEVELOP\Project-main\TypeScript\pi-subagents-main`(pi-subagents v0.84.0,上游基线 pi ≥ 1.2.0,devDeps 锁 1.2.0)
- 目标:`packages/subagents`(暂定名 `@evoharness/subagents`)
- 移植纪律:**第一遍纯机械改名,零逻辑改动、零结构调整、零顺手优化**

---

## 0. 目标与非目标

**目标**
1. pi-subagents 以 monorepo 包形态进入 `packages/subagents`,被 evoharness 作为扩展正常加载
2. 它的完整测试套件(unit + integration)在 evoharness 内核上全绿
3. 手动 smoke:前台子代理、后台任务、workflow 脚本、council 命令跑通
4. 之后(独立阶段)把全部私有/内部成员访问(R4,≥6 处)转正为 evoharness 内核的正式 API

**非目标(明确不做)**
- 不重构内核、不改内核代码(Phase 1–3)
- 不合并 subagents 源码进现有包的目录结构
- 不发布 npm(加 `"private": true`)
- 不改 pi-subagents 的 53 个自有 `PI_*` 内部常量(见 §2.4,降低 diff;Phase 3 后可选统一改名)
- 不动上游 `pi-subagents-main` 目录(保持只读,作为对照参考)

---

## 1. 已验证事实基线(本次调查的证据)

| # | 事实 | 证据 |
|---|---|---|
| F1 | evoharness 复刻基线 = pi **1.4.0 发布后的 Unreleased 快照**,扩展 API 类型与 pi-main 归一化后逐字节一致 | `docs/kernel/divergence.md`;`packages/coding-agent/src/core/extensions/types.ts` diff=0 |
| F2 | pi-subagents 是纯扩展:无内核 fork、无 monkey-patch、无 deep import(0 处 `/dist/` `/internal/`) | 全量 grep |
| F3 | subagents 依赖 4 个内核包 + typebox;import 规模:pi-coding-agent 114 处、pi-agent-core 85、pi-ai 77(+`pi-ai/compat` 7)、pi-tui 66 ≈ **349 处** | 全量 grep 统计 |
| F4 | subagents 触碰的 58 个 `PI_*` 变量中,**5 个是内核拥有的**:`PI_CACHE_RETENTION`/`PI_OFFLINE`/`PI_CODING_AGENT_DIR`/`PI_PACKAGE_DIR`/`PI_PROGRAM_STATUS`;其余 53 个是它自己的内部常量。5 个新名已在 evoharness 验证存在 | `comm` 严格交集(**双模式扫描:带引号字面量 + `env.PI_X` 属性访问式**;v1 只扫引号式漏了 4 个,已修正);新名在 evoharness 分别命中 6/8/3/3/1 个文件 |
| F5 | evoharness 已导出 subagents 需要的全部 11 个 SDK 符号:`createAgentSession`/`DefaultResourceLoader`/`SettingsManager`/`SessionManager`/`createBashTool`/`initTheme`/`resolveCliModel`/`ModelRuntime`/`createCodemodeExtension`/`convertToLlm`/`createReadOnlyTools` | `packages/coding-agent/src/index.ts` 逐个 grep |
| F6 | `@evoharness/ai` 保留 `./compat` 子路径导出 | `packages/ai/package.json:22` |
| F7 | evoharness 的宿主包白名单恰好是 subagents 需要的 4 包 + typebox,且要求声明在 peerDependencies | `packages/coding-agent/src/core/resource-loader.ts:59-66,90` |
| F8 | typebox 两侧同为 **1.3.27**,无双实例风险 | 两侧 package.json |
| F9 | subagents 代码里**没有**硬编码的 Pi 版本门槛检查(README 的 "Pi ≥ 1.2.0" 只是文档) | grep `1\.2\.0/minHost/hostVersion` 仅命中注释 |
| F10 | 内核全局主题注册表键已改名:`Symbol.for("@earendil-works/pi-coding-agent:theme")` → `Symbol.for("@evoharness/coding-agent:theme")` | subagents `child-session.ts:508`;evoharness `theme.ts:648` |
| F11 | evoharness manifest 字段:`"pi"` → `"evoharness"`(只读 `pkg.evoharness`,旧名直接失效,无兼容层) | `src/core/evoharness-manifest.ts`;divergence D-002 |
| F12 | evoharness 未发布 npm → subagents devDeps 不能从 registry 装,靠 workspaces 本地链接 | 各包无 registry 发布记录 |
| F13 | 后台 runner 引导机制假设"npm 安装的 pi 包 或 独立 pi 二进制" | `src/runs/shared/pi-spawn.ts:6`(常量 `PI_CODING_AGENT_PACKAGE = "@earendil-works/pi-coding-agent"`)、`binary-bootstrap.ts` |
| F14 | subagents 存在 `.pi` 路径硬编码(功能性,非全是注释),见 §2.6 清单 | grep 逐条 |
| F15 | evoharness workspaces = `packages/*`,放入即自动纳入;内部依赖用**精确版本**钉死(无 workspace: 协议) | 根 `package.json:5-8` |
| F16 | 本机 node v24.14.1,支持 `--experimental-strip-types`(测试脚本依赖) | 实测 |
| F17 | evoharness git 仓库在 `main` 分支,当前有 1 个未提交改动(`docs/structure.md`) | `git status` |
| F18 | evoharness 与 pi 的 shell 逻辑有差异:新增 Git Bash 反推查找(divergence D-011) | `src/utils/shell.ts` `findGitBashCandidates` |
| F19 | **TypeScript 双版本并存(v2 增)**:evoharness 根用 **7.0.2**(原生 tsgo),subagents 锁 **5.9.3**;npm 嵌套隔离 → subagents 自身 typecheck 用 5.9.3(与上游一致),根 `tsc --noEmit` 以 7.0.2 扫到 subagents 源码(include glob 自动覆盖),诊断差异列入 Phase 2.6 分诊。**决策:subagents devDeps 的 typescript 保持 5.9.3 不升级(风险最小)** | 根 `package.json:75`;subagents devDeps |
| F20 | 共享依赖版本(v2 增):undici/jiti/esbuild **两侧同版**(8.12.3/2.7.0/0.28.2,可去重单实例;undici 同实例对 runner 全局 dispatcher 有利);yaml 2.9.0 vs 2.8.3、@types/node 22.19.19 vs 24.13.3 双版本低风险(npm 嵌套 + skipLibCheck,yaml 无跨实例身份需求);acorn/@js-temporal/polyfill 仅 subagents 新增 | 双方 package.json 对照实测 |
| F21 | subagents src **无非可擦除语法**(enum/namespace/ctor 参数属性 0 命中)→ evoharness `erasableSyntaxOnly` 与 `node --experimental-strip-types` 均安全(v2 增) | grep 实测 |
| F22 | engines:evoharness 要求 node ≥22.19.0,本机 v24.14.1 满足;`engine-strict=false`;subagents 无 engines 字段(v2 增) | 根 `package.json:78-80`;npm config |

---

## 2. 完整映射表(字段完全枚举)

### 2.1 npm 包名(全局替换,顺序:长串在前,防误替换)

| 旧 | 新 | 预计命中 |
|---|---|---|
| `@earendil-works/pi-coding-agent` | `@evoharness/coding-agent` | 114 imports + pi-spawn.ts:6 常量 + JITI_ALIAS 表 |
| `@earendil-works/pi-agent-core` | `@evoharness/agent-core` | 85 |
| `@earendil-works/pi-ai` | `@evoharness/ai` | 77 + `/compat` 7(子路径保留,F6) |
| `@earendil-works/pi-tui` | `@evoharness/tui` | 66 |
| `@earendil-works/chord` | `@evoharness/chord` | runner-aliases.ts 别名表(v2 执行期补:peerDeps 未列但运行时引用)+ 夹具/测试 |
| 残余 `@earendil-works/*` | 逐一人工审(注释/别名表/测试) | 目标:源码内 0 处 |

### 2.2 `packages/subagents/package.json` 结构改动

| 字段 | 改动 |
|---|---|
| `name` | `pi-subagents` → `@evoharness/subagents` |
| `private` | 新增 `true`(不发布) |
| `"pi": {extensions, skills, prompts}` | → `"evoharness": {...}`(F11,不改则**扩展入口完全不被发现**) |
| `peerDependencies` | 4 个 `@earendil-works/*` → `@evoharness/*`,范围保持 `*`(F7 要求在 peerDeps 里,否则宿主告警);`typebox: *` 保留 |
| `devDependencies` | `@earendil-works/*: 1.2.0` → `@evoharness/*: 0.0.2`(workspaces 本地链接,F12/F15);**typescript 保持 5.9.3**(与上游一致,F19 双版本嵌套隔离,不随根升 7.0.2) |
| `dependencies` | jiti/acorn/undici/yaml/@js-temporal/polyfill 不动 |
| `bin.install.mjs`、`files`、`pack:pkg` | 退役:monorepo 包不需要 git-clone 安装器(决策点 D2) |
| `scripts` | typecheck/test 保留;`build:pkg`/`pack:pkg` 移除 |
| `keywords`/`repository`/`bugs` | 清理或改指 evoharness(纯元数据) |

### 2.3 内核拥有的环境变量与符号(全部内核耦合点,必须改)

下表 env 为**双模式扫描的严格交集**(带引号字面量 + `env.PI_X` 属性访问式;v1 只扫引号式漏了 4 个,教训已写入附录 A.3)。5 个新名均已在 evoharness 验证存在:

| 项 | 旧 | 新 | subagents 触碰点(已逐一核实) | 不改的后果(静默) |
|---|---|---|---|---|
| env | `PI_CACHE_RETENTION` | `EVOHARNESS_CACHE_RETENTION` | `src/shared/child-cache-retention.ts:35-43`(注入 streamFunction env) | 缓存保留策略失效 |
| env | `PI_OFFLINE` | `EVOHARNESS_OFFLINE` | `agents.ts:522,2725`、`skills.ts:130`、`global-npm-root.ts:12`(共 4 处) | **离线守卫变死代码**:离线机器上仍探测网络/npm root,卡住不报错 |
| env | `PI_CODING_AGENT_DIR` | `EVOHARNESS_CODING_AGENT_DIR` | `agents.ts:2796`(用户目录覆盖)、`shared/utils.ts:94` | agent/skills 发现路径与用户目录解析失效 |
| env | `PI_PACKAGE_DIR` | `EVOHARNESS_PACKAGE_DIR` | `async-execution.ts:790`(转发进子进程 env,后台引导用) | 后台子进程全局包目录探测错误 |
| env | `PI_PROGRAM_STATUS` | `EVOHARNESS_PROGRAM_STATUS` | `integrations/program-status.ts:186`(读父进程状态开关) | 状态转发断 |
| Symbol | `Symbol.for("@earendil-works/pi-coding-agent:theme")` | `Symbol.for("@evoharness/coding-agent:theme")` | `src/runs/shared/child-session.ts:508` | 内核主题注册表探测失败 |

> 移植时执行全量 sweep 确认无第 6 个内核 env / 第 2 个内核 Symbol(附录 A.3 双模式命令)。subagents 其余 `Symbol.for(...)`(background-work/runtime-agent-registry/external-job-provider/external-runs 等)是**它自己的注册表键**,与内核无关,不改。`@mariozechner` 在 subagents 0 命中,D-002(删旧别名)无害,已从关注清单移除。

### 2.4 pi-subagents 自有常量(明确不动,共 53 个)

`PI_CODING_AGENT_PACKAGE`(它自己定义的宿主包名常量,值在 §2.1 已随包名替换更新)、`PI_CODING_AGENT_PACKAGE_ROOT_ENV`、`PI_PROTOCOL`、`PI_RUN_ENV`、`PI_MODE_ENV`、`PI_VERSION`、`PI_KEY`、`PI_MAX_FRAME_BYTES`、`PI_RUNTIME_DIR_ENV`、`PI_SUBAGENT_*`/`PI_SUBAGENTS_*` 全系列(tool timeout/worktree dir/extension bindings/runner config/child 等;§2.3 的 5 个内核拥有者除外)。这些只在这扩展自己与它派生的子进程之间流转,内核不读。**Phase 1–3 一律不改名**;品牌统一留到 Phase 3 之后一次性提交(决策点 D3)。

### 2.5 内核 API 名(验证过,不变;事件词表已经外部审计全量复核,在 evoharness 类型定义中全部存在)

`ExtensionAPI` 全部方法名(`registerTool/registerCommand/registerMessageRenderer/registerMessageCommand/registerShortcut/registerMcpServer/registerVirtualModel/sendMessage/appendEntry/exec/getActiveTools/setActiveTools/getAllTools/setModel/initTheme...`)、全部事件名(`session_start/before_agent_start/agent_before_settle/tool_call/before_provider_request/context_with_system...`)、`ctx.*` 字段、`pi.exec` —— 与 pi-main 逐字节一致(F1),**不改**。

### 2.6 `.pi` 路径硬编码清单(逐条过,分四类)

**功能性(会改变行为,必须改):**
| 位置 | 内容 | 改法 |
|---|---|---|
| `src/runs/shared/mcp-direct-tool-allowlist.ts:224` | `path.join(cwd, ".pi", "mcp.json")` 读项目级 MCP 白名单 | → `".evoharness"` |
| `src/agents/agents.ts:1891` | `DISCOVERY_PRUNED_DIR_NAMES` 含 `".pi"`,扫描 agent 目录时修剪 | → 改为 `".evoharness"`(或两者都留) |
| `src/runs/shared/model-resolution.ts:356` | 注释指向 `~/.pi/agent/settings.json` 默认路径;若实际路径来自宿主 `SettingsManager` 则自动正确,**验证是否硬编码** | Phase 1 逐行核对 |
| `runner-peer-loader.mjs` / `runner-aliases.ts` | JITI_ALIAS 别名表按内核包名构建(F13) | 随 §2.1 替换覆盖 |
| worktree/产物写入逻辑(测试断言见 `test/integration/worktree*.test.ts` 等) | 运行产物写 `.pi/subagents/**`、worktree 分支前缀 `pi-subagents/`(v2 增,缺口 3) | **决策点 D4**:改 `.evoharness/subagents/**` + 前缀(源码与测试断言同提交),或保留自留 |

**用户可见文案(Phase 2 后统一过一遍,低优先):** `model-resolution.ts:42`(错误信息里 `~/.pi/agent/extensions/subagent/config.json`)、`extension/index.ts:11` 等。

**纯注释(顺手改,不阻塞):** `agents.ts:892`、`agent-memory.ts:12`、`extension/index.ts:170-171`。

**正则指令保护:** `agent-refinements.ts:457` 的保护正则里含 `\.pi/agent` 字面量 → 改/加 `\.evoharness/agent`。

### 2.7 CLI 二进制与后台 runner(F13,最高风险区,见 R1)

`src/runs/shared/pi-spawn.ts` 全家:`findPiPackageRootFromEntry` / `resolveInstalledPiPackageRoot` / `resolvePiPackageRoot` / `resolveHostDependencyPiPackageRoot` / `resolveHostPiPackageRoot` / `resolveBunPiExecutable` / `resolvePiCliScript` / `getPiSpawnCommand`。它们假设:
1. npm 全局/本地安装的 `@earendil-works/pi-coding-agent`(→ 改名后找 `@evoharness/coding-agent`,monorepo 下 `node_modules` 符号链接**预期可解析,Phase 0 验证**)
2. 独立 `pi` 二进制(evoharness bin 名是 `evoharness`,此路径预期死路 → 前台不受影响;**后台子进程是否还能引导 = smoke 必测项**)
3. `PI_SUBAGENT_PI_BINARY` env 显式指定(逃生门,排查时可用)

配套:`binary-bootstrap.ts`(runner 自举)、`runner-peer-preload/loader.mjs`(peer 身份对齐)、`async-execution.ts:709-713`(找不到宿主时的报错文案)。

### 2.8 测试基建

- `test/support/register-loader.mjs`、`test/support/isolated-temp-root.mjs`:里面的 peer 包名/路径随 §2.1 替换
- `test/unit/host-peer-runtime-imports.test.ts`、`runner-peer-symlinks.test.ts` 等宿主假设测试 = **合同测试,必须保留并跑绿**
- `package.json` test 脚本用 `node --experimental-strip-types`(F16 本机 node 24 ✅)
- integration 测试可能触及真实模型/网络 → 见 R10
- **测试断言随改名同步是独立改动类别**(v2 增,缺口 4):385 个测试文件中大量硬编码 `@earendil-works`/`pi-subagents/`/`.pi` 字面量断言(`acceptance-file-report`、`async-execution.part-1..3`、`render-widget`、`worktree*` 等)。源码标识符改名后这些断言会批量红——与源码**同一提交**同步期望值,并**单独成 commit**(不算"改逻辑"红线,且便于独立回滚)

### 2.9 feature-detect API(有降级路径,逐项验证行为而非阻塞)

| API | subagents 用法 | 移植时验证 |
|---|---|---|
| `registerEntryRenderer` | `extension/index.ts:606-611` typeof 探测 | evoharness 若无此 API → 自动跳过,确认降级后 UI 正常 |
| `sendUserMessage` | `subagent-prompt-runtime.ts:573` 探测 | 同上 |
| `SessionManager.inMemory` | `child-session.ts:520-524` 逐级探测 | F5 已确认导出 ✅ |
| `createCodemodeExtension` | 同上 | F5 已确认导出 ✅ |

### 2.10 术语字符串(最后做,可选)

README/docs/skills/agents/*.md/prompts 里的 "Pi" → "EvoHarness"。对模型行为影响很小,放 Phase 3 之后。

---

## 3. 阶段计划

### Phase 0 — 预检(半天)

入口条件:无。
1. `git -C evoharness` 先处理 `docs/structure.md` 未提交改动(提交或 stash,保持基线干净),从 `main` 拉 `feat/subagents-port`
2. 复制 `pi-subagents-main` → `evoharness/packages/subagents`(排除 `node_modules`、`package-lock.json`、`dist-pkg`)
3. 根目录 `npm install`,确认 workspaces 链接成功:`npm ls @evoharness/coding-agent` 应指向本地 `packages/coding-agent`
4. **构建 4 个宿主包**(v2 增,缺口 6):`packages/coding-agent`、`ai`、`agent`、`tui` 各跑 `npm run build` 生成 dist(宿主包 `main → ./dist/index.js`;不先 build,Gate 1 会大面积"找不到模块/类型",**极易误诊为 R3 类型漂移**)
5. 验证 `require.resolve("@evoharness/coding-agent")` 从 `packages/subagents` 内可解析(写一条临时脚本),这是 F13 后台引导的前置
6. `npm ls typebox` 确认单实例(F8)
7. (可选,建议)移植基线(v2 增):在 `pi-subagents-main` 用其自带 devDeps(pi 1.2.0)跑一遍 `npm run test:unit`,记录既有红/绿——Phase 2 红时分得清"本来就红"还是"移植改红"

退出条件:依赖树健康、包可解析、宿主 dist 已构建、基线红/绿已记录。

### Phase 1 — 机械移植(1–2 天,只改名字)

按附录 A 的顺序执行替换。任务清单:
- [ ] §2.1 包名替换(349 处 import + 常量 + 别名表)
- [ ] §2.2 package.json 重写
- [ ] §2.3 六个内核耦合点(5 env + 1 Symbol)
- [ ] §2.6 功能性 `.pi` 硬编码(3–4 处)+ D4 产物目录/分支前缀(若拍板改)
- [ ] 测试基建同步(§2.8)
- [ ] 测试断言期望值同步(§2.8,**单独 commit**)
- [ ] 专项耦合扫描(v2 增,缺口 8):`src/intercom/native-supervisor-channel.ts`(1141 行)、`src/intercom/`(intercom-bridge)、`src/extension/rpc.ts`(888 行,已确认自有协议 `subagents:rpc:v1:*`,与宿主 RPC 不冲突但需扫)、`src/missions/` —— 重点:裸字符串 `pi.on(event)`、`env.PI_*` 属性访问、`as unknown as` 强转、残余包名字符串
- [ ] 全量残留审计(附录 A.3):`@earendil-works` = 0(源码)、内核 env 5 项 = 0、功能路径 `.pi` = 0

**红线:此阶段出现"必须改逻辑才能过"的情况 → 停,记录到 §4 风险登记册,不许顺手改。**

退出条件:`tsc --noEmit` 的报错全部属于"类型漂移"类(R3),无"找不到模块"类。

### Phase 2 — 跑绿(1–2 周,视 R3/R1/R13 情况;385 个测试文件,最大单文件 5937 行)

Gate 顺序,每道全绿才进下一道:
1. `npm run typecheck`(在 packages/subagents)——注意:**Gate 1 对 R13"不可类型化运行时耦合"零覆盖**(强转恰好致盲 tsc),绿 ≠ 安全
2. `npm run test:unit` —— 这一步会集中暴露 R3 类型/行为漂移与 R6 硬编码遗漏
3. **测试分诊**(v2 增,缺口 5):按外部依赖给 integration 测试分类(需 API key / 联网 / 真实 spawn → 标记手动/CI 项),其余全跑;不让"全绿"成为阻塞移植完成的名词
4. `npm run test:integration`(未被分诊拦截的部分)
5. 手动 smoke 矩阵(§5.2):前台子代理、**后台任务(R1 必测)**、workflow 脚本、council、`bg_wait`、扩展重载(`/reload` 后版本一致性检查,`index.ts` 入口自带)

原则:测试红 → 只修"名字/路径/清单"(含测试断言期望值,单独 commit);任何逻辑修改记入 divergence 附加文档(§7)。

退出条件:5 道 gate 全绿。

### Phase 3 — 调整位置(可选,1 天)

全绿之后才允许:目录重排、与 evoharness 代码风格统一、术语字符串(§2.10)、自有 `PI_*` 常量改名(若 D3 拍板改)。**一次一类改动,每步测试保持绿。**

### Phase 4 — 转正(独立迭代,见 §7)

把 R4 全部私有/内部成员访问(≥6 处)改造成内核正式 API;镜像行为逐项内核化。这是长期任务,不阻塞移植完成。

---

## 4. 风险登记册(按严重度排序)

| ID | 风险 | 触发/症状 | 概率×影响 | 缓解 | 检测手段 |
|---|---|---|---|---|---|
| **R1** | **后台 runner 无法引导**:pi-spawn 全家假设 npm 包/独立二进制;evoharness 两者皆无(F13)。后台子代理起不来,报 `async-execution.ts:709` 的错误 | Phase 2 smoke 后台任务 | 中×高 | ①Phase 0 预检 resolve 链路 ②若死路:在 pi-spawn 增加"workspace 宿主"解析分支(从 `import.meta.url`/entry 反推 monorepo 根)——这是**唯一预期中的逻辑新增**,单独提交 ③逃生门:`PI_SUBAGENT_PI_BINARY` 指向本地 evoharness CLI | smoke bg_wait;`host-peer-runtime-imports.test.ts` |
| **R2** | **内核模块双实例**:父进程与 runner 子进程解析到两份 `@evoharness/coding-agent` → Symbol.for 注册表、instanceof、`isRetryableAssistantError` 等身份判断静默断裂 | 后台/子会话行为怪异、theme 不生效 | 低×高 | runner-aliases/JITI_ALIAS 机制本来就是为此设计(F13),改名后保持;`npm ls` 确认单副本 | `runner-peer-symlinks.test.ts`;bg smoke 时观察 theme/widget |
| **R3** | **类型漂移 1.2.0→1.4.0+**:devDeps 从 pi 1.2.0 快照切到 evoharness 0.0.2,类型签名漂移导致 typecheck/单测红 | Phase 2 gate 1–2 | 高×中 | 修复原则:优先适配新类型名,不改运行时语义;每处修复登记(§7 文档);subagents 依赖 >= 1.2.0 语义,1.4.0 是超集(F1),预期改动集中在收窄的类型 | typecheck 全量 diff 记录 |
| **R4** | **私有/内部成员访问(≥6 处,v2 修正计数)**:`buildSessionContext` 强转类 4 处(`declaration-pinning.ts:122`、`tool-activation.ts:70-71` 等)、TUI 内部成员 1 处(`fleet-status.ts:1016-1018` `focusedComponent`,其注释"instanceof is unreliable across jiti module boundaries"同时是 R2 的现场证据)、loader.loaded、streamFunction 包装。当前内核逐字节一致 → **今天风险≈0**;evoharness 独立演进后每次动内核都可能静默断 | 未来改内核时 | 现在:极低;长期:高 | Phase 4 转正成正式 API(§7);转正前把全部位置+语义写进 divergence.md;合同测试不许删 | `host-peer-runtime-imports.test.ts` + §7 检查单 |
| **R5** | **镜像内核行为失配**:system prompt 文本结构匹配(`subagent-prompt-runtime.ts:67-70,194-198,326`)、fork 目录布局(`fork-context.ts:177-254`)、`parseHttpIdleTimeoutMs` 复刻(`runner-http-dispatcher.ts:17-96`)、settings 读取。不改内核不炸;改了就**静默**错(子 agent prompt 不对/fork 找不回/超时语义漂移) | 内核任何 prompt/布局/HTTP 改动后 | 长期高 | 同 R4:转正或文档化;合同测试覆盖 | 单测 + 手动对比子 agent 收到的 system prompt |
| **R6** | **`.pi` 硬编码遗漏**(F14 清单之外还有漏网):症状是静默降级——扫描到错误目录、mcp.json 读不到、产物目录/分支前缀不一致(D4)、错误文案指错路 | Phase 2 各 gate 随机出现 | 中×中 | §2.6 清单逐条过 + 附录 A.3 残留审计(`\.pi` 全量 grep 人工分拣) | grep 审计 + smoke |
| **R7** | **测试基建不适配**:register-loader/isolated-temp-root 里的包名、临时目录布局与 evoharness 的 `~/.evoharness` 不同 | Phase 2 gate 2 直接红 | 高×低 | 随 Phase 1 同步替换;这类失败模式明显,易定位 | unit 全跑 |
| **R8** | **Windows 平台差异**:本机 win32 + Git Bash;evoharness 的 shell 解析与 pi 不同(D-011 新增 Git Bash 反推),子 agent 的 bash 工具行为可能与上游验证环境不一致 | smoke / 日常使用 | 中×中 | 全套 smoke 在 Windows 上跑(不是只在 CI/Linux 心里过);workflow-script-process.cjs 已有 Windows 分支,确认覆盖 | Windows 全 smoke 矩阵 |
| **R9** | **typebox 双实例**:两份 typebox → schema 编译身份断裂 | 运行时 schema 校验怪错 | 低×中 | F8 两侧同版本;`npm ls typebox` 单实例确认 | Phase 0 预检 |
| **R10** | **integration 测试外部依赖**(真实模型 API/网络):在无 key/离线环境不可跑 | Phase 2 gate 3–4 | 高×低 | Gate 3 测试分诊(需 key 的标记手动/CI);gate 1–2 + smoke 作为主门禁,不阻塞移植完成;**需 API key 或 Windows 上无法运行的测试,经用户授权直接跳过(2026-11-01)** | 逐文件审 test/integration 头部 |
| **R11** | **扩展生态交互**:evoharness 内置扩展 + subagents 的 `extensionsOverride` 重排、`registerVirtualModel`、MCP builtin 注入的相互影响 | 多扩展同载时 | 低×中 | smoke 加载至少一个内置扩展共存场景 | smoke 变体 |
| **R12** | **上游分叉(长期)**:与 nicobailon/pi-subagents 永久分叉,上游更新无法直接合并(内核名/字段全改过) | 未来想跟上游新版 | 确定×中 | 接受自持;在包内留 `UPSTREAM-PORT-NOTES.md` 记录全部改名映射(即 §2),上游新版发布时按映射机械重放 | — |
| **R13** | **不可类型化运行时耦合**(v2 新增类别,外部审计发现):`pi.on` 经 `as unknown as` 以裸字符串订阅事件(watchdog/`subagent-prompt-runtime.ts:91,530,574,677` 等多处)、`registerTool` 签名强转、Message 形状强转注入 `sections/toolsAdded/toolsRemoved`(`subagent-prompt-runtime.ts:383,403-404`)、TUI `focusedComponent` 结构性探测。**tsc 对这类恰好致盲:Gate 1 绿 ≠ 安全** | Phase 2 smoke 与日常使用 | 中×高 | 只能靠运行期手段:合同测试 + §5.2 全量 smoke;事件词表已全量验证今天存在(§2.5);这也是内核未来演化时的主防线 | 单测 + smoke;与 R4/R5 共用转正/文档化防线 |

**风险最小化的三条纪律**(贯穿所有阶段):
1. **一个变量原则**:每一步只引入一类变化(名字→测试→结构→逻辑),红了能立刻定位
2. **增量可回滚**:只新增 `packages/subagents` + package-lock 变更;内核零改动(Phase 1–3),revert = 删目录
3. **合同测试当安全网**:subagents 自带的宿主假设测试是它 6 万行代码与内核之间的契约,永远最后删

---

## 5. 验证矩阵

### 5.1 自动化(每 gate)

```bash
# Phase 0
npm ls @evoharness/coding-agent @evoharness/ai @evoharness/agent-core @evoharness/tui typebox
# 宿主包先构建(各包目录 npm run build 生成 dist;否则 Gate 1 大面积"找不到模块",易误诊为 R3)
# Phase 2
cd packages/subagents
npm run typecheck
npm run test:unit
npm run test:integration   # 按 R10 分类后
```

### 5.2 手动 smoke 矩阵(Phase 2 gate 5)

| 场景 | 验证点 |
|---|---|
| evoharness 启动加载扩展 | 无加载错误;`subagents_enable` loader 或 `subagent` 工具出现(F:README toolActivation 逻辑) |
| 前台子代理:"Use scout to..." | 子会话内联、流式回传、theme/widget 正常(R2) |
| 后台任务 + `bg_wait` | **R1 必测**;runner 进程拉起、peer 身份对齐、结果回查 |
| workflow 脚本 | workflow-script-worker 沙箱(1343 行 vm realm)在 Windows 上跑通(R8) |
| council / 命令面板 | registerCommand/registerMessageRenderer 正常 |
| `/reload` 后再跑 | 入口的版本一致性检查不误报(index.ts 自带) |
| 与内置扩展共存 | R11 |
| cache retention | 设置 retention 后子会话请求头/env 生效(§2.3 第 1 项改名的端到端验证) |
| 离线模式(v2 增) | `EVOHARNESS_OFFLINE=1` 启动并起一个子代理:离线守卫生效、不探测网络(R13/env 类耦合的代表验证) |
| 模型目录(v2 增,D-005) | 子代理拿到非空模型列表;evoharness.dev 不可达时确认回退内置目录生效 |

---

## 6. 回滚策略

- 全程在 `feat/subagents-port` 分支;Phase 1–3 **不动内核文件**,回滚 = 删 `packages/subagents` + 还原根 `package-lock.json`,主线零污染
- Phase 4 的内核 API 新增单独提交、单独可 revert
- `pi-subagents-main` 目录保持只读作为对照;移植侧不回写

---

## 7. 转正清单(Phase 4 明细)

| 现状 hack | 转正提案 | 收益 |
|---|---|---|
| `(loader as {loaded}).loaded = true`(`child-session.ts:272-277`) | `DefaultResourceLoader` 增加 `resetExtensionCache()` 公开方法 | 删强转;语义进类型系统 |
| 强转调 `buildSessionContext()`(共 **4 处**:`declaration-pinning.ts:122`、`tool-activation.ts:70-71` 等) | ExtensionContext 类型放宽,或提供 `getSessionSnapshot()` | 同上 |
| 包装 `agent.streamFunction` 注入 retention env(`child-cache-retention.ts:35`) | Agent 构造/会话选项增加 `providerEnv` 或 `cacheRetention` 官方字段 | 同上 |
| 镜像 prompt 文本结构(`subagent-prompt-runtime.ts`) | 内核导出结构化 system-prompt 分段接口(section 枚举/钩子) | 内核改 prompt 不再静默破坏扩展 |
| 镜像 `parseHttpIdleTimeoutMs`(`runner-http-dispatcher.ts`) | 从 coding-agent 导出该解析函数 | 单一事实源 |
| TUI 只暴露 focus 变更、无 focus 读取(`fleet-status.ts:1016-1018` 结构性探测 `focusedComponent`) | pi-tui 增加 `getFocusedComponent()` 公开 getter | 消除对 TUI 内部成员的结构探测(v2 增,缺口 2) |
| fork 目录布局赌注(`fork-context.ts:177`) | 内核提供 branched session 输出目录参数 | 已用 `createBranchedSession`,补目录参数即可 |

配套:在 `docs/kernel/divergence.md` 增加"扩展内核耦合点"一节,列 R4/R5 全部位置;以后动内核先跑 `packages/subagents` 的合同测试。

---

## 8. 决策点(需拍板,附推荐)

| # | 决策 | 推荐 | 备选 |
|---|---|---|---|
| D1 | 包名与位置 | `packages/subagents`,包名 `@evoharness/subagents` | 并入 coding-agent 内部目录(**不推荐**:耦合内核、失去边界) |
| D2 | install.mjs / 发布元数据 | 退役(删 bin/files/pack 脚本,README 留档) | 保留但改造指向 evoharness(无意义,monorepo 不需要) |
| D3 | 自有 53 个 `PI_*` 常量 | Phase 1–3 不动,Phase 3 后可选一次性改 `EVO_SUBAGENT_*` | 立即全改(diff 变大、易出错,不推荐) |
| D4(v2 增) | `.pi/subagents/**` 运行产物目录与 `pi-subagents/` worktree 分支前缀 | 改为 `.evoharness/subagents/**` + 前缀,兑现 evoharness 自身 D-004 目录约定;测试断言同提交同步 | 保留 `.pi/subagents` 自留(源码零改动,但违背 D-004、用户侧两套目录困惑) |

---

## 附录 A — 批量改名操作指南(Git Bash)

### A.1 替换顺序(长串在前)

```bash
cd /d/DEVELOP/Project-main/TypeScript/evoharness/packages/subagents
# 1. 包名(对 src test *.mjs *.cjs *.ts package.json 全量)
grep -rl '@earendil-works/pi-coding-agent' . --include='*.ts' --include='*.mjs' --include='*.cjs' --include='*.json' \
  | xargs sed -i 's|@earendil-works/pi-coding-agent|@evoharness/coding-agent|g'
grep -rl '@earendil-works/pi-agent-core' ... | xargs sed -i 's|@earendil-works/pi-agent-core|@evoharness/agent-core|g'
grep -rl '@earendil-works/pi-ai'          ... | xargs sed -i 's|@earendil-works/pi-ai|@evoharness/ai|g'
grep -rl '@earendil-works/pi-tui'         ... | xargs sed -i 's|@earendil-works/pi-tui|@evoharness/tui|g'
# 2. 内核 env(§2.3 全部 5 项,文件清单已逐一核实)+ Symbol
sed -i 's|PI_CACHE_RETENTION|EVOHARNESS_CACHE_RETENTION|g' src/shared/child-cache-retention.ts
sed -i 's|PI_OFFLINE|EVOHARNESS_OFFLINE|g' src/agents/agents.ts src/agents/skills.ts src/agents/global-npm-root.ts
sed -i 's|PI_CODING_AGENT_DIR|EVOHARNESS_CODING_AGENT_DIR|g' src/agents/agents.ts src/shared/utils.ts
sed -i 's|PI_PACKAGE_DIR|EVOHARNESS_PACKAGE_DIR|g' src/runs/background/async-execution.ts
sed -i 's|PI_PROGRAM_STATUS|EVOHARNESS_PROGRAM_STATUS|g' src/integrations/program-status.ts
sed -i 's|@earendil-works/pi-coding-agent:theme|@evoharness/coding-agent:theme|g' src/runs/shared/child-session.ts
# 3. 功能性 .pi(§2.6,逐处手工,勿全局 sed ".pi")
```

### A.2 注意事项

- `PI_CODING_AGENT_PACKAGE` 常量的**值**(原 `@earendil-works/pi-coding-agent`)已被第 1 步顺带替换 ✅,但变量名保留(D3)
- `pi-ai/compat` 子路径不受影响(sed 只动包名前缀)
- package.json 的 `"pi"` 字段 → `"evoharness"` 手工改(结构变化,sed 不做)
- **不要**对 `.pi` 做全局替换:注释、正则、pruning 集合、真实路径是四类不同改动(§2.6)
- 第 2 步的 5 条 env sed 均为 token 精确替换,与 §2.4 自有常量无前缀冲突(如 `PI_CODING_AGENT_DIR` ≠ `PI_CODING_AGENT_PACKAGE`);仍建议 sed 后立即跑 A.3 复核

### A.3 残留审计(Phase 1 退出前必须全零或全部人工分拣)

```bash
# —— 内核 env 双模式扫描(v1 教训:只扫引号式,漏了 PI_OFFLINE 等 4 个属性访问式)——
grep -rnE '\benv\.PI_[A-Z0-9_]+' src test                                  # 属性访问式:期望 0
grep -rnE 'PI_(CACHE_RETENTION|OFFLINE|CODING_AGENT_DIR|PACKAGE_DIR|PROGRAM_STATUS)' src test  # 内核拥有 5 项:期望 0
grep -rhoE 'PI_[A-Z0-9_]+' src test | sort -u                              # 全量令牌清单:逐个对 §2.3/§2.4 归属核对
# —— 包名 / Symbol / 路径 ——
grep -rn "@earendil-works" src test *.mjs *.cjs *.ts   # 期望 0
grep -rn "Symbol.for(\"@earendil" src                   # 期望 0
grep -rn '\.pi' src | grep -v '\.pixi\|\.pip\|api\|\.pinyin'   # 逐条人工分拣(§2.6 四类 + D4)
```
