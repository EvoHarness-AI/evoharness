# ADR-0001 · Web 前端以 vendored 移植体进入 monorepo

状态：已采纳（2026-11-01）。对应 spec：`apps/evoharness-web/docs/spec.md`。

## 背景

evoharness 需要一个 Web 前端。候选路线：从零自研、或整体移植上游生态里已验证的实现
（pi-agent-desktop：Next.js 16 + 89 条 API 路由 + 约 4.9 万行驱动层 + 3000 个单测 + 14 个 e2e，
MIT）。移植对象与 `@evoharness/*` 包是同一份代码的两种品牌（fork 快照），SDK API 面完全一致。

## 决策

1. **进仓成 workspace 成员**（`apps/evoharness-web`），不做仓外 `npm link`。
   仓外链接会因为 `@evoharness/*` 从未发布而在依赖解析上 404；进仓让
   "改 packages → build → app 立即可见" 成立，也让 `@evoharness/*` 的依赖闭包
   由 workspace 一次性解决。
2. **dist-first 契约**：app 只允许 import `@evoharness/*` 的公共 exports（指向
   `dist/`），禁止 `packages/*/src`；`packages/**` 也禁止 import app。双向守卫在
   `scripts/check-web-boundary.mjs`。
3. **vendored 例外**：app 内不适用根仓的 1500 行棘轮与 ts-import 约定（上游文件
   的体积与形态由上游拥有，改动原则是"最小偏离"）。豁免在两个守卫脚本头部注释。
4. **品牌与标识机械改名**：包名、`PI_*` 环境变量、`.pi` 目录、`pi-web` 品牌族全部
   改为 `evoharness` 系；由 `scripts/check-web-names.mjs` 守住零残留。

## 后果（运行平台的关键决定，均由实测驱动）

- **dev 与 build 都走 webpack，不走 Turbopack。** Turbopack 会把
  `serverExternalPackages` 里的 workspace 符号链接包重新打回 bundle
  （`packages/ai/dist` 出现在 server chunk 里），触发两类运行时崩溃：
  provider 懒加载的动态 import 变成"too dynamic"，`quickjs-wasi` 的 WASM
  loader 无法解析 WASI 宿主模块。webpack 按 request 名外化，对符号链接免疫。
  回到 Turbopack 的前提：上游 next 修复 workspace-symlink externalization，
  届时需重新验证 `packages/ai` 的 provider 懒加载与 codemode 链。
- **`outputFileTracingRoot` 与 `turbopack.root` 指向仓库根**（不是 app 目录）：
  依赖被提升到根 `node_modules`，追踪根钉在 app 目录会让 Turbopack 看不见
  `next` 本体。代价是 NFT/打包的模块图覆盖整个仓库——上游为此开在
  `isDesktopBuild` 里的 `webpackBuildWorker` + `webpackMemoryOptimizations`
  在本仓对**所有构建**开启（构建图变小仓库一个数量级）。
- **`packages/ai` 的两处变量动态 import 加了打包器豁免注释**（D-009，
  `docs/kernel/divergence.md`）：webpack 会为变量 specifier 建空上下文，
  运行时 `node:fs` 等 内建解析失败、全部 API 500。Node 语义零变化。
- 桌面壳（Electron）是后续阶段：接缝已立在 `lib/host.ts`
  （`window.__evoharnessDesktop`），web 降级实现已就位。

## 测试兜底

- app 自身：`npm run test:web`（约 3000 个移植单测，含 SDK 契约测试
  `lib/evoharness-sdk-contract.test.mjs`：6 个 dist 模块 + 16 个私有符号）。
- 根仓门禁：`check:web`（app tsc + rename-residue / boundary / doc-links
  三个守卫 + 版本锁步断言），已接入根 `npm run check` 与 pre-commit。
- 结构性红线：`packages/**` 零 diff 由评审对照执行 spec 白名单核查。
