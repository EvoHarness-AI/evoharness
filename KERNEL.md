# KERNEL

`evoharness` 的内核是从 `pi` 派生的**自有运行时**，不是"不可触碰的第三方依赖"，也不是"随手可改的私有代码"：它是本项目的底层，**允许改，但要按档位改、要留下记录**。

放弃"冻结"的理由很直接：一旦确定将来要改内核，冻结只会把改动变成没有落点的例外，最后以"偷偷打补丁"的形式发生在最深处，既没有测试也没有记录。**能被改的边界，比宣布不变的边界更安全。**

自 `0.0.2` 起本项目独立演进，不再合并上游 `pi`。因此这里不讨论"与上游保持同步"，只讨论"本项目内部的可改边界"与"已做过的决策"。

## 1. 内核现在在哪

迁移完成前，内核在物理上是分散的：

| 部分 | 位置 | 迁移后 |
|---|---|---|
| loop、transport、状态管理 | `packages/agent`（包名 `@evoharness/agent-core`） | `packages/kernel/src/loop` |
| 会话、分支、恢复 | `packages/coding-agent/src/core/session-*` | `packages/kernel/src/session` |
| 上下文组装 | `packages/coding-agent/src/core/system-prompt.ts`、`resource-loader.ts` | `packages/kernel/src/context` |
| 能力/工具注册 | `packages/coding-agent/src/extensions/`、`core/extensions/` | `packages/kernel/src/registry` |
| 权限与审批 | 分散在 `core/tools/*`、`project-trust.ts` | `packages/kernel/src/policy` |
| 事件总线 | `packages/coding-agent/src/core/event-bus.ts` | `packages/kernel/src/events` |
| 压缩 | `packages/coding-agent/src/core/compaction/` | `packages/kernel/src/compaction` |

迁移完成后，本表换成一句"内核 = `packages/kernel`"，并删除上表。

## 2. 边界规则

- 内核**不得 import 产品层**（任何 `cap-*`、`surface-*`、`apps/*`）。反向依赖由 `check:package-layers` 机器拦截（所拦语义见 `docs/structure.md` §10）；`cap-*` 之间的 descriptor 依赖等 `check:capability-boundaries` 落地后再由它拦（出现条件：`packages/capability` 落地）。
- 产品层访问内核**只走公共导出**。门面（`packages/kernel` 的 `exports`）建立后，能力包连内核的内部文件路径都不该出现。
- 门面只导出被批准的能力，**禁止 `export *`**；只在有真实消费者时增加子路径。
- 内核不承载产品语义：UI、命令、皮肤、安装器、发布流程、具体 provider 都不进内核。

**改内核时先问一句：这个改动能不能只在门面这一层吸收？** 能，能力包一行都不用动。

## 3. 三档变更

任何内核改动先归档，再按该档要求做。**跳档 = 失败。**

| 档 | 内容 | 门槛 |
|---|---|---|
| **A 加扩展点** | 新 hook、新注册点、新 storage 后端、新 provider 目录字段、带回归测试的 bug 修复 | 直接改。补契约测试，更新 `docs/architecture.md` §3，门面加对应子路径。**不需要 ADR** |
| **B 改语义** | 消息 schema、turn 推进语义、工具结果结构、policy/审批语义、持久化 kind、配置项含义 | ADR（`docs/decisions/`，未建前记入 `docs/kernel/divergence.md`）+ 数据迁移脚本 + 契约测试，**同一次改动全绿**；破坏已存数据时必须写回滚说明 |
| **C 结构手术** | 拆包、换 transport、换持久化格式、改包边界、改运行期加载方式 | 先停功能开发，ADR，一次改完，**禁止半跟**；完成后同步更新 `tsconfig` / 守卫 / CI / `docs/structure.md` |

判据：**这次改动会不会改变已经写进存储的事实，或改变别人依赖的语义？** 会 → B；不会 → A。改动跨包且没有增量路径 → C。

### 3.1 待批的扩展点（A 档，尚未实现）

下列三项属于"现有挂点覆盖不到"的需求。它们未落地前，扩展**不得**自造等价物（自己的 timer、自己的上下文拼装、自己的消息注入），否则会静默绕过 policy 与审计。

| 扩展点 | 用途 | 现状 | 未批前的替代 |
|---|---|---|---|
| `turn_request` | 扩展请求开始一轮（proactive / schedule / RSI），携带来源标记，由 kernel 决定是否接受并走 policy | 未实现 | 只能由外部驱动（CLI 定时、RPC 调用）或用户手动触发 |
| `storage` | `ExtensionContext` 暴露命名空间化持久化句柄 + 迁移注册 | 未实现（现在只有只读 `sessionManager`） | 只能经 `runtime-kit/storage` 的外部库，不得直连 `durable` |
| `schedule` | 扩展把定时注册给 kernel 的空闲调度器 | 未实现 | `runtime-kit/schedule` 自带 timer，但**不得自己起 turn** |

这三项是"不动内核"承诺的唯一例外。每一项落地都要：ADR（记入 `docs/kernel/divergence.md`）+ 契约测试 + 在 `docs/architecture.md` §3 更新 `hooks` 行。

## 4. 决策与偏离账本

位置：[`docs/kernel/divergence.md`](docs/kernel/divergence.md)。

**本项目自 `0.0.2` 起独立演进，不再跟随上游 `pi`。** 账本因此不记录"上游状态"，只记录：ID（`D-xxx`）、档位、位置、改了什么、为什么、影响面、用什么测试兜住。没有测试兜住的 B 档改动不允许合并。

账本只增不删；**ID 稳定且不复用**；决策被推翻时在标题标 `superseded by D-xxx`，保留正文。

## 5. 与其它文档的分工

| 问题 | 看哪里 |
|---|---|
| 文件该放哪儿 | [`docs/structure.md`](docs/structure.md) |
| 运行时怎么跑 | [`docs/architecture.md`](docs/architecture.md) |
| 和上游差在哪 | [`docs/kernel/divergence.md`](docs/kernel/divergence.md) |
| 提交门槛 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
