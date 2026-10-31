# 交接文档 — apps/evoharness-web 移植与验证（2026-11-01）

> 写给下一个接手的人（人或 agent）。本文是**经验实录**：每个踩过的坑、当时怎么定位、怎么解决、
> 哪些没解决、为什么、下一步候选路线。配合 `docs/spec.md`（总 spec 与欠账表）、
> `docs/build.md`（构建平台诊断）、根 `docs/kernel/divergence.md` D-009/D-010、
> 根 `docs/decisions/0001-web-app-in-monorepo.md`（ADR）一起读。
>
> 分支：`feat/evoharness-web`（基于 main，**按所有者指示不合并回 main、不开 PR**）。
> 工作树在本文写作时除另一会话的 `docs/structure.md` 外全部干净。

## 快速现状

- **能用的**：`npm run dev`（127.0.0.1:30141）→ 浏览器完整 UI；会话创建、prompt 提交
  （无 key 时返回优雅的 provider 错误）、PTY 终端创建、定时任务/模型/技能/信任全部
  API 层验证通过。**`npm run test:web` 3028 用例全绿**；根 `npm run check` 全链绿
  （含 app eslint——对，lint 已经修通并进了门禁）。
- **不能用的**：`npm run build`（生产构建）——OOM，见下文。
- **门禁**：`check:web` = app tsc + eslint + 三个守卫 + 版本锁步，已接入根 `npm run check`
  与 pre-commit；`test:web` 已接入根 `npm test` 与 CI（ci.yml）。

## 工具链决定（先读这个，别"修复"它们）

1. **根 TypeScript = 6.0.3**（从 7.0.2 降级，所有者授权）。为什么：app 的 eslint 链
   （typescript-eslint 8.72）peer 上限 `<6.1.0`，TS 7 下拒绝加载。根 tsc 在 6.0.3 下
   全绿（实测）。**降级的代价**：`check-ts-relative-imports.mjs` 与
   `check-runtime-deps.mjs` 原来用 TS 7 专属的 `typescript/unstable/ast` +
   tsgo transformer API，已重写为 TS 稳定 API（语义等价）。**别升回 TS 7**：
   除非 typescript-eslint 发布 TS 7 支持，且两个守卫同步升级。
   实测无效的替代方案（别再试）：npm overrides 强制 peer 依赖（`typescript-eslint`
   → `typescript` 嵌套无效）；`eslint-config-next` 嵌套（同因）。
2. **dev 与 build 都走 webpack**（`next dev --webpack`）。Turbopack 把
   `serverExternalPackages` 里的 **workspace 符号链接包**重新打回 bundle：
   `packages/ai/dist` 进 server chunk → provider 懒加载变 "expression is too
   dynamic"；`quickjs-wasi` 的 WASM loader 解析不了 WASI 宿主模块。webpack 按
   request 名外化，对符号链接免疫。回 Turbopack 的前提：上游修复
   workspace-symlink externalization，然后**必须重验** provider 懒加载与 codemode
   链（契约测试 `lib/evoharness-sdk-contract.test.mjs` 会兜一部分）。
3. **打包/追踪根 = 仓库根**（`repoRoot`）。依赖被提升到根 `node_modules`；根钉在
   app 目录会让 Turbopack 看不见 `next` 本体（首个报错就是它）。代价：webpack
   模块图覆盖整仓（706 个顶层包 + 全部 `packages/*/dist`）。
4. **`experimental.webpackBuildWorker` + `webpackMemoryOptimizations` 无条件开启**
   （上游只给 desktop 构建开；本仓每个构建都背整仓图）。**实测它们救不了 OOM**（见下）。
5. **`packages/ai` 两处变量动态 import 加了 `/* webpackIgnore: true */
   /* turbopackIgnore: true */`**（D-009）：webpack 为变量 specifier 建空上下文，
   运行时 `node:fs` 解析失败 → 全 API 500。Node 语义零变化；浏览器路径有
   process 判别与 try/catch 兜底。**同型检查**：`packages/ai` 里 `*.lazy.ts` 的
   `lazyApi(() => import("./xxx.ts"))` 是**字面量** specifier（编译成确定模块引用），
   与变量型不同——已实测发消息触发 provider 懒加载链无崩溃；但若未来出现新的
   变量型动态 import，会复现同类问题。

