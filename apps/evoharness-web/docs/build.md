# 构建与内存（apps/evoharness-web）

本文记录移植后构建平台的三个关键决定与一个**未解决**的问题。

## 已定

1. **打包/追踪根 = 仓库根**（`next.config.ts` 的 `repoRoot`）。依赖被提升到根
   `node_modules`；追踪根钉在 app 目录会让 Turbopack 看不见 `next` 本体。
   代价：webpack 的模块图覆盖整个仓库（706 个顶层包 + 各 `packages/*/dist`）。
2. **dev 与 build 都走 webpack**（`--webpack`）。Turbopack 会把
   `serverExternalPackages` 里的 workspace 符号链接包重新打回 bundle：
   `packages/ai/dist` 出现在 server chunk，provider 懒加载变成
   "expression is too dynamic"，`quickjs-wasi` 的 WASM loader 无法解析。
   webpack 按 request 名外化，对符号链接免疫。回到 Turbopack 的前提是
   上游修复 workspace-symlink externalization，届时重验
   provider 懒加载与 codemode 链（见 `lib/evoharness-sdk-contract.test.mjs`）。
3. **`webpackBuildWorker` + `webpackMemoryOptimizations` 对所有构建开启**
   （上游只给 desktop 构建开；本仓每个构建都背整仓图）。

## 未解决：`next build --webpack` 在 ≥24GB 堆下仍 OOM

实测：默认 4GB 堆、8GB（`NODE_OPTIONS`）、24GB 三档全部 OOM（code 134，
worker 先死）。dev 模式完全正常，生产构建从未产出。诊断：

- 模块图 = 整仓 + 88 个 route 入口 + `instrumentation` 拉入的 SDK；
  24GB 堆下 worker RSS 到 11GB 后仍在增长，属图规模问题而非泄漏。
- 已排除：dev 缓存干扰（清理后复现）、两个实验开关（开着复现）、
  泄漏（多档堆一致）。

候选路线（按代价排序；2026-11-01 外部审计后重排）：
1. **`webpack resolve.symlinks: false`（第一优先实验）**：D-009 的空上下文证据证明
   `packages/ai/dist` 被 webpack 编进了 server 图——即 `serverExternalPackages` 对
   workspace 符号链接**在 webpack 下同样不生效**（这才是图爆炸根因，与追踪根无关）。
   让符号链接包按 node_modules 路径解析、按 request 名匹配外化，图应回到单 app 量级。
   app 配置级改动；须同时重验 dev（符号链接语义变化）与 provider 懒加载/codemode 链。
2. 等 Turbopack 修复 symlink externalization 后回 Turbopack（同时解决 dev 一致性）。
3. 「追踪根钉回 app 目录」的实验**只适用于 Turbopack**：hoisted 依赖在根
   `node_modules`，webpack 钉回 configDir 预计解析 `next` 本体即失败，测不了 OOM。
4. 构建机器升到 32GB+ 堆（本机 32GB 内存下 24GB 仍不足）或 CI 大内存 runner。
5. 拆 route 入口或拆分 app（最重，最后考虑）。

在此之前：**开发用 dev 模式，不依赖生产构建**；发布管道（打包/桌面壳）在 Phase 3/4 前需先解决本项。
