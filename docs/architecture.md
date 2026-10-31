# EvoHarness 运行时架构（Architecture）

> 本文档回答另一个问题：**系统在运行时怎么跑** —— 一次请求从输入到落盘经过哪些环节、每个环节谁负责、扩展点在哪里、失败怎么收场。
> 代码该放哪儿见 [`structure.md`](./structure.md)；内核能不能改见根目录 [`KERNEL.md`](../KERNEL.md)。
>
> 本文只写到"职责与顺序"这一层，不下沉到函数与实现细节 —— 那些以代码和测试为准，写进文档必然漂移。

---

## 1. 一次 turn 的全景

```
用户输入
  │
  ├─ surface 采集（TUI 编辑框 / RPC 请求 / print 模式参数）
  │
  ▼
kernel.session        把消息挂到当前分支，标记未持久化
  │
  ▼
kernel.context        组装请求：system 片段 + 历史 + 工具声明 + 能力片段
  │
  ▼
kernel.loop           ──► platform.ai.stream()  ──► 模型
  │                          │
  │                          ├─ 文本增量 → kernel.events → surface 增量渲染
  │                          └─ 工具调用 → kernel.policy 审批
  │                                            │
  │                                            ▼
  │                                       capability.execute()
  │                                            │
  │                          ◄─────────────────┘ 结果写入 session
  │
  ├─ 还有待执行的工具调用 / 队列里还有消息？ → 回到 loop（下一 turn）
  │
  ▼
kernel.compaction     超过阈值时压缩历史
  │
  ▼
session 落盘 + platform.telemetry 记录
```

一次 turn 的边界是"模型请求 → 工具结果回灌"。工具调用可以连续多轮，但只有模型请求推进 turn。

---

## 2. 七个运行时角色

| 角色 | 运行时职责 | 不该做的事 |
|---|---|---|
| apps | 决定这次启动装配哪些能力、用哪个 surface、读哪份配置 | 不参与决策、不拼提示词 |
| surfaces | 把事件渲染成人能看的东西，把人的操作变成输入 | 不直接调用能力、不判断权限 |
| features | 把一个用户可感知的功能拼起来：契约 + 后端装配 + 面板 | 不注册自己的能力条目；不直接碰内核 |
| capabilities | 执行一个有副作用的动作，或提供一段上下文事实 | 不访问别的能力、不存自己的状态、不带 UI |
| runtime-kit | 给上层提供存储、定时、生命周期三件共享服务 | 不起 turn、不拼上下文、不执行工具 |
| kernel | 推进 turn、维护会话、组装上下文、路由工具、执行策略 | 不知道任何具体能力/UI/provider |
| platform | 供给模型调用、遥测、持久化、远程执行、插件契约 | 不认识 agent 语义 |

**运行时只有一条**：所有模式（TUI / print / RPC / SDK）走的都是 `Agent` → `runAgentLoop` 这一条 loop。`durable` 不是第二条 loop，它是被 `runtime-kit/storage` 调用的窄后端；它的 agent 循环不启用。

---

## 3. kernel 的八个模块

| 模块 | 职责 | 关键不变量 |
|---|---|---|
| `loop` | 推进 turn、串行化工具调用、处理中断与重试边界 | 同一时刻只有一个 turn 在跑；中断不会留下"半条"工具结果 |
| `session` | 消息树、分支、当前分支游标、恢复、导出 | 每条消息有唯一父子关系；恢复后的分支与崩溃前一致 |
| `context` | 组装 system 片段与历史，决定哪些能力片段进入请求 | 片段来源可追溯：每条片段能说出"谁给的" |
| `registry` | 能力与工具的注册、查找、按会话过滤 | 注册是显式的；不存在按名字的隐式分支 |
| `policy` | 权限判定与审批（路径、网络、进程、屏幕） | 任何有副作用的动作都先过 policy，没有旁路 |
| `events` | 生命周期事件总线（turn/tool/message/session） | 事件只读、失败不影响主流程 |
| `compaction` | 按阈值压缩历史，保留可回溯的摘要 | 压缩不丢事实：原始消息仍在会话文件里 |
| `hooks` | 扩展挂点：tools / events / sections（以及待建的 turn_request、storage、schedule） | 挂点是唯一入口；新增用法先归档到 `KERNEL.md` |

---

## 4. 上下文组装顺序

请求的 system 部分按固定顺序拼接，后加入的片段不能覆盖前面的规则：

1. **preamble**：产品身份与边界（"运行在 evoharness 里"、环境变量前缀、如何查看当前模型）
2. **tools**：本次会话实际可用的工具，逐个一行说明
3. **rules**：行为约束（何时读文件、何时跑命令、输出格式）
4. **docs**：怎么读 evoharness 自己的文档
5. **cwd**：当前工作目录
6. **能力片段**：各 `cap-*` 提供的 context fragment（按注册顺序，带来源标记）
7. **project context**：`AGENTS.md` / `CLAUDE.md` 等项目级指令
8. **addendum**：`--append-system-prompt`