## 问题与解决全记录

### 构建与打包平台

| # | 问题 | 定位方式 | 解决 | 状态 |
|---|---|---|---|---|
| 1 | Turbopack 报 "Could not find the Next.js package"，resolution root 钉在 app 目录 | 读 dev log 的 "Filesystem root used for resolution" | `turbopack.root` + `outputFileTracingRoot` → 仓库根 | 解决（但 Turbopack 本身随后被 webpack 取代，见 #2） |
| 2 | Turbopack 把 `serverExternalPackages` 里的符号链接包打进 bundle（`packages/ai/dist` 出现在 chunk 名），provider 懒加载运行时 "expression is too dynamic" | chunk 名 `packages_ai_dist_*` 直接暴露 | dev/build 全部 `--webpack`；`quickjs-wasi`、`@evoharness/codemode` 加 external | 解决（webpack 下 0 构建错误）；根因留上游 |
| 3 | quickjs-wasi 的 loader 导入 `env`/`wasi_snapshot_preview1` 虚拟模块，构建报 Module not found | 错误文件是 Turbopack **生成**的 loader（磁盘上不存在） | `quickjs-wasi` 加 external；webpack 下该链不再进 bundle | 解决 |
| 4 | **生产构建 OOM**：4GB/8GB/24GB 堆三档全崩（code 134，build worker 先死）；`webpackBuildWorker`+`MemoryOptimizations` 开着、dev 缓存清了也一样 | 三档对照实验排除堆大小与缓存；worker RSS 11GB 时仍在涨 | **未解决**。候选路线（按代价）：① 等 Turbopack 修 symlink externalization；② 调查 webpack 对 workspace 符号链接的 external 生效条件（若生效，图回到单 app 量级）；③ 32GB+ 堆/大内存 CI runner；④ 拆路由入口或拆 app | 记录于 `docs/build.md` |
| 5 | `experimental` 两个内存开关在移植时丢失（上游 desktop-only 门控被整段删） | 参照物 next.config 对照 | 无条件开启（本仓每构建背整仓图）；**但实测救不了 OOM**——记录修正了内存评审的预测 | 开关保留 |
| 6 | `.next/dev` 里 2GB 两代 bundler 缓存并存（turbopack 1.1GB 已废弃） | du + 文件名对照 | `rm -rf .next/dev`；`.gitignore` 加 `.next/` 等 | 解决 |

### 改名与移植机械层

