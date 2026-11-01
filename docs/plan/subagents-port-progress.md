# pi-subagents → evoharness 移植进度跟踪

- 配套计划:`docs/plan/subagents-port.md`(v2,映射表/风险登记册/验证矩阵的唯一权威来源)
- 执行纪律:每步动手前 = ①核对上一步退出条件 ②`git status` 与预期一致 ③写明[动什么/预期产出/回滚命令]再执行;动手中 = 与预期不符立即停;动手后 = 结果写入本文件,计划外发现写入"发现登记"
- 提交纪律:只在检查点提交,提交信息带检查点编号

---

## 状态总览

| 阶段 | 状态 |
|---|---|
| Phase 0 预检 | 进行中 |
| Phase 1 机械改名 | 未开始 |
| Phase 2 跑绿 | 未开始 |

---

## 版本兼容性核查(Phase 0 增补,2026-11-01;用户指示:核查 TS 与全部版本冲突)

| 项 | 结论 | 处置 |
|---|---|---|
| TypeScript | **双版本并存**:evoharness 根 **7.0.2**(原生 tsgo),subagents 锁 **5.9.3**。npm 嵌套隔离:subagents 自身 typecheck 用 5.9.3(与上游一致);根 `tsc --noEmit` include glob 会以 7.0.2 扫到 subagents 源码 | **subagents devDeps 保持 5.9.3 不升级(风险最小)**;TS7 诊断差异 → Phase 2.6 分诊(发现登记 V1) |
| 非可擦除语法 | src 中 enum/namespace/ctor 参数属性 **0 命中** | `erasableSyntaxOnly` 与 strip-types 均安全,无需处置 |
| module/target | subagents ES2023/NodeNext ⊂ evoharness ES2024/Node16(超集或等价;两侧均 allowImportingTsExtensions + rewriteRelativeImportExtensions) | 无需处置 |
| undici / jiti / esbuild | **两侧同版**:8.12.3 / 2.7.0 / 0.28.2 → npm 去重单实例;undici 同实例对 runner-http-dispatcher 的全局 dispatcher 安装有利 | 无需处置 |
| yaml | evoharness 2.9.0 vs subagents 2.8.3 → npm 嵌套双副本;yaml 无跨实例身份需求 | 低风险,记录(发现登记 V2) |
| @types/node | evoharness 22.19.19 vs subagents 24.13.3 → 嵌套隔离;两侧 skipLibCheck | 低风险,记录(发现登记 V3) |
| acorn / @js-temporal/polyfill | 仅 subagents 有,属新增依赖 | 随 package-lock 入树 |
| engines / node | evoharness 要求 node ≥22.19.0,本机 v24.14.1 ✅;`engine-strict=false`;subagents 无 engines 字段 | 无阻断 |

**测试跳过授权(用户 2026-11-01)**:需要 API key 或 Windows 上无法运行的测试,分诊后直接跳过,不阻塞"全绿"。

---

## Phase 0 — 预检

- [x] **0.1 建跟踪文件**(本文件)
  - 记:创建即产出 ✅ 2026-11-01
- [x] **0.2 建分支 `feat/subagents-port`**
  - 前置:`git status` 仅 `M docs/structure.md` + 两个计划文档未跟踪——实测一致(另发现基线 commit 即 D-011 Git Bash 工作 `test(env): discover Git Bash…`,解释了 docs/structure.md 的改动来源)✅
  - 记:分支 `feat/subagents-port`,基线 commit `172143d022e7158dfd1016dbd4878c124b928228`
- [x] **0.3 复制源包 → `packages/subagents`**(排除 `package-lock.json`、`dist-pkg`)
  - 前置:排除清单确认;复制后抽查目录树与源一致 ✅
  - 记:复制文件数 **1041**(源 1042 − package-lock.json 1)。⚠️ 初次拷贝误排 `test/fixtures/pi-coding-agent-shim/node_modules/`(vendored 检入夹具,非安装依赖,见发现登记 V4),已恢复并复核
  - 回滚:`rm -rf packages/subagents`
- [x] **0.4 根 `npm install`**
  - 前置:workspaces `packages/*` glob 自动纳入(已核实 F15)✅
  - 记:零 error;lock +818/−117;lock 中新增 `packages/subagents` + 嵌套 typescript@5.9.3/oxlint/yaml/@types/node@24(双版本隔离落地实证);11 个 vulnerabilities(上游树继承,不阻塞);`npm ls` 对 workspace 包显示 empty 属正常,以 lock 为准
  - 回滚:`git checkout package-lock.json`(未提交前)