组装规则：片段是**追加**而非替换；同一主题只有一处权威（例如工具说明不在 rules 里重复）。这让"加一个能力"永远不需要改 `context` 的实现，只需要该能力提供自己的片段。

---

## 5. 一次工具调用的完整路径

```
模型返回 tool_call
  → registry 按名字解析（找不到即结构化错误，不是异常）
  → policy 判定：允许 / 需要审批 / 拒绝
      需要审批 → surface 弹出确认（TUI 对话框 / RPC 回调）
      拒绝     → 以"被拒绝"作为工具结果回灌，模型看得见
  → capability.execute(args, signal)
      超时 / 中断 → 结果标记为中断，附已完成部分
  → 结果规范化（截断、二进制转引用、错误分类）
  → 写入 session（tool result 消息）
  → events 广播（供 surface 渲染与 telemetry 采样）
```

三个必须成立的性质：

1. **没有旁路**：任何工具执行都经过 policy，包括内置工具与 MCP 工具。
2. **失败是数据**：工具错误、被拒绝、超时都变成模型可读的结果，而不是抛到进程外。
3. **结果可回放**：会话文件里的工具结果足以重建当时的判断，不需要重跑。

---

## 6. 会话、分支与持久化

- 会话是**消息树**，当前分支由游标决定；`fork` 复制到新会话，`branch` 在树内切换。
- 每条消息落盘前有唯一 id；崩溃恢复以最后一条完整消息为界，不猜半条。
- 恢复时校验工作目录：目录不存在或不可写时，先问用户而不是静默新建。
- 压缩在 turn 边界触发，不是随时；压缩结果作为一条摘要消息进入树，原始消息保留。

---

## 7. 模型调用路径

```
context 组装完成
  → 解析 provider/model（会话选择 > CLI 参数 > 设置默认）
  → 取凭据（auth.json / 环境变量 / OAuth，按 provider 声明）
  → 组装请求（工具声明、thinking 级别、缓存标记）
  → platform.ai 流式请求
      超时 → 分类（连接/首字节/空闲），按类型决定重试
      限流 → 退避重试，超过次数返回可读错误
      上下文溢出 → 触发压缩后重试一次
  → 增量事件 → kernel.events → surface
```

模型目录（provider 列表、上下文窗口、是否支持 thinking/images）来自 `ai` 的目录层，可被远程目录覆盖；**目录不可用时回落到随包发布的数据**，启动不因此失败。

---

## 8. 扩展点

| 想扩展 | 正确入口 | 不需要改动 |
|---|---|---|
| 给模型新动作 | `cap-*` 的 `tools[]` | kernel、context、surface |
| 给模型新事实 | `cap-*` 的 `context[]` / section 片段 | `system-prompt.ts` |
| 用户能感知的新功能 | `feature-*`（contract + host + client） | kernel；client 只用 `tui` 原语 |
| 多个功能共享的存储/定时/生命周期 | `runtime-kit` | kernel（除非需要 `turn_request`） |
| 换模型提供方 | `ai` 的 provider 目录 | kernel、surface |
| 新界面 / 新协议 | `surface-*` | 能力实现 |
| 新持久化后端 | `runtime-kit/storage` 的 adapter（`durable` 是其一） | 业务层 |

不在此列的需求（例如"改变 turn 的推进语义"、"让扩展主动发起一轮"）属于内核变更，走 `KERNEL.md` 的 A/B/C 三档，不在这里开口子。

---

## 9. 失败与中断

| 情况 | 行为 |
|---|---|
| 用户中断（Esc / Ctrl+C） | 取消当前请求与工具，保留已产生的内容，会话仍可继续 |
| 工具超时 | 结果标记超时并回灌；进程不退出 |
| LLM 连续失败 | 按类型退避；耗尽后返回可读错误，会话保持在最后一个完整 turn |
| 进程崩溃 | 写 crash log；下次启动按最后完整消息恢复，不自动重放工具调用 |
| 遥测不可用 | 静默降级，不影响请求路径 |

原则：**任何外部依赖的失败都不能让会话数据处于半写状态**。

---

## 10. 与其它文档的边界

| 问题 | 看哪里 |
|---|---|
| 这个文件放哪儿、什么时候允许它出现 | [`structure.md`](./structure.md) |
| 内核能不能改、改动要留什么记录 | [`KERNEL.md`](../KERNEL.md) |
| 和上游 pi 相比我们改了什么 | [`kernel/divergence.md`](./kernel/divergence.md) |
| 要做什么、先做什么、什么不做 | [`structure.md`](./structure.md) §9 过渡条件表；长期路线待 `docs/decisions/` |