| # | 问题 | 定位方式 | 解决 | 状态 |
|---|---|---|---|---|
| 7 | `.pi` 残留有**四种形态**：`.pi/`（正斜杠）、`".pi"`（独立字符串，179 处测试夹具）、`.pi\\`（反斜杠 Windows 路径）、`.pi\/`（正则转义） | 每轮守卫扫描的残留清单驱动 | 三轮 codemod：`.pi/` → `.pi"`（带 keep-list 前瞻）→ `.pi\\\\`/`.pi\\/` | 解决 |
| 8 | `PI_` 枚举的假阳性：`OPENAI_API_KEY` 含 `PI_KEY`、`SEARCH_API_BASE` 含 `PI_BASE` | 带 `\b` 左边界重枚举 | 显式改名清单（44 个）+ 8 个合法保留项白名单（mcp-import-cli 描述上游 pi CLI 的常量、模拟用户数据的测试夹具） | 解决 |
| 9 | 混合大小写夹具漏网：`Pi_Web_Password`（Windows 大小写不敏感擦除测试的诱饵）、`pi_web_password` | 守卫新增 `X-Pi-*`/`piWeb*` 形态后连锁发现 | 夹具改名（`EvoHarness_Web_Password`），测试意图不变 | 解决 |
| 10 | **自己的 codemod 丢下划线**：`name.slice(3)` 拼 `EVOHARNESS`+`WEB_PASSWORD` → `EVOHARNESSWEB_PASSWORD`（118 文件 633 处） | 残留扫描发现畸形 token | 修复 pass：`EVOHARNESS(?=[A-Z])` 插下划线；教训：**改名 codemod 的每个规则都要有残留断言** | 解决 |
| 11 | localStorage 键的第二连字符形态漏网（`pi-sound-enabled` 等 9 个）——盘点正则 `[a-z0-9]+` 不含连字符 | 全量 `\bpi-[a-z0-9-]+` 重扫 | 并入 blanket 规则 | 解决 |
| 12 | 深层 dist import 失效：测试用文件路径 `../node_modules/@evoharness/coding-agent/dist/...`，而包被提升到根 | tsc + 测试失败 | `import.meta.resolve("@evoharness/coding-agent")` + URL 拼接。注意 exports 只有 `import` 条件 → **必须用 ESM resolve，createRequire 不行** | 解决 |
| 13 | `X-Pi-Dest-Path` 头名两端一致地残留（守卫拦不到该形态） | 守卫补 `X-Pi-[A-Z]` 形态后立刻抓到 | 两端改名 + 守卫加形态 | 解决 |
| 14 | 守卫新形态立刻抓到测试夹具 `piWebFactory` | 同上 | 改名 `evoharnessWebFactory` | 解决 |
| 15 | 孤儿测试（宿主模块已删）：`app-updates.test.mjs` | 残留扫描 | 删除 | 解决 |
| 16 | 6 个测试读不存在的 `src-tauri` Rust 文件 | grep src-tauri | 删 Rust 断言（Phase 3 主体）、改桥断言、注释更新 | 解决 |
| 17 | `isTauriDesktop` 中心删除会断 26 个文件 | grep 全量清单（曾低估为 5/8） | `lib/host.ts` + `isDesktopHost()` 全量切换；`lib/desktop-*.ts` 保留签名做适配层（24 消费者零改动） | 解决 |
| 18 | `components/desktop/` 不可删（AppShell 直接 import WindowControls 等） | grep import 链 | 编译到桥 no-op，Phase 3 填 electron 实现 | 解决 |
| 19 | spec 写错包名 `@evoharness/agent`（实际 `@evoharness/agent-core`）、符号数 15→16、测试 230→408 | 外部评审 + 实测 | 已修 | 解决 |
| 20 | spec 的 R9 写错（`outputFileTracingRoot` 原样保留 configDir 在 monorepo 是错的） | 外部评审 + 运行实测 | 已修 + 记录 | 解决 |

### 运行时与测试

