# docs 导航

`docs/` 只放**描述**：系统怎么跑、文件放哪儿、和上游差在哪。
**规范放根目录**，因为它们是 agent 与贡献者的第一道门。

## 谁回答什么问题

| 你的问题 | 文档 | 位置 |
|---|---|---|
| 我作为 agent 必须遵守什么 | `AGENTS.md` | 根 |
| 内核能改到什么程度、改动怎么记账 | `KERNEL.md` | 根 |
| 提交代码的门槛是什么 | `CONTRIBUTING.md` | 根 |
| 怎么报安全漏洞 | `SECURITY.md` | 根 |
| 这个文件该放哪、什么还不该建、什么时候才能建 | [`structure.md`](./structure.md) | docs |
| 现在有哪些包、改一个需求落在哪个目录（现状） | [`packages/README.md`](../packages/README.md) | packages |
| 系统现在怎么运行（一次请求经过哪些环节） | [`architecture.md`](./architecture.md) | docs |
| 内核做过哪些决策与偏离（D-xxx） | [`kernel/divergence.md`](./kernel/divergence.md) | docs |
| 怎么用 CLI / 配置 / 扩展 / SDK（使用者文档） | `packages/coding-agent/docs/` | 包内 |
| 要做什么功能、先做什么 | [`structure.md`](./structure.md) §9 过渡条件表；长期路线待 `docs/decisions/` | docs |
| 现在不做、将来什么条件成立才值得做 | [`plan/parked.md`](./plan/parked.md) | docs |
| 某条决定当初为什么这么定 | `docs/decisions/`（未建，出现条件见 `structure.md` §7） | — |
| 某类 AI 开发失效该怎么防、别人怎么解的 | [`ai-failure-modes.md`](./ai-failure-modes.md) | docs |

## 写文档的规矩

1. **一篇文档回答一个读者问题。** 写不出一句"它回答什么"，说明它该拆。
2. **不写状态、不数东西。** "现有 N 个脚本""守卫生效 N 条"这类句子一旦写下就开始漂移；要数就写命令（`ls scripts/`、`git ls-files`、看 `package.json`）。文档只写**规则**与**原因**。
3. **未建的目录不落盘，但可以出现在 `structure.md` 的树里并标 `[未建]`。** 两者说的是不同的事：树回答"将来放哪儿"，`git ls-files` 回答"现在有什么"。空目录不建。
4. **同一个事实只有一处权威。** 别处引用"见 X"，不复述正文。
5. **文档里的链接必须指向真实存在的文件。** 由 `check:doc-links` 机器保证（`docs/` 与根级 md；拦什么见 `structure.md` §10）。

## 语言

| 对象 | 语言 | 理由 |
|---|---|---|
| 代码、标识符、提交信息 | 英文 | 与工具链和上游生态一致 |
| 门面与使用者文档（根 `README.md`、`packages/*/docs/`） | 英文 | 第三方扩展作者与外部读者按英文找 |
| 协作文档（`AGENTS.md`、`KERNEL.md`、`docs/*.md`） | 中文 | 都是本项目内部规则，读者是第一参与者 |

不做双语镜像：一份内容两种语言必然会漂移。需要英文的读者看包内文档与代码注释。

## 容量

`docs/` 手写文件长期不超过 **12 个**。导出物、生成的 HTML/JSON 不计入；超容量说明有内容该回包内：包的约定写进包 README，测试夹具进包内 `test/`，一次性决策进 `docs/decisions/`。

每新增一份文档都要能回答：**它替谁省掉了什么问题？** 答不出来就不建。

## 与其它目录的分工

| 目录 | 放什么 | 特征 |
|---|---|---|
| 根目录 | 规范（AGENTS / KERNEL / CONTRIBUTING / SECURITY） | 准入，第一跳可见，改它等于改规则 |
| `docs/` | 描述（结构、运行、决策） | 随代码更新，只写规则与原因 |
| `docs/plan/` | 现在不做的点子，以及叫醒它的条件与复核日期 | 只面向未来，不描述现状；由 `check:parked` 守 |
| `docs/decisions/` | 为什么当初这么定 | 只追加不改写，带日期与替代方案 |
| `.evoharness/` | 本仓库自用的 skills / prompts / extensions | 是资源，不是文档 |