- [x] **0.5 构建宿主包**(改用根 `npm run build:offline`,见发现登记 V5)
  - 前置:0.4 已装根 devDeps(coding-agent bundle 步需 esbuild)✅
  - 记:全链构建成功;四宿主包 dist/index.d.ts 全部存在 ✅(coding-agent bundle 77 files/9.0MiB)
  - 回滚:删 `packages/*/dist`(gitignore 内,无 git 影响)
- [x] **0.6 预检**:宿主包解析 + typebox 单实例
  - 前置:0.5 dist 存在 ✅
  - 记:R1 关键证据——ESM `import.meta.resolve` 四包全部解析到 monorepo dist(`packages/*/dist/index.js`,workspace 符号链接生效)。⚠️ 注意:CJS `require.resolve` 会报 `ERR_PACKAGE_PATH_NOT_EXPORTED`(两侧 exports `"."` 均只有 types+import 条件、无 require 条件)——与上游 pi 行为一致,非 evoharness 偏差;subagents 纯 ESM 不受影响(R9:typebox 全树单实例 1.3.27,dedupe 生效)
- [x] **0.7 基线**:`pi-subagents-main` 内 `npm install` + `npm run test:unit`
  - 前置:网络可用 ✅(仅新增 node_modules,源文件零改动)
  - 记:**tests 4235 / pass 4127 / fail 19**;错误码:15× EPERM(Windows symlink 权限)、1× EISDIR、1× ENOENT、rmSync EINVAL 等——**全部为 Windows 环境类失败,零上游真实代码失败**(已按用户授权归类为可跳过)。失败签名清单存 `docs/plan/subagents-port-baseline-failures.txt`,Phase 2 对比标准:移植后同样 19 个环境性失败 = 成功;出现新失败 = 移植引入
  - 完整基线日志:`/tmp/baseline-unit.log`(会话内)
- [ ] **0.8 检查点 0 提交**:①未改动原始拷贝 ②本跟踪文件
  - 前置:`git status` 符合预期;`docs/structure.md` 不入提交
  - 记:commit hash:①原始拷贝: ②跟踪文件:

---

## Phase 1 — 机械改名(零逻辑改动;详见 subagents-port.md §2 + 附录 A)