| # | 问题 | 定位方式 | 解决 | 状态 |
|---|---|---|---|---|
| 21 | **变量动态 import 被 webpack 编成空上下文**：运行时 `node:fs/os/path` 每次路由加载抛错，全部 API 500 | 生成 chunk 里的 `webpackEmptyAsyncContext` + `"(rsc)/../../packages/ai/dist lazy recursive"` | D-009：两处 `webpackIgnore/turbopackIgnore`（auth/context.ts、env-api-keys.ts——后者还有 `"node:"+"fs"` 字符串拼接形态） | 解决 |
| 22 | `ts.getParsedCommandLineOfConfigPath` 在 TS 6 不是顶层导出 | 守卫重写后运行报错 | 改 `ts.readConfigFile` + `ts.parseJsonConfigFileContent` 两步 | 解决 |
| 23 | 重写守卫忘导入 `sep`/`dirname` | 运行 ReferenceError | 补导入 | 解决 |
| 24 | **`npm run test:web` 偶发整进程硬崩**（exit 3221225794） | 崩前无错误输出；并发 4 时出现 | 降 `--test-concurrency=2` 后稳定全绿。疑似 worker 内存压力；如频繁复现，考虑给 test 脚本加 `NODE_OPTIONS=--max-old-space-size` | 缓解 |
| 25 | `lib/mcp-host.test.mjs` idle-out 用例**间歇失败**（隔离 1/3，负载下更高） | 三次隔离复跑对照 | 真实毫秒时序竞争，上游测试设计固有，与改名无关。不动断言；已记录于 spec 欠账表 | 记录 |
| 26 | PTY：**应用内 spawn 秒退 exit 5**，独立探针（同 node-pty、同 shell、同 cwd）完全正常 | 二分：探针成功 → 差异在 spawn env（npm 注入变量/环境差异），未完全定位 | e2e/terminal.mjs 是权威验证（自带 env + 真实 UI 路径）；生产构建修好后以 `E2E_SERVER_MODE=start` 跑 | 部分定位 |
| 27 | node-pty 在 `--ignore-scripts` 下可用性 | DoD 实测 | Windows 预编译产物直接可用（`node -e "require('node-pty')"` 通过）；`bin/prepare-terminal.js`（postinstall）只做 macOS chmod，缺它无影响 | 解决 |
| 28 | playwright chromium 下载被 DNS 劫持（cdn.playwright.dev 证书是 IP） | 证书 altnames 全是 IP | `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`（与 parked.md 的既定方案同源） | 解决 |
| 29 | dev 下 UI 的 ARIA 快照在水合期几乎为空、合成键盘事件被吞、Send 点击超时 | 截图对照（截图显示完整 UI） | 交互验证改为 **API 级**：`POST /api/agent/new {cwd, type:"ensure_session"}` → 200+sessionId；prompt → 优雅 provider 错误（"No API key... Use /login"，`prompt_rejected`）→ **provider 懒加载链实测无崩溃** | 解决（验证策略层面） |
| 30 | i18n 占位符残留 "Message Pi…" | 截图发现 | i18n 值层改名（守卫的 `pi-` 形态已拦，值为上游产品名的除外） | 解决 |

### 流程与工具

| # | 问题 | 解决/教训 | 状态 |
|---|---|---|---|
| 31 | `taskkill //IM node.exe` 是霰弹枪：误杀了后台构建**和**其他会话的 node 进程 | 改为按 PID/端口清理；后台任务用 TaskOutput 轮询而不是反复起停 | 教训记录 |
| 32 | 管道尾掩盖退出码：`npm run build 2>&1 \| tail` 的 "exit 0" 是 tail 的——构建其实被误杀 | 关键命令用 `PIPESTATUS` 或不看管道尾 | 教训记录 |
| 33 | node -e 内嵌 JSON 的多层转义反复失败（JSON 无效/截断） | 临时 JSON 文件 + `--data-binary @file`，或干脆 node fetch 脚本 | 教训记录 |
| 34 | 多会话竞争：`structure.md` 是另一会话的在途大改；`package.json` 曾被并发修改 | 全程不碰他人在途文件；每次动手前重读；AGENTS.md 的多会话规矩是真 needed | 持续有效 |
| 35 | 提交被 pre-commit 的**锁文件门禁**静默拦截（`-q` + grep 吞了失败输出） | 去掉过滤看真实输出；TS 降级的 lockfile 变更走 `EVOHARNESS_ALLOW_LOCKFILE_CHANGE=1` | 教训记录 |
| 36 | eslint 新规则（react-hooks/preserve-manual-memoization）对上游手工 memo 模式报 13 处 | 上游同 config 已禁 3 条同类规则；加第 4 条禁用并注释理由（不改上游代码结构） | 解决 |
| 37 | 我自己留下的死代码被 lint 抓到（asPathArray、SettingsPanel 孤儿 onBusyChange/busy 链）——**busy 的三处守卫在功能删除后恒为 false** | 删死代码；守卫简化为无条件关闭并注释原因 | 解决 |
| 38 | spec 三处字段错误被外部评审纠正（agent-core 包名、16 符号、408 测试）；评审也有两处不准确被我纠正（lazy.ts 是字面量；内存开关上游本就 desktop-only）——**双方都要实测** | 已双向修正并记录 | 解决 |

