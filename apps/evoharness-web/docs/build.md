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

候选路线（按代价排序）：
1. 等 Turbopack 修复 symlink externalization 后回 Turbopack（同时解决 dev 一致性）。
2. `serverExternalPackages` 对 workspace 符号链接的 webpack 行为调查——
   若能让 `@evoharness/*` 真正外化，图规模回到"一个 app"的量级。
3. 构建 \u673a\u5668\u5347\u5230 32GB+ \u5806\uff08\u672c\u673a 32GB \u5185\u5b58\u4e0b 24GB \u4ecd\u4e0d\u8db3\uff09\u6216 CI \u5927\u5185\u5b58 runner\u3002
4. \u62c6 route \u5165\u53e3\u6216 \u62c6\u5206 app\uff08\u6700\u91cd\uff0c\u6700\u540e\u8003\u8651\uff09\u3002

\u5728\u6b64\u4e4b\u524d\uff1a**\u5f00\u53d1\u7528 dev \u6a21\u5f0f\uff0c\u4e0d\u4f9d\u8d56\u751f\u4ea7\u6784\u5efa**\uff1b\u53d1\u5e03\u7ba1\u9053\uff08\u6253\u5305/\u684c\u9762\u58f3\uff09\u5728 Phase 3/4 \u524d\u9700\u5148\u89e3\u51b3\u672c\u9879\u3002