- [ ] **1.1 包名 4 映射全局替换**(预期 ~349 处;覆盖 src/test/*.mjs/*.cjs/*.json)
  - 前置:检查点 0 原始拷贝已入库(可 diff)
  - 记:逐映射计数(预期 114/85/77+7/66 附近):
    - `@earendil-works/pi-coding-agent` → `@evoharness/coding-agent`:
    - `@earendil-works/pi-agent-core` → `@evoharness/agent-core`:
    - `@earendil-works/pi-ai` → `@evoharness/ai`(+ `/compat` 7):
    - `@earendil-works/pi-tui` → `@evoharness/tui`:
- [ ] **1.2 内核 env 5 项 sed + theme Symbol 键**(文件清单 = subagents-port.md §2.3)
  - 前置:替换前 grep 现存计数与 §2.3 清单吻合
  - 记:逐 env 计数:`PI_CACHE_RETENTION`:_ `PI_OFFLINE`:4 `PI_CODING_AGENT_DIR`:2 `PI_PACKAGE_DIR`:1 `PI_PROGRAM_STATUS`:1 `Symbol theme`:1
- [ ] **1.3 package.json 重写**(§2.2:name/private/`"pi"`→`"evoharness"`/peer+devDeps/退役 bin+files+pack)
  - 前置:对照 §2.2 逐字段核对
  - 记:字段清单落位:
- [ ] **1.4 功能性 `.pi` 硬编码 3 处**(`mcp-direct-tool-allowlist.ts:224`、`agents.ts:1891`、`utils.ts:11 DEFAULT_CONFIG_DIR_NAME`)+ 核对 `model-resolution.ts:356` + `agent-refinements.ts:457` 正则;**不动 D4 两常量**(`artifacts.ts:6`、`worktree.ts:14`)
  - 前置:逐处读上下文确认改法,不盲改
  - 记:每处前后对照:
- [ ] **1.5 测试断言期望值同步**(与源码同 commit)
  - 前置:grep 全部受影响断言文件清单
  - 记:清单与数量:
- [ ] **1.6 四大子系统专项扫描**(native-supervisor-channel / intercom / rpc.ts / missions/)
  - 前置:扫描模式清单(A.3 类)备好
  - 记:发现逐条入 `packages/subagents/UPSTREAM-PORT-NOTES.md`:
- [ ] **1.7 附录 A.3 双模式残留审计**
  - 前置:命令逐条可执行
  - 记:全零?分拣结论:
- [ ] **1.8 检查点 1 提交** + 对照检查点 0 diff 抽查(确认 diff 全是"名字")
  - 前置:diff 抽查通过
  - 记:commit hash: / diff 统计:

---

## Phase 2 — 跑绿(红时只修"名字/路径/清单";逻辑类失败记录后停)

- [ ] **2.1 Gate 1 typecheck**(packages/subagents)——R13:强转类零覆盖,绿≠安全
  - 记:报错分类统计:
- [ ] **2.2 Gate 2 unit**
  - 记:红测试逐个归类(R3/R6/R7):
- [ ] **2.3 Gate 3 测试分诊落盘**(7 smoke 默认 skip;spawn-mock 类 ~17;纯本类 ~31;**需 API 或 Windows 不可跑的经用户授权直接跳过**)
  - 记:分诊表:
- [ ] **2.4 Gate 4 integration**(未被分诊拦截部分)
  - 记:红测试归类与处理:
- [ ] **2.5 Gate 5 smoke 矩阵**(§5.2 全 9 项,逐场景:启动方式/期望现象/结果)
  - 记:前台子代理: / 后台 bg_wait(R1 必测): / workflow: / council: / /reload: / 离线: / 模型目录: / theme/widget(R2 观察): / cache retention:
- [ ] **2.6 根 `npm run check` 分诊**(只修机械类)
  - 记:遗留清单:
- [ ] **2.7 检查点 2 提交** + 本文件收尾
  - 记:最终状态 / 遗留清单 / Phase 3 建议(D4 改名、自有常量改名、根 build 链插入):

---

## 发现登记(计划外发现,逐条编号;需回写 subagents-port.md 的标注 ⟲)

| # | 发现 | 影响 | 处置 |
|---|---|---|---|
| V1 | TS 双版本:根 7.0.2(原生)/ subagents 5.9.3;根 check 会以 7.0.2 扫 subagents 源码 | 2.6 分诊项 | **两阶段**:移植期双版本并存(npm 嵌套隔离;pi 内核自身即 7.0.2,已核实 pi-main package.json:68);全绿后如需统一,唯一方向是 subagents → 7.0.2 单独提交、测试当安全网。若根 check 摩擦严重,预案 = 将 packages/subagents 排除出根 tsconfig include(届时显式决策)(⟲ 已回写 subagents-port.md F19+§2.2) |
| V2 | yaml 双版本 2.9.0 / 2.8.3,嵌套隔离 | 低 | 无需处置(⟲ F20) |
| V3 | @types/node 双版本 22.19.19 / 24.13.3,嵌套隔离 | 低 | 无需处置(⟲ F20) |
| V4 | 源树内 `test/fixtures/pi-coding-agent-shim/node_modules/` 是**检入的 vendored 测试夹具**(假 pi 安装,内含 chord/pi-client dist),不是安装依赖 | 排除策略 | 已恢复;其内 `@earendil-works/*` 字符串纳入 Phase 1 改名与 A.3 审计范围(夹具应改为模拟 evoharness 安装) |
| V5 | 根 `npm run build` 在 packages/ai 的 `generate-models --strict` 处**网络抖动即整链失败**(在线拉取几十个 provider 目录);单独重试成功且未改 catalog。内核预存的网络依赖,与移植无关 | 构建命令 | **宿主构建统一用 `npm run build:offline`**(仓库自带变体,ai 跳过在线生成);后续 Phase 2.6 根 check 同理注意 |

---

## 回滚命令表

```bash
# 整体回滚(Phase 0–2 不动内核)
git checkout main
git branch -D feat/subagents-port
rm -rf packages/subagents            # 若分支删除前未清
git checkout package-lock.json 2>/dev/null; npm install
```