## 未解决 / 欠账（按优先级）

1. **生产构建 OOM**（≥24G 堆，三档实验全崩）。诊断与四条候选路线见 `docs/build.md`。
   在此之前：开发用 dev 模式；发布管道（打包/桌面壳）被此阻塞。
2. **terminal e2e**（`E2E_SERVER_MODE=start`）依赖生产构建 → 同被阻塞。
   dev 模式的替代证据：独立探针成功 + 创建 API 200 + e2e/terminal.mjs 待跑。
   应用内 spawn 秒退（exit 5）的 spawn-env 差异未完全定位。
3. **Turbopack 回归**：上游修 symlink externalization 后回 Turbopack（同时解决 dev
   一致性与构建内存），需重验 provider 懒加载 + codemode + quickjs 链。
4. **`structure.md` 两处编辑未落**（§2 树加 `evoharness-web`、§3.1 vendored 例外）：
   另一会话在途大改（六条→七条原则），规矩是不碰在途文件。其落地后第一个 docs
   提交补上；期间由本 spec、根 AGENTS.md 的 app 节与守卫豁免注释代行。
5. **MODULE_TYPELESS 警告**（399 个 .ts 测试文件重解析开销）：app 无 `"type":"module"`。
   改造涉及 bin CJS 重命名与打包链验证，收益是去掉每次测试的警告与重解析开销；
   Phase 2 再议。
6. **Phase 2 剩余**：89 条路由逐域人工验收（spec §4 顺序表）；`test:e2e` 八件套
   跑通；`npm run build` 修复后复验。
7. **Phase 3/4**：Electron 桌面壳、打包、自更新——所有者明确暂不做；`lib/host.ts`
   接缝与 web 降级已就位。
8. **已知抖动**：mcp-host idle-out 用例（见上表 #25）。
9. **守卫小项**：doc-links 对目录链接的误报边缘；vendored 根常量在两个守卫脚本里
   各存一份（如需单一来源可提取 `scripts/lib/web-app-root.mjs`）。
10. **上游语境残留**：三篇移植文档已注记未随迁工具，但 `docs/ownership-boundaries.md`
    里仍有上游文件路径叙述——读的时候按"上游语境"理解。

## 常用命令

```bash
# 门禁（每步都过 pre-commit 与 CI 的部分）
npm run check            # 根全链（含 check:web：app tsc + eslint + 三守卫 + 版本锁步）
npm run test:web         # app 3028 用例（node --test，并发 4；偶发崩则降 2）

# 开发
cd apps/evoharness-web && npm run dev    # http://127.0.0.1:30141（webpack）
# 改过 packages/*/src 后：根目录 npm run build:offline，再回 app 验证

# 生产构建（当前 OOM，见 docs/build.md）
NODE_OPTIONS="--max-old-space-size=24576" npm run build

# e2e（playwright chromium 已装；下载被劫持时用
# PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright）
node e2e/terminal.mjs                    # 需无活动 dev server
E2E_SERVER_MODE=start node e2e/terminal.mjs   # 跑生产构建（构建修复后）

# 残留扫描（改完上游拷贝必跑）
node scripts/check-web-names.mjs && node scripts/check-web-boundary.mjs
```

## 红线（重申，违反即打回）

1. `packages/**` 对 app 工作保持只读（core 修改要走 divergence.md + 所有者批准，
   如 D-009/D-010 的先例）。
2. 门禁红了只能改代码，不能改门禁；豁免必须带理由注释（先例：check-web-names
   头部、check-file-size 的 vendored 注释）。
3. 随迁测试不得改软断言；机械改名进测试文件不算改断言。
4. 不开 PR、不合并回 main（所有者指示）；`docs/structure.md` 属另一会话，勿动。
5. 上游产品名 "pi" 在**引用上游**的语境（i18n 的 mcp 导入来源、注释）保留——守卫
   白名单有清单，扩展需理由。
