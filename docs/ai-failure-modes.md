# AI 在大库上开发的失效模式与对策

> 本文档回答：**某类 AI 开发失效出现时，业界验证过的最有效解法是什么、出自哪个项目、为什么选它而不是别的。**
>
> 它替维护者省掉的问题是：每次遇到同类失效，都要重新去一批参考仓库里检索一遍 —— 而且只看根 `AGENTS.md` 会系统性漏掉"运行时纪律"那一整片（多数项目把最重的规则放在触发式文档里，不放在根文件）。
>
> 为什么按"看不见 → 看错 → 改错 → 验不出 → 累积"这个顺序分层：这五层是**乘法关系**，不是并列关系 —— 单环节 9 成正确率，五层下来只剩约 6 成，所以"先补哪一层"有顺序，不能挑着补。**这是个解释用的修辞模型，不是实测结论**；五层的实际权重因项目而异。

## 0. 怎么用

### 0.1 证据分级

同一个问题，不同项目的"解决方案"强度差一个数量级。按判据的来源分四级，**选方案时优先看等级，再看写得多漂亮**：

| 级 | 判据来源 | 例子 | 能否拦住 AI |
|---|---|---|---|
| **L1** | 文档里的一句话 | "不要用 `as any`" | 靠自觉，长期必然失效 |
| **L2** | 机器查文本 / 形状 | `grep` 锚点、行数上限、字符串存在性 | 只拦被点名的那一种写法 |
| **L3** | 机器查代码结构或运行结果 | AST、真实 import 图、类型系统、编译器 | 能拦，且能找到变体 |
| **L4** | 有事故归因与红例 | "这条守卫拦住了 X 事故"、"注入缺陷必红" | 能拦，且**自身可验证没腐烂** |

一条经验，实证过：**判据客观的治理全部落地了（行数、import 边、测试条数、退出码、哈希、类型）；判据主观的治理全部停留在文档里（时序、安全语义、mock 契约、心智模型）。** 所以下面的每一条都标注等级，并说明能不能往上推一级。

**第二根轴：执法时点。** 同一条纪律在不同时点拦截，效果差一个量级 ——

| 时点 | 拦住了什么 | 代价 |
|---|---|---|
| 会话内 hook（编辑时） | **错误根本进不了上下文**：无复现的源码修改直接被门挡住 | 需要 hook 基础设施 |
| commit 时（pre-commit） | 错误进不了分支 | 最快的可用形态 |
| push 时 / CI | 错误进不了 main | 反馈延迟最长 |

同一个规则，"编辑时拦"是 L3 级的**预防**，"CI 拦"是 L2 级的**事后发现**。选方案时先问：这件事能不能在**做的那一刻**拦？拦不住的才退到 CI。参考实现：有项目把 RED→GREEN 做成运行时证据义务状态机，编辑门直接拒绝"无复现的源码修改"。

下文引用的规模数字（行数、条数、比例）都是 **2026-10 实测的快照，只作为论据**，不是本仓库指标，不要照抄成目标值 —— 同一件事换个检索口径就会得到不同数字，所以关键处优先给命令而不是给数。

### 0.2 四条选择原则

1. **能被编译器执行的，不要写成规则。** 类型系统零维护成本且不可欺骗；`AGENTS.md` 里的话会被稀释。
2. **允许例外，就必须给例外设阈值。** 没有比例上限、没有到期日、没有归属人的豁免清单，三个月后会自己膨胀到失效。
3. **守卫必须能红。** 写不出"注入缺陷后它变红"的复现，就别建这条守卫 —— 它会变成一个永远绿的装饰。
4. **不是所有规则都该被机械化。** agent 的**行为准则**（怎么说话、怎么探索、怎么权衡）属于 prompt 与 agent 定义；代码检查只保护安全与不可能状态（数据丢失、安全边界、不可达状态）；lint 只强制使用者明确要求过的东西。

第 4 条是对前三条的反向约束。一篇只讲"能机械化就机械化"的文档，会诱导读者把行为准则也写成 lint —— 那既贵又僵，而且会把 prompt 的活干成代码的活。

---

## 一、看不见：上下文与检索的系统性缺失

### 1.1 改了符号，但没改全

**症状**：改 `foo()`，搜到 30 处调用全改了，实际 47 处。剩下的是 `svc.foo`、解构后的别名、`export *` 转发、模板字符串里的名字、转义写法。最危险的不是漏改，是**"我已经找全了"这个信念**。

**解（组合）**：三层，按成本从低到高。

- **前置（零成本）**：宽范围改动前**整文件通读**，不许依赖搜索摘录。这是全批仓库里唯一一条直接反"抽样而不自知"的规则，成本为零但需要写进规则，否则 AI 默认行为就是搜一段改一段。
- **主力**：**语法感知的点名检查**。对每个"禁止越界使用"或"必须同步修改"的符号，用 TypeScript AST 而非文本匹配枚举全部引用形态：import、具名 re-export、调用、命名空间成员、解构绑定、别名源、**以及恰好等于该名的字符串字面量**（经下标访问可达）。注释与 JSDoc 不计。文件先做一层"文本或反转义后文本包含该名"的预筛，使 `\u0061`、`\x61`、`\u{61}`、`\141`、换行续行等逃生写法仍被发现。**并在守卫注释里显式声明盲区**（如 `export * from` 不点名标识符，故不报告）。
- **兜底**：**逐文件 100% 行覆盖**。改了代码路径却没有测试执行到，覆盖率门禁直接红。它证明的是"这些行跑过了"，不是"行为对"，但恰好补上"漏改的那条路径没人走过"。

**借鉴**：`pi-main/AGENTS.md` L17（"Read files in full before wide-ranging changes… **Do not rely on search snippets for broad changes**"，这是前置条的 origin；`evoharness/AGENTS.md` 与 `naveti/AGENTS.md` 是同一句的下游移植）、`deepseek-harness-master/scripts/verify-plugin-record-callers.ts`（语法感知 + 反转义预筛 + 盲区声明）、`deepseek-harness-master/docs/testing.md`（per-file 100% on src，并把"未覆盖行"优先当作死代码处理而非补测试）。

**为什么这是最优**：主力那一层是唯一一条**判据来自语言本身**的方案。文本 grep 的召回率随代码库规模下降，因为别名、解构、重导出都是常规写法。但**前置条不能省**：语法感知检查是定点的，覆盖不到一般性改动，而那类改动只能靠"真读过"。放弃的替代是通用符号索引 —— 技术上完全可行（LSP `findReferences`），但没人把它接进门禁，这是本类里唯一"应该做而全员未做"的空位。

**边界**：主力层是**定点**的，一个符号一条检查，不能自动推广到任意符号。适用于"违反即事故"的少数关键符号（越界 API、必须成对修改的契约）。不要指望它解决一般性的"我改全了吗" —— 那一半永远是前置条的活。

### 1.2 真正的依赖大头在代码之外

**症状**：生成物被手改；改了依赖但锁文件没同提交；DB schema 改了没写 migration；vendor 副本悄悄偏离上游；`.env` 与 CI 矩阵里的分支没人知道。

**解（组合，四条都要）**：

1. **生成物三重禁令**：不手改、不入库、（若被忽略）不去 git 历史里找它。改为改源再生成，生成物 diff 可随提交走。
2. **锁文件与依赖段同提交**，并在 pre-commit 阻断"只动锁文件"的提交，除非显式设置一个环境变量并说明原因。
3. **生成物 ↔ 生成源的一致性守卫**：生成物与账本不一致即红。
4. **vendor 漂移登记**：每一处对上游的本地偏离都必须写进 vendor 账本，配 manifest 守卫。

**借鉴**：

- **origin**：`pi-main/AGENTS.md` L28（`models.generated.ts` 永不手改、被忽略的生成数据"never stage it, and don't look for it in git history"）+ L65（pre-commit 阻断锁文件提交，`PI_ALLOW_LOCKFILE_CHANGE=1` 解锁）。
- **下游改名移植**：`evoharness/AGENTS.md`（`EVOHARNESS_ALLOW_LOCKFILE_CHANGE`）、`naveti/AGENTS.md` §10（`NAVETI_ALLOW_LOCKFILE_CHANGE`）。引这三家时要注意它们是**同一个机制的三个副本**，不是三个独立验证。
- **另外两条不来自 pi**：`deepseek-harness-master/vendor/AGENTS.md`（本地偏离必须穷举登记）、`anero/docs/plan/master-plan.md`（生成物与账本一致性守卫）。

**为什么这是最优**：这一类的**判据全部是客观的**（文件是否被忽略、哈希是否变化、类型是否漂移），所以它是唯一"几乎全员都做对"的类别。其中最强的一招是**类型级漂移检测** —— 让生成物的类型与消费者对不上时直接编译失败，而不是靠脚本比对文件。

**边界**：migration 的**顺序**正确性无法静态检查，只能靠"空库以外也要能升级"的测试矩阵。不要用守卫冒充这一层。

### 1.3 长会话上下文腐化

**症状**：第 3 轮读过"此模块禁止直接依赖 DB 层"，第 40 轮原地开了一个 `db.query`。早期错误假设被一路带着走。

**解（组合）**：

1. **根文件只做索引，不承载细则**。根 `AGENTS.md` 只放：仓库地图、硬约束、命令面、触发式路由。细则进"改 X 前必读 Y"的触发表。
2. **文档字数预算**。每份文档有上限，超限三选一：搬走、压缩、抬高天花板（且抬天花板本身要留理由）。
3. **触发式文档**：把最重的规则挂在具体动作上（"改生命周期、并发、子进程、teardown 前必读 Z"），而不是让人通读。
4. **定期删规则**：模型已能从代码推断的、从未影响过决策的、已过时的，删掉 —— 否则关键约束被稀释。
5. **另一条路线：持久化而不是减负。** 前四条都在"少装"，另有一类方案在"外面存"：把决策与偏好写进仓库外的记忆库（项目级 → 工具级 → agent 根目录分层），会话开始时按关键词召回，并给记忆库一个总字节预算；**输出时要报召回后端与命中数**，否则无法判断"没想起来"是因为没有还是因为检索不可靠。

**借鉴**：`deepseek-harness-master/docs/defensive-patterns/`（触发式）、`deepseek-harness-master/scripts/verify-doc-budgets.ts`（字数预算）、`naveti/AGENTS.md` §2（任务→最少阅读映射 + "合计超过 70 KB，不要一次读完"）、`PI-Desktop-main/AGENTS.md` §19（定期删规则）、`gptme-master/AGENTS.md`（第 5 条的 origin：跨 harness 共享记忆库、分层根目录、64 KB 共享预算）。

**为什么这是组合而不是单选**：减负（1–4）与持久化（5）解决的不是同一个问题 —— 前者降低**每次需要装进上下文的东西**，后者延长**信息能活多久**。只减负，长会话仍会忘；只持久化，上下文仍会被撑爆。

**放弃的替代**："让 AI 每次都全文读一遍"已被证明无效 —— 参考仓库里文档行数可达代码行数的 25%–32%（2026-10 实测：deepseek 44 万行文档 / 139 万行代码，PI-Desktop 16 万 / 62 万）。

**边界**：字数预算会激励"压缩到不可读"，必须保留"抬天花板的正当理由"这条出口；记忆库会激励"什么都存"，必须配召回质量指标（否则它变成第二个不可读的文档库）。

### 1.4 调试探针与临时脚本的残留

**症状**：加了一行 `console.log` 查问题，问题修好后忘了删；写了个一次性脚本验证假设，留在 `scripts/` 里；探针注释 `// debug` 散在十个文件里。这些残留不会让任何测试变红，但它们把代码库变成一个“不知道哪些行是故意写的”的地方 —— 下一个 AI 会把探针当成逻辑。

**解（组合）**：

1. **探针分三类，每类不同待遇**：临时日志（必须删）／结构化日志（可留，但要走统一 dal 和级别）／断言探针（转为正式测试）。分不清时按第一类处理。
2. **探针带可搜标记**：统一前缀（如 `[probe:name]`），使残留可被一条命令找全。
3. **完成门禁扫描残留**：交付前跑一次“搜标记 + 搜临时脚本目录”的检查，有残留就不算完成。
4. **一次性脚本写到仓库外**（临时目录），跑完即删；不把多行脚本塞进一条命令。

**借鉴**：`Tianshu-harness-main`（探针三分类 + `[probe:name]` 标记 + 完成门禁扫描）、`pi-main/AGENTS.md`（ad-hoc 脚本写进临时目录、跑完删、“Don't embed multi-line scripts in bash commands”，`evoharness` 同源）。

**为什么这是最优**：这是**唯一一个完全被忽略的类别** —— 前面几十条都在防“写错代码”，没人防“写完不收”。而它的成本几乎为零：一条 grep + 一条完成清单，就能把这类残留从“永远存在”变成“每次交付都清”。判据客观（标记在不在、临时目录里有没有东西），可以推到 L3。

**边界**：结构化日志不该被这条误杀。区分标准是“它是否在生产环境有诊断价值”，而不是“它是不是为了调试才加的”。这类误杀会让开发者不敢加日志，反而更贵。

### 1.5 分不清"活的"和"死的"

**症状**：搜到 3 个 `handleAuth`，改了废弃那个；或者反过来，把有意留空的脚手架当死代码删掉。

**解（组合）**：

1. **未使用检测进门禁**（knip / depcheck 一类的机械检查）。
2. **标注"有意为之"**：对故意相同、故意留空的实现写明理由，让后来的 agent 不去"统一"它。
3. **开工前读"被否决的方案"**：防止重新提议一个已被否掉的方案。

**借鉴**：`ZCode-main/AGENTS.md`（`pnpm knip`、`pnpm dep:refs --list-exports`）、`opencode-dev/packages/tui/AGENTS.md`（"空 registry 是有意的，不是死代码"）、`OpenBot-main`（"十二个界面都走同一个外壳，**它们看起来一样是故意的**"）、`anero/AGENTS.md` §0 第 3 步（读 `rejected/`）。

**为什么这是最优**：这是**双向**问题，而多数项目只做了单向。防"漏删"用 knip（L3）；防"错删"只能靠标注（L1）—— 后者常被忽略，但它是 AI 的"清理欲"唯一的刹车。

**边界**：knip 的假阳性很高，直接进门禁会逼人加豁免，最终豁免清单比死代码还长。建议先做"报告"而非"阻断"。

---

## 二、看错：架构认知与隐式契约

### 2.1 文档架构 ≠ 事实架构

**症状**：README 说的分层，现实里有 200 处抄近路。AI 要么按理想架构写新代码导致格格不入，要么学了坏例子继续扩散。

**解（组合，且必须带第三层）**：

1. **冲突时先报告，不自行选一个。** 这是唯一一个把人拉进来的机制，它承认了 AI 判断不了。
2. **让文档自己证明自己**：Markdown 里的 `ts` 代码块送进编译器类型检查，编译不过即红。`ignore-check` 标记计入"豁免比例"，超阈值该门禁自己红。
3. **主动纠偏"训练数据里的旧印象"**：对"旧文档写 X 是简化，真相是 Y"这类内容显式标注，而不是只写"以代码为准"。

**借鉴**：`naveti/AGENTS.md` §2（"文档与代码冲突时先报告冲突"）、`deepseek-harness-master/scripts/doc-typecheck.ts`（文档代码块 typecheck + opt-out 比例上限）、`Tianshu-harness-main/CLAUDE.md`（"旧文档写「9 个固定 hook」是误导性简化；改 hook 行为前先看 gate 条件"）。

**为什么这是最优**：单纯宣布"代码是唯一真相"是有害的 —— 在腐烂的代码库里，AI 会忠实继承错误模式。三条组合的分工是：**第 1 条解决"我判断不了"，第 2 条解决"文档腐化"，第 3 条解决"模型的先验错误"**。三者不可合并。放弃的替代：`kimi-code-main/AGENTS.md` 的"完全不读 Markdown 只看代码"，在干净代码库里成立，在遗留库里会放大错误。

**边界**：`doc-typecheck` 只覆盖"文档里的示例代码"，不覆盖"文档里的散文是否过时"。后者仍然无解。

### 2.2 时序与状态不变量

**症状**：`initDB()` 必须在 `loadConfig()` 之后；缓存必须在事务提交**之后**写；registry 只能初始化一次；队列消费者必须幂等。这些从不写在函数签名上。

**解（组合，五条，这是全文最重要的一节）**：

1. **把纪律写成"可判定判据"而不是禁令。** 每条规则的形态是：规则陈述 → **判断条件**（谁能被判定为违反）→ 正例 → 反例 → 反例的失效表现。例：
   - **时序不承载正确性**：判据是"正确性是否依赖『那个回调已经跑过了』，而不是某个具名的调用点或状态机"。禁 `microtask` / `setTimeout` / `queueMicrotask` 承载正确性。
   - **异步状态不是同步状态**：判据是"能不能观测到一个 API 未定义的、按单元完成的信号"。`status` / `whenIdle()` 不能当成单次操作的结果。
   - **发布状态只在提交点**：通知与派生状态只在操作成功之后。
   - **一个异步操作一个生命周期控制器**：readiness / cancellation / disposal / reservation 各自需要独立所有者或结算点。
   - **拆卸必须到达静止，而非请求静止**：杀掉子进程之后要 await 退出。
2. **一个值只表达一个事实**：unknown / 空 / 不存在是三件事，用三种表示（discriminated union），不要在边界塌缩成 `undefined`。
3. **可选输入必须同时说明两种行为**：传了怎样、没传怎样，写在契约里。**`?.` 的累积就是信号** —— 每一个 `?.` 都在替代一次"这个字段到底该不该存在"的决策。
4. **注册即副作用，注册返回 disposer**：所有贡献经 `ctx.effect()` / `ctx.on()`；`register()` 返回清理函数。
5. **注销要有测试**：HMR 安全性测试 —— dispose 那个 fiber，断言清理发生。

**借鉴**：`deepseek-harness-master/docs/defensive-patterns/general.md`（judged condition 格式 + 上述五条）、`deepseek-harness-master/packages/AGENTS.md` §"Publish state only at its commit point" / §"one async operation one lifecycle controller"、`deepseek-harness-master/docs/testing.md`（HMR-safety test）、`naveti/AGENTS.md` §8（缓存用 owner-keyed `WeakMap`，每个缓存配 GC 测试）、`PI-Desktop-main/AGENTS.md` §9（"Never assume state is unchanged across an `await`"）。

**为什么这是最优**：这是全场唯一把"时序纪律"变成**可执行决策程序**的形态。禁令（L1）会忘；判据（在写代码的当下可自检）不会。第 5 条是唯一能推到 L3 的落点。**这仍然是本类最强的方案，但也必须承认：除 HMR-safety test 与 GC 测试之外，它依旧靠 review 判据，静态查不出来。** 没有更好的替代 —— 时序正确性本质上需要并发压测或形式化方法，两者成本都太高。

**边界**：judged condition 的写法很难，写不好会变成"更长的禁令"。真正的检验是：**别人拿着这条判据能不能一致地判另一个人的代码**。判不出来就是没写好。

### 2.3 类型系统失守

**症状**：`any` / `as` / 可选字段一多，类型就是装饰。AI 顺着 `as any` 打通让 tsc 变绿，运行时字段名对不上。

**解（组合，三层）**：

1. **编译器旋钮拉满**：`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `no-explicit-any: error`。
2. **`as unknown` 基线棘轮**：按"路径 + 语法指纹（SHA-256）"记录存量的 `unknown` 断言，新断言直接拒绝，存量只减不增。
3. **给逃生舱装计数器**：同一脚本里统计 opt-out 比例，超阈值让门禁自己红。

**借鉴**：`deepseek-harness-master/scripts/verify-no-unknown-casts.ts`（AST 判定，含 `as X` 与 `<X>` 两种语法、以及联合类型里的 unknown 成员）、`deepseek-harness-master/scripts/doc-typecheck.ts`（`// Guard against the escape hatch becoming the norm.` + 50% 上限）。

**为什么这是最优**：**这是所有治理里唯一真正"不可欺骗"的一层** —— 编译器不撒谎，零维护成本，且能拦住变体（联合类型、括号、角度语法都覆盖）。第 3 条是防 Goodhart 的关键：任何"允许例外"的机制都必须自带阈值，否则例外会变成常态。

**边界（重要）**：**棘轮会僵化，而且绕过路径真实存在。** 实测：该基线有 509 个文件、1049 处存量，跨度覆盖测试与源码；而 `as never` 不在检查范围内，测试代码里 `as never` 被大量使用。也就是说"封了 `unknown` 之后，出口转向 `never`"。因此：

- 棘轮必须配**下降要求**（"preserve **or reduce**"），而不只是"不增长"；
- 每条新规则上线时，先问"下一个最近的出口是什么"，把那个也纳入；
- 不要指望单一语法禁令 —— 它的价值是**把问题从"到处都有"收敛到"一处可数"**，不是消灭它。

### 2.4 命名与语义漂移

**症状**：`user` / `account` / `member` / `profile` 在这个项目里可能指四种东西，也可能指同一个。AI 按通用语义理解，写出的跨模块映射是错的。

**解（组合）**：

1. **跨边界的不透明 id 一律 branded**，禁止裸 `string` —— 编译器强制，写错就编译失败。
2. **禁用含糊词汇**：`contract` / `boundary` / `shape` 这类词必须先问"有没有更精确的说法"（`response fields`、`JSON validation`、`ESM exports`）。`contract` 只保留给前置/后置条件、不变量、兼容承诺。**由守卫执行。**
3. **术语裁决走 status 流程**：同一个词在项目里有两种含义时，必须消解歧义并记录。

**借鉴**：`deepseek-harness-master/AGENTS.md`（`Opaque cross-boundary ids are branded`、`verify-concrete-terms`）、`ZCode-main/AGENTS.md`（`workspaceIdentity` vs `workspacePath` 双身份不变量，并标注违反症状）、`cindy-main/AGENTS.md`（术语走 glossary `status: "proposed"`）。

**为什么这是最优**：第 1 条是 L3，把一个语义问题转成了类型问题 —— 这是本类唯一能真正拦住 AI 的手段。第 2 条是 L2（有守卫），价值在于**减少歧义的载体**而不是消灭歧义。第 3 条是 L1，但它是前两条的输入源。

**边界**：branded type 需要 discipline（`Branded<B>` 的构造点要有守卫），否则会退化成到处 `as Branded<...>`。

### 2.5 已有的正确解法它看不见

**症状**：项目里已有 `safeJsonParse`、`retryWithBackoff`、统一错误类型、日志封装。AI 新建 `utils/helper.ts` 重写一遍，语义还不完全一致。

**解（组合，双向）**：

1. **克隆检测进门禁**（跨文件 TS 克隆检测）。
2. **三次规则**：同一模式出现在 3 个以上文件，必须上提到共享层。
3. **同时禁止过度统一**：对"故意相似"的实现写明理由（否则 AI 会为了"复用"把有意区分的两套逻辑合并）。

**借鉴**：`deepseek-harness-master/AGENTS.md`（`pnpm run duplication`）、`PI-Desktop-main/apps/desktop/src/AGENTS.md`（三次规则 + primitive catalog）、`OpenBot-main`（"它们看起来一样是故意的"）。

**为什么这是最优**：克隆检测（L3）能发现"重复"，但发现不了"该不该重复"。第 3 条是必须的，因为 AI 的复制粘贴冲动和过度抽象冲动是一对孪生问题，只治一头会让另一头爆发。

**边界**：克隆检测在模板化代码（表单、i18n、夹具）里假阳性极高，必须有排除规则。

---

## 三、改错：规模化修改的连锁反应

### 3.1 公共接口的静默语义破坏

**症状**：`timeout` 默认从 `undefined` 改成 `30000`，所有依赖"不设超时"的调用点静默变行为。编译通过，测试可能也通过。

**解（组合，三层）**：

1. **评审时枚举"被改变的行为"，不只是 bug**：任何以前能工作的输入，改动后必须同样工作，除非 PR 显式声明变更。
2. **形状演进五条**：字段只增不减；payload 用递增 `version`；用带 discriminator 的 sum type 而非 bool；双向兼容是判据；可能用到的字段名先 `reserved`。
3. **边界上的默认值是显式步骤，不是隐藏的 `??`**：默认逻辑必须是 `resolve(request): Spec` 这样一次具名解析，不能藏进 `run()` 里的 `?? default`。
4. **prompt 文本就是行为**：prompt 里的句子被改动，"没有测试引用这句话"不构成无影响的证据。

**借鉴**：`kimi-code-main/AGENTS.md`（"Enumerate changed behavior, not just bugs"、"Prompt text is behavior"）、`anero/AGENTS.md` §4（形状演进五条）、`deepseek-harness-master/AGENTS.md`（`Explicit > implicit at package boundaries`）、`PI-Desktop-main/AGENTS.md` §3（"Never hide a behavior change inside a `refactor` commit"）。

**为什么这是最优**：**这是组合最优的典型** —— 五条各自解决不同切口。第 1 条给人一个可执行的评审动作（比"注意兼容性"强）；第 3 条是唯一能**在结构上**消灭"静默默认值"的手段（把默认值从"代码里的一个 `??`"变成"一个必须被实现和测试的解析步骤"）；第 4 条覆盖了 LLM 应用特有的盲区。第 2 条给的是判据而不是禁令。

**边界**：第 1 条依赖评审者真的读；它没有被机器化，因为"哪些行为变了"无法静态推导。可机检的只有"单行 commit 拒绝"、"PR 必须含 Verification 段"这类外壳。

### 3.2 包边界与分层被抄近路

**症状**：为了"少改几行"，跨包直接 import 对方 internal；UI 层直接拼 SQL 绕过 service。

**解（组合，四层，按拦截时点从早到晚）**：

1. **新文件必须属于已注册模块**（最早的拦截点）。任何源码目录下新增的源文件，必须能归属到一个已注册的模块/包，否则红；注册命令从真实 import 反推依赖声明。它治的不是"错误依赖"，而是 AI **随地扔文件**这个动作本身 —— 乱扔是错误依赖的上游。
2. **用真实 import 图做 fitness function**，而不是用架构图或文件位置推断。用 AST 解析每条 import 边，对照"层 → 允许依赖的层"白名单矩阵。
3. **堵死"让错误 import 能解析"的暗门**：不为模块解析加 `tsconfig` `paths` / 打包器 alias / 测试 alias。跨包依赖写 `workspace:*`，入口靠 `exports`。**AI 遇到解析失败，最低成本解法就是加个别名** —— 这和 `as any` 是同一类病。
4. **检查器自己要有 fixture 测试**：否则边界守卫会腐烂成摆设。

**借鉴**：`ZCode-main`（第 1 条：`unmanaged-new-file` 规则 + `architecture:adopt` 注册命令，实现在 `scripts/architecture/`）、`better-harness-main`（第 2 条：`layering.test.ts` 用 `oxc-parser` 解析真实 import 图，"架构图抓不到，import 边抓得到"）、`naveti/AGENTS.md` §4（第 3 条："不为模块解析加 `tsconfig` paths 或 vitest alias"）、`Pi-Desktop/thinkrail-main/scripts/check-module-boundaries.ts`（第 4 条：13 条白名单，检查器自带 fixture 测试）、`opencode-dev/.oxlintrc.json`（`no-restricted-imports` 三段）。

**为什么这是组合最优**：这是**所有问题里最适合机械化、也因此做得最好**的一类 —— 判据是 import 边这个客观事实，与人的意图无关。四条补的是不同时点：第 1 条在**文件出生时**拦（最早，且成本最低：一次注册），第 2 条在**写 import 时**拦，第 3 条在**配置层**拦（防止用配置把违规洗白），第 4 条保护前三条自己不腐烂。跳过第 1 条直接做第 2 条，会得到一堆"每个文件单独豁免"的清单。

**边界**：白名单矩阵需要有人维护；层数一多，矩阵会变成一张需要解释的表。层数应当尽量少（3–5 层）。第 1 条在快速原型阶段会很碍事，需要明确的"本模块豁免"出口，否则会被绕过。

### 3.3 循环依赖

**症状**：模块图本就接近临界，AI 引入一条反向 import 就把环闭合了。TS/JS 的循环依赖往往不报错，只在某个初始化顺序下返回 `undefined`。

**解**：lint 层直接 `import/no-cycle: error`。

**借鉴**：`kimi-code-main/AGENTS.md`。

**为什么这是最优**：**就这一条，没有更好的**。它是 L3，判定明确，零歧义。文档里写"禁止循环依赖"是 L1，等于没有。

**边界**：需要在检测上加"允许的例外"（例如纯类型文件），否则会被迫为类型导入引入豁免。

### 3.4 性能退化

**症状**：bundle 混入本该懒加载的大依赖、渲染路径同步 IO、循环里发请求、监听器不销毁、每次多引一个依赖。**没有一个会让测试变红。**

**解（组合）**：

1. **改动能移动热路径成本，就必须前后测量并报数字**。三个指标（运行时、峰值内存、稳态内存）在同一环境、同一输入下测，粒度是改动的那条路径而非整机分数。"整体没变慢"不算证据。
2. **基线是"不带测量钩子的同一路径"**，不是"上一版实现" —— 两边都挂同一个钩子会把差异稀释到看不见。
3. **环境变量不得覆盖性能预算**：预算是被 review 过的源码常量。
4. **用数字讲因果，而不是写禁令**：告诉 AI"单文件 17MB 产物导致 RSS 1GB，分割后 35MB"，比"不要打大包"有效得多 —— 禁令会忘，因果会被重新推导出来。

**借鉴**：`deepseek-harness-master/docs/defensive-patterns/general.md`（"Changes carry performance evidence"）、`deepseek-harness-master/benchmarks/AGENTS.md`（环境变量不得覆盖预算）、`Claude-Code-main/CLAUDE.md`（用真实数字讲构建代价）。

**为什么这是最优**：第 1、2 条解决的是"测量骗人"这个更隐蔽的问题（两边同钩子导致测不出差异，是一个真实存在的陷阱）。第 4 条是**唯一能长期生效的写法**：AI 对数值因果的记忆远好于对禁令的记忆。

**边界**：测量成本高，只对"能移动热路径成本"的改动作要求。文档、测试、注释类改动必须显式豁免，否则规则会被绕过。

### 3.5 风格熵增

**症状**：上午用 `Result` 下午 `throw`；上午拆 4 个文件下午写一个 800 行巨石。三个月后没人能看出"这段是不是我们的人写的"。

**解（组合，棘轮 + 两条防退化）**：

1. **棘轮**：对文件行数、越界断言数等指标设上限，**只对 diff 新增部分执法**（存量豁免，增量不恶化）。
2. **棘轮必须配下降要求与到期日**：只写"不增长"会变成永久居留证；必须"只降不跟涨"，或"推迟不等于删除 —— 写下触发条件、复核日期、当时依赖的前提，且**前提必须写成可被现实推翻的句子**"。
3. **禁止纯转发层与桶名**：拆分不得以"换一个没有领域含义的名字继续存在"收场。
4. **检查热点文件是否真的变小**，而不只是"没超限"。
5. **CI 永不自动刷新基线**：基线更新只允许显式命令，且该命令的 diff 必须被入审。一旦 CI 能自己更新基线，棘轮就在那一刻失效了。

**借鉴**：`ZCode-main`（第 5 条："CI never refreshes baseline automatically"；其治理测试里还记着一条自查 bug ——"带 `--changed` 更新 baseline 会用 scoped 结果覆盖全部条目"——**守卫自己的缺陷被记成了回归测试**）、`PI-Desktop-main/AGENTS.md` §7（Architecture Ratchet + `check-architecture.mjs` + allowlist）、`naveti/AGENTS.md` §15（`parked.md` 三字段 + `check-parked-triggers`）、`naveti/scripts/entry-budgets.json`（"数字是手工天花板，只降不跟涨"）、`deepseek-harness-master/AGENTS.md`（"Preserve or **reduce** the exact legacy baseline"）、`deepseek-harness-master/scripts/coverage-exempt.ts`（豁免准入规则可验证）。

**为什么这是最优**：棘轮本身是对的 —— 一次清理存量做不到，只能分期。但**实测证明了它的失效方式**：某项目把 1000+ 行的 God Module 拆成 35 个文件（真实拆分，最大 750 行，这是成功的一面），同时产生了 748 行的 `shared.tsx`（没有领域含义的新桶）和一行转发壳（违反它自己"不得新旧并存"的规则）；其 allowlist 有 16 条豁免，其中 8 条理由是"不在本次重构范围内"——**没有到期、没有归属、没有比例上限**。对照组是另一个项目，其豁免准入规则是"只有当该套件执行的每个被覆盖文件都已被其他套件完全覆盖时才准豁免"——可验证、会自我收敛。

**所以答案是组合**：棘轮（增量执法）+ 下降要求（只降不跟涨）+ 可验证的豁免准入 + 桶名禁令。缺任一条，棘轮都会在三个月内退化成发牌照。

**边界**：必须**只对新文件/新行执法**，否则存量会让门禁永远红。同时必须**检查存量文件是否在变大**（只查"新增文件"会留下漏洞：往一个 800 行的老文件里再塞 500 行不会被发现）。

### 3.6 声明的兼容范围是假的

**症状**：`peerDependencies` 写「>= 1.2.0」，但 CI 只在一个版本上跑过；“支持 X.Y+” 这句话没有任何证据支撑。比 3.1 更隐蔽 —— 3.1 是这一次改动破坏了谁，这里是**一个从未成立的承诺**。

**解（双端 CI，两端待遇不同）**：

1. **下限用硬 job**：按声明范围的下限重装依赖并跑真实测试，**不允许 `continue-on-error`** —— 一次绿跑是支持这个范围下界的唯一证据。
2. **上限用软 job**：用最新上游覆盖 pin，`continue-on-error`，只报警不阻断。因为“最新版”不是你承诺的东西。
3. **撑不住就抬范围，不要弱化 job**。下界做不到时，正确动作是改 `peerDependencies`，而不是给 job 加豁免。

**借鉴**：`pi-E/pi-tasks-master/AGENTS.md` L46–51（`compat-floor-pi` / `compat-latest-pi`，原文："It is not `continue-on-error` — a green run is the only evidence behind the range"）。

**为什么这是最优**：它最值得抄的不是"跑两端"，而是那个**不对称设计** —— 承诺的下限必须硬（否则承诺无意义），未承诺的上限只需软信号（否则会被上游的无关变化冻住）。一旦两个 job 都改成 `continue-on-error`，它就退化成一条横幅。

**边界**：双端 CI 让时长翻倍，只对"对外发布且有声明范围"的包要求；内部包直接写精确版本更便宜。

---

## 四、验不出：反馈环的失效

### 4.1 测试跑不动，判断就会撒谎

**症状**：全量 40 分钟。AI 只跑"相关"的，而"哪些相关"的判断本身就是错的，或者干脆声明通过。

**解（组合，且必须让工具算 affected）**：

0. **先盘点本仓库能验证什么**（前置，否则后面全是空话）。开工前生成一张能力地图：类型检查 / lint / 单测 / e2e / 构建 / 环境模拟各自能不能跑、跑多久、需要什么前置。很多仓库的 `pnpm test` 根本起不来，此时"按风险匹配验证"是一句伪造的安全感。
1. **明确禁止"跑全量求心安"**，也禁止重复跑已通过的检查 —— 全量归 CI。
2. **按风险匹配验证矩阵**：只改文档 → 静态检查；改配置/目录/依赖/测试清单 → 加跑测试；改内核 → 再加档位验收。
3. **affected 测试由工具从 staged 文件清单算出来**，不由模型判断。
4. **承认"静态过了 ≠ 测试还能跑"**，并把反例写进规则。

**借鉴**：`Tianshu-harness-main/docs/skills/optional/agent-harness-testing/SKILL.md`（第 0 条："开工前先探测本仓库能验证什么"的六行能力表）、`deepseek-harness-master/AGENTS.md`（"Never default to the full suite or repeat a passing check"）、`naveti/AGENTS.md` §16（按风险匹配）、`ZCode-main`（`lint-staged.config.mjs` 把 staged 文件写入 manifest 跑 affected 测试）、`naveti/AGENTS.md` §9（"`pnpm check` 绿不算绿"的具体反例：放一个 `README.md` 进去，六个项目的测试全部起不来而 check 全绿）。

**为什么这是最优**：这一类的对症解法不是"让测试变快"（多数做不到），而是**承认跑不动，改成按风险精确执行**。但有两个致命前提：**第 0 条和第 3 条**。第 0 条容易被跳过（它看起来只是"调查"），但它是唯一能发现"你的测试早就不跑了"的时机；第 3 条不成立时，"哪些相关"回到模型手里，等于没解决。第 0 条是 **L1 的规则、L3 的效果** —— 它不是自己检查什么，而是决定后面能用哪些 L3 工具。

**边界**：风险矩阵会漂移（改了矩阵没人更新）。它需要和"测试清单"绑定，见 4.3。

### 4.2 快照测试变橡皮图章

**症状**：300 个快照，一改组件就 `--updateSnapshot`，视觉回归全绿。

**解（二选一，选定后贯彻）**：

- **路线 A（少而准）**：只在可观察行为与稳定契约上做断言；明确禁止锁私有实现、偶然的调用次数、脆弱的 DOM 层级、大快照。
- **路线 B（多而义务化）**：把录制快照定义为契约 —— **每个非平凡的可见改动必须更新录制快照**，更新是义务不是逃避手段，且 reviewer 必须逐条看 diff。选这条路就要把协议说完整：
  1. **快照是规范化不动点**：volatile 身份（时间戳、会话 id、随机值）换成**保关系类型的 token**，使同一行为每次录制得到同一结果。
  2. **独立 oracle**：另存一份预期工作区树，并且“**模型的散文和工具输出文本不能证明外部效应**” —— 外部效应只能从文件系统/数据库重读。
  3. **重录必须显式解锁**：用环境变量（每个面向一个快照域）才允许写入，否则只读。“更新快照”这个动作因此进 diff、可 grep、可设比例上限 —— 它从纪律（L1）被推到了 L2–L3。

**借鉴**：`PI-Desktop-main/AGENTS.md` §12（路线 A）、`deepseek-harness-master/docs/testing.md`（路线 B 主条："Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless recorded-session scenario in the same PR; **mock-only** evidence does not replace the assembled transcript"）、`deepseek-harness-master/snapshots/AGENTS.md`（路线 B 的完整协议：规范化不动点、`workspace.expected/` 独立 oracle、sidecar 软链白名单）、`pi-E/durable/pinomad-main/AGENTS.md`（第 3 条：`PINOMAD_UPDATE_VECTORS` / `PINOMAD_UPDATE_CONTRACT` / `PINOMAD_UPDATE_SURFACE` 三把独立钥匙）。

**为什么这是最优**：**两条路线都可以，但不能混用。** 混用的结果就是"改一下全红，然后全量更新"。路线 B 更高明的地方在于：**它把"更新快照"这个动作从"作弊"重新定义为"契约维护"** —— 同一个动作，性质变了，行为就变了。但只有这个重定义是不够的（不设就能改），所以必须加第 3 条把它变成一个**显式、可审计**的动作。

**边界**：路线 B 要求录制基础设施（能 keyless 回放），前期投入大；没有基础设施就只能走 A。环境变量解锁的代价是“忘记设就红”，需要在错误信息里直接写出解锁命令，否则会被当成环境问题而不是快照变更。

### 4.3 改测试而不是改实现

**症状**：断言失败时走最低阻力路径 —— 降级 `toEqual` 为 `toBeTruthy`、`@ts-ignore`、`.skip`、catch 吞异常。每一次都能让红灯变绿，每一次都在拆防线。更隐蔽的变体是"同义反复测试"：mock 一切、断言 mock 的返回值，覆盖率上去了，保护力为零。

**解（组合，四层，这是全文最该抄的一节）**：

1. **测试清单棘轮**：改了测试清单（增删用例、加 skip、删测试文件）必须跑一次 `test-integrity:write`，且清单文件的 diff 必须出现在**同一个提交**里。
2. **条数与退出码守卫**：退出码 0 但条数少于基线 = 什么都没验证。强制退出类 flag 必须从所有测试入口移除并**反向锁死**（专门的守卫测"这个 flag 是否被重新引入"）。
3. **0 个测试不算绿**：去掉 `--passWithNoTests`。
4. **拒绝无牙测试**：不为覆盖率或数量加测试；不复制常量、JSX、CSS 或源码字面量做断言；同一机制的用例并入已有文件；**"每条修复都要做一次『还原缺陷即红』"**。
5. **逃生指令要么封掉，要么强制带理由**：`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` / `biome-ignore` / `eslint-disable`。两种可行形态：**全封**（在指定包内直接违规，连豁免本规则也不许）或**强理由**（理由少于 N 字符直接红）。不可接受的中间态是“写了就行”。

**借鉴**：`naveti/AGENTS.md` §9+§14（`test-integrity.json` 同提交）、`Tianshu-harness-main`（`--test-force-exit` 事故复盘："退出码 0 而条数少 = 什么都没验证"；该 flag 已反向锁死）、`anero/CHANGELOG.md`（"`test` 去掉 `--passWithNoTests` —— 0 个测试不再算绿"）、`naveti/AGENTS.md` §16 第 5 条（测试价值门槛）、`better-harness-main/AGENTS.md`（"Do not add pattern-matching assertions as a shortcut…it passes while the feature is broken"）、`kimi-code-main/AGENTS.md`（第 5 条的"全封"形态：`check-no-comments.mjs` 用 AST 逐 token 扫，指定包内一切 ts 指令均违规，连声明豁免本身也违规）、`deepseek-harness-master`（第 5 条的"强理由"形态：`ban-ts-comment` 要求理由至少 N 字符）。

**为什么这是最优**：**这是全批项目里唯一达到 L4 密度的类别**，原因很清楚：判据全是客观的（条数、清单 diff 在不在同一提交、退出码与条数是否一致）。你不需要理解语义，只需要对比数字。五条互相补位：第 1 条管"删/跳"，第 2 条管"少跑"，第 3 条管"空跑"，第 4 条管"假跑"，第 5 条管"直接关掉报警"。

**边界**：第 1 条会让"合理重构测试"变麻烦（必须带清单 diff）。这是有意的摩擦，不要为了省事把清单改成自动生成 —— 自动生成的清单等于没有清单。

### 4.4 mock 掩盖真实契约

**症状**：签名一改，mock 跟着改，测试依旧通过，真实依赖没改。

**解（组合，三层，这是本文档里唯一"制度级"的方案）**：

1. **规定只允许一种 mock 边界**：只 mock 昂贵或不确定的边界（LLM adapter、网络、时钟），**下游全部保留真实实现**。典型形态是"`MockAdapter` 是唯一的 mock，其余（loop、session store、tool registry、JSONL 持久化）全部真实挂载"。
2. **要求"非单测的真实组合测试"**：对产品可见的插件，手搓 `ctx.plugin(...)` 不够，必须通过真实 Loader + 应用/进程启动一份测试专用配置。
3. **规定证据层级**：`mock-only` 的证据不能替代"装配后的完整转写"。每个非平凡改动都要更新一份录制回放场景。

**借鉴**：`deepseek-harness-master/docs/testing.md`（"Prefer the real implementation over a mock"、"`makeBridgeHarness()` … `MockAdapter` as the only mock"、"mock-only evidence does not replace the assembled transcript"）、`deepseek-harness-master/packages/AGENTS.md`（"Product-visible plugins require a non-unit REAL-composition test"）、`PI-Desktop-main/AGENTS.md` §12（"Do not mock all internal collaborators and then assert on the mocks"）、`Claude-Code-main/CLAUDE.md`（`mock.module` 进程全局污染的排查手册）。

**为什么这是最优**："少用 mock"是 L1，"**只允许一个 mock，其余必须真实**"是可数的约束，性质完全不同。第 3 条更高一层：它不禁止 mock，而是**声明 mock 的证据等级不够**，必须补一份录制。这三条合起来，把"mock 是否掩盖了契约"从判断题变成了"证据层级够不够"的执行题。

**边界**：需要录制基础设施。"只能 mock 一个"在某些场景下过严（例如同时依赖时钟和网络），此时应显式写例外而不是放宽规则。

### 4.5 没有端到端兜底

**症状**：没有可一键起全栈的 E2E，AI 只能靠"编译过 + 单测过"判断正确性。

**解（组合）**：

1. **验证"集成候选"，而不是分支名**。不变量写成等式：`最新 main + 本次改动 = 可执行的候选状态`，**而不是** `当前分支名 == main`。
2. **两阶段**：任务候选验证（在自己的 worktree 里、已含最新 main）+ PR 集成验证（即将落地的真实树），后者用合并 ref / 合并队列候选。
3. **跨平台证据不能互替**："本地 POSIX 通过不是 Windows 证据"，以对应的 CI job 作为权威票据。
4. **远端与本地不一致，这个不一致本身就是发现**。

**借鉴**：`PI-Desktop-main/AGENTS.md` §16（等式写法 + 两阶段）、`better-harness-main/AGENTS.md`（"A local POSIX pass is not Windows evidence…use the corresponding GitHub Actions job as the authoritative receipt"）、`penguin-harness-main`（`remote-test.sh`）。

**为什么这是最优**：第 1 条的等式写法是关键 —— 它**把"为什么不能靠分支名判断"变成了可推演的公式**，而不是一条禁令。人在 review 时可以直接拿等式对照。第 3 条纠正的是 AI 最常见的证据错误：把一种环境的绿灯当成通用绿灯。

**边界**：两阶段 E2E 成本高，只在"代码承载"的改动上要求；纯文档改动不该触发。

### 4.6 flaky 让人对红灯脱敏

**症状**：一旦"这个测试本来就偶尔红"成立，**所有**红灯都可以被解释掉。

**解（组合）**：

1. **重新定义性质**："只单独跑才过的 spec 就是缺陷" —— flaky 是 bug，不是噪音。
2. **用环境密封消灭源头**：测试跑在无凭证、临时 HOME、固定 TZ / LANG 的环境里。
3. **主动声明机器覆盖不到的盲区**，而不是假装机器全知。典型形态："这里也硬编码了 workspace 列表，所以**绿灯不构成证明**" —— 每次增删包仍需手工同步。

**借鉴**：`deepseek-harness-master/packages/AGENTS.md`（"a spec that passes only when run alone is a defect in the spec"）、`naveti/AGENTS.md` §9（`test:ci` 密封环境）、`kimi-code-main/AGENTS.md`（"A green check is therefore NOT proof"）、`pi-E/durable/ultimate-main`（把这三条做成 lint：`ultimate/no-test-timeout` 禁止“抬超时而不修”，`ultimate/no-real-wait-in-fast-tests` 禁止真实等待，`ultimate/no-local-test-polling` 要求用真实 deadline；正当例外要 `fast-test-reason:` 注释）。

**为什么这是最优**：第 1 条是**定义层面的干预**，成本为零，效果立竿见影。第 2 条是物理手段（比"修 flaky"可靠得多）。第 3 条是最稀缺的品质 —— 绝大多数治理体系都在假装自己全覆盖，而**主动标注盲区让"绿灯"重新变得可解释**。

**边界**：第 3 条需要有人持续维护"盲区清单"，否则清单本身会过时。

---

## 五、累积：时间维度的复利

### 5.1 技术债以 AI 的速度累积

**症状**：同样的坏代码率，产出量差一个数量级，于是**质量下滑的速度也差一个数量级**。人类一天写 300 行、AI 一小时写 3000 行，5% 的坏代码率在三个月后的绝对量完全不同。

**解**：见 3.5（棘轮 + 下降要求 + 可验证豁免）。这里补三条棘轮特有的失效机理：

1. **棘轮的失效方式不是有人作弊，而是豁免理由的措辞本身允许永久居留。** "不在本次重构范围内" —— 哪个本次？这种措辞可以复制到任何文件上，永远成立。
2. **基线一旦成型，清理它不产生任何绿灯收益，只产生风险。** 所以理性的行为体（包括 AI）永远不会去清它。"只减不增"在实践中等于"永不减少"，除非另外给下降压力。
3. **棘轮只能延缓形状恶化，不能阻止它。** 实测中一个 God Module 被真的拆成了 35 个文件（最大 750 行），同时长出一个 748 行的 `shared.tsx`（没有领域含义的新桶）和一个一行转发壳。**指标全绿，问题只换了形状。**

**为什么这里不能只写"用棘轮"**：棘轮的正确定位是**分期还债的工具**，不是**免债的许可**。两者的区别只在一条：有没有 `review_by` 日期。

**边界**：AI 的提交频率越高，"每季度人工复核一次豁免清单"越不可能发生。所以到期日必须是**机器可查的**（清单文件里有日期字段，守卫比对当前日期），不能是流程约定。

### 5.2 补丁摞补丁，无人敢删

**症状**：每次修复都是叠加而非重构（大库上重构风险太高），最后形成"能动但没人理解"的核心区。

**解（组合）**：

1. **不留新旧并存**：移除被替换的路径、临时适配层、死代码。
2. **减法 pass**：非平凡实现做完之后做一次减法 —— 移除可避免的抽象、状态所有者、依赖、兼容层和 fallback，**并报告实质性移除、论证保留的层**。
3. **推迟不等于删除**：`TODO` / `FIXME` 不许没有触发条件；要推迟就写进 parked 台账，三件事齐全：触发条件、复核日期、**当时依赖的前提**（前提必须写成可被现实推翻的句子）。

**借鉴**：`PI-Desktop-main/AGENTS.md` §6（"Do not leave old and new implementations coexisting"）、`Pi-Desktop/thinkrail-main/AGENTS.md`（subtraction pass）、`naveti/AGENTS.md` §15（`parked.md` + `check-parked-triggers` 拦缺字段与已到期条目）。

**为什么这是最优**：第 2 条是唯一的"主动减法"，其余项目都在做"被动防增"。**加法是默认行为，减法必须被要求**。第 3 条解决的是"推迟"这个行为缺少后果的问题：给了到期日，推迟才是一次决策而不是一次拖延。

**边界**：subtraction pass 需要判断力，写死成流程会变成走形式。它的价值在于**要求论证"为什么保留"**，而不在于"删得多"。

### 5.3 人类心智模型脱节

**症状**：AI 大规模改动后没有任何人脑中有完整模型。此时 **AI 也失去了最后的纠错来源** —— 没人能指出它错了。

**解（组合，但要诚实：这是唯一一条没有真正解法的）**：

1. **决策记录四态**：proposed → implemented / rejected → archived，一条决定一个文件，固定四段（背景 / 决定 / 被拒绝的替代方案 / 后果）。
2. **格式由机器强制**：四段必须齐；`implemented/` 里出现"计划时态"的标题直接被拒；归档区 append-only + 哈希封冻。
3. **归档判据不是时间**："**只有当它的理由能阻止一个诱人的、有意义的错误时，才保留它。**"
4. **记录"违反症状"而不只是"规则"**：把历史事故蒸馏成不变量表，每条带"违反后长什么样"。例：`I1: workspaceKey 只表达身份隔离；执行路径永远用 workspacePath —— 违反症状：远程 identity 被写进 cwd（3.4.2 事故）`。
5. **给"写不写一条"配准入门槛**：防止记录库膨胀成第二个不可读的文档库。可行的判据是三条同时成立：**难以回退、没有上下文会让人意外、确实有过取舍**。不满足的进 issue / 路线图 / 术语表，不进决策库。

**借鉴**：`anero/AGENTS.md` §3 铁律 3（"被拒绝的方案是最高价值的一栏"）、`deepseek-harness-master`（`verify-agent-note-format` / `verify-agent-note-classification` / `verify-archived-agent-notes`、归档判据原句）、`ZCode-main/.agents/skills/session-management`（不变量表 I1–I5 + 违反症状）、`pi-E/durable/pinomad-main/AGENTS.md` L5 + `docs/adr/README.md`（第 5 条原句："新 ADR 只在三条都满足时写：难以回退、没有上下文会让人意外、确实有过取舍"）。

**为什么这不是最优 —— 必须说清楚**：第 1–3 条解决的是**可追溯**，不是**理解**。"能查到"和"有人真的懂"是两件事。实测佐证：一个项目积累了 2600+ 条机器化决策记录，其中 `rejected/` 只占 0.6%（16 条）—— **"被否决的方案"这个被认为最高价值的类别，在实践里几乎不产出**。另一个项目在 759 行代码时就有 265 行 AGENTS.md 和三套守卫，文档量是代码量的数倍 —— 这套方法论只能在"代码还不存在"时建立，不能从十万行废墟里长出来。

**所以第 4 条才是真正有价值的**：它记录的不是决策，是**失败的形状**。这是唯一一种"没读过全部历史也能用上"的记录形态。

**边界**：如果只能做一条，做第 4 条。第 5 条与第 1 条是一对 —— 没有准入判据时，决策库会变成"每个改动都值得记一条"，然后被所有人忽略。

### 5.4 review 失效

**症状**：单 PR 动 40 个文件 2000 行，review 从"审"退化为"扫"，approve 变成形式。

**解（组合）**：

1. **先读 diff 触及的每份权威文档，再读 diff**。"凭记忆中的规则去判断一个 diff，就是违规通过评审的方式。"
2. **点破真实回归模式**：多数回归不是逻辑错误，而是"**改动相对于自身意图是对的，但悄悄改掉了某个现有人群依赖的行为**"。
3. **盲审**：让一个独立子 agent 只拿 PR 号、不看作者说明，独立列影响清单，再与作者的表对比。
4. **评审者视为证据，不是权威**；审查者不编辑文件。

**借鉴**：`deepseek-harness-master/.agents/skills/dsh-code-review`（第 1 条原句）、`kimi-code-main/.agents/skills/review-pr`（第 2、3 条）、`better-harness-main/.agents/skills/triangulate-spec-review`（第 4 条）。

**为什么这是最优**：第 3 条是唯一真正绕开"作者视角"的机制 —— **审查的失效点不是审查者不认真，是审查者和作者共享同一个盲区**。第 1 条的成本极低（读文档），但几乎没人做。

**边界**：盲审需要能开独立会话；单 agent 环境做不到，退化为第 1、2 条。

### 5.5 git 历史失去语义

**症状**：大量 `fix build`、`update` 的 commit，未来 `git blame` 时决策的"为什么"一无所得。

**解（组合）**：

1. **单行 commit 直接拒绝** —— 这是可机检的布尔量。
2. **正文只写 why**（what 看 diff 就够），配反例表：`update code`（无 type 无 scope 无 why）、`fix bug`（同上）、`feat: 修改主动能力`（非英文）。
3. **回归先修引入它的那个 PR**，不要在下游打补丁。
4. **给 commit 绑回产生它的 AI 会话**（结构化，不是叙事）：用一个自定义 trailer（如 `Conv-Id: <id>`）记录产生该 commit 的会话 id，由 commit 钩子自动写入，并提供一条反查命令。这样 `git log --format=%(trailers:key=...)` 就能从任意一行代码走回当时的会话。比在 body 里写一段“为什么”硬 —— 后者仍然可以填假话，前者是结构化的、可校验存在性的字段。
5. **回归测试旁边注 issue 号**：bug → test 的锚点。它是 5.3 第 4 条“记录失败的形状”最便宜的实践形态。

**借鉴**：`PI-Desktop-main/AGENTS.md` §17（第 1 条：“Single-line commits are rejected”）、`anero/AGENTS.md` §5.3（第 2 条的 Conventional Commits + 反例表）、`deepseek-harness-master/AGENTS.md`（第 3 条）、`pi-E/durable/ultimate-main`（第 4 条的 origin：`Ultimate-Conversation` trailer，由 `prepare-commit-msg` 钩子注入，`extensions/coding-tools/`；e2e 覆盖 amend / merge / 分支外提交 / **钩子不残留**）、`pi-main/AGENTS.md` L54（第 5 条的 origin：“add a comment with the github issue number next to the test”，`evoharness/AGENTS.md` 同源）。

**为什么这是最优**：“可机检的外壳包裹不可检的实质”是第 1、2 条的通用手法；第 4 条更进一步：它让“为什么”有一个**可反查的外键**，而不是一段可以编的散文。这五条合起来才能让 `git blame` 真的能回答“当时发生了什么”。

**边界**：小改动强制写 body 会产生噪音。可以用"类型白名单"（`docs` / `chore` 允许单行）折中 —— 但一旦开口，AI 会往白名单里挤。

### 5.6 多智能体：互踩与失控

**症状**：两类不同的事被混在一起 —— (a) 并行会话**互相毁掉文件**（`reset --hard` 抹掉别人未提交的工作）；(b) **错误在 agent 间放大**（多个 agent 各自投票、无人拍板、轮次无限）。前者不可逆，后者不可控。

**解 A：共存（防踩踏，优先做）**

1. **流程级**：`1 request = 1 branch + 1 dedicated worktree`。主检出与本地 `main` 是**协调面，不是开发面**。禁止：在 main 上开发、在主检出里开发、复用/修改/删除别人的 worktree、依赖别人未提交的工作。
2. **共存声明 + 失效机制**：明确写“**本目录可能同时有多个会话在跑，各自改不同文件**”，并给禁令配上原因 —— `git reset --hard` 之所以禁，不是“危险”，是“**会毁掉其他 agent 的工作**”。冲突只在自己改的文件里解决，否则中止并问用户。
3. **工具级**：并发 typecheck / 构建会互相污染结果，需走跨进程闸门共享。

**解 B：协作（防放大，有子 agent 才需）**

4. **顾问型子 agent 只读**：无写权、默认互不可见、**轮次有硬上限**（不允许无界循环），最终结论只由父会话写。
5. **写权限分层**：子 agent 只 commit 不 push；`main` 的最终闸门是一个固定角色（人或 lander），不由任一 agent 自行判定完成。

**借鉴**：`PI-Desktop-main/AGENTS.md` §5（A1：1 request = 1 branch + 1 worktree、11 条 Never、固定交付顺序）、`pi-main/AGENTS.md` L69/L79（A2 的 origin："Multiple pi sessions may be running in this cwd…" + "destroys other agents' work"；`evoharness/AGENTS.md` 与 `naveti/AGENTS.md` 同源移植）、`Tianshu-harness-main`（A3：typecheck-guard 跨进程共享）、`pi-subagents-main/skills/council-mode/SKILL.md`（B4：advisor read-only、默认互不可见、"never run an unbounded loop"）、`pi-E/durable/ultimate-main`（B5：subagent 只 commit 不 push，main 的最终闸门是 lander）。

**为什么这是组合最优**：**A 是全文性价比最高的一条**，因为后果不可逆。A2 的方法论值得单独记：**给禁令配上失效机制，禁令才会被记住** —— “禁止 `reset --hard`”是 L1；“会毁掉其他 agent 未提交的工作”是可被理解的因果。B 治的是另一个失效：**多 agent 不是并行度问题，是责任归属问题** —— 没有固定闸门时，每个 agent 都会认为“别人会拍”。

**边界**：worktree 增加磁盘与心智成本，同时跑 N 个会话时 `node_modules` 与构建缓存要复用（否则每个 worktree 装一遍依赖，成本爆炸）。B 只在真的用子 agent 时才需要；单 agent 环境套一层 council 协议只会拖慢。

---

## 六、跨领域红线

### 6.1 安全边界被"顺手简化"

**症状**：`if (!user.isAdmin) throw` 被重构掉；`catch (e) { throw e }` 改成 `catch (e) { log(e) }` 或 `catch (e) { }`，鉴权失败变静默放行。

**先说清楚三层的可机检性**（这是本文档早期版本的过度承诺，已修正）：

| 变异形态 | 能否机检 | 依赖什么 |
|---|---|---|
| 删掉一个鉴权/边界检查 | **否** | 无项目做到，只能靠 review 与执行器测试 |
| `catch (e) {}` / 空 `.catch` / 返回 `undefined` 的 `.catch` | **是** | 自定义 lint（AST 判定空块），如 `ultimate/no-silent-catch` |
| `catch (e) { throw e }` → `catch (e) { log(e) }`（记录但不抛） | **否** | 块非空，语法上无法判定它吞掉了错误，仍需人工 |

**解（组合）**：

1. **在做出决策的那个操作里强制**。Schema 省略、prompt 过滤、门面、包装层、监听器顺序 —— 当直接调用方或替代调用方可以绕过时，**它们都不算强制**。并通过**执行器**测试拒绝路径。
2. **列出“不得削弱的清单”**：权限检查、沙箱边界、URL 校验、文件系统限制、origin 校验、凭证隔离、插件授权。
3. **重构时“迁移保持行为”**：错误码、诊断、数据流顺序逐项对比；迁移中发现的缺陷单独成一次改动，不许折进移动里。
4. **把能机检的那一格真的机检**：空 catch / 空 `.catch` 用自定义 lint 拦住（要求附一行理由注释才能放行）—— **不因为它只盖住三分之一就放弃，因为它把“到底有多少处在吞错”从无限变成可数**。

**借鉴**：`deepseek-harness-master/packages/AGENTS.md`（第 1 条："Enforce a decision in the operation that makes it"）、`PI-Desktop-main/AGENTS.md` §11（第 2 条："Never fix functionality by weakening …"）、`deepseek-harness-master/docs/defensive-patterns/general.md`（第 3 条："Migrations preserve behavior"）、`pi-E/durable/ultimate-main`（第 4 条的 origin：`lint/ultimate.ts` 里的 `ultimate/no-silent-catch`，空 catch / 空 `.catch` / 返回 `undefined` 的 `.catch` 必须附理由注释）。

**为什么这不是最优 —— 必须诚实**：**删掉鉴权检查仍然无法机检**。所有“锚点字符串检查”都只验证文档里那句话还在，不验证行为。第 1 条把“边界在哪”从争论变成可测（从执行器发起拒绝路径）；第 4 条只盖住“空吞”这一种形态，但它把“到底有多少处在吞错”从无限变成了可数 —— 这已经足够让 review 有人可问。

**边界**：这一类的上限是“执行器拒绝测试 + 逐项对比 + 空吞 lint”三者的并集，再往上没有手段。不要用文本锚点守卫冒充它 —— 那会让所有人误以为已经守住了。

### 6.2 供应链

**症状**：20 行能解决的事 `npm i` 一个未知维护状态的包。

**解（组合）**：

1. **安装一律 `--ignore-scripts`**；带 lifecycle script 的新依赖必须 review 并进显式 allowlist，**绝不静默添加**。
2. **直接依赖钉死精确版本**，用守卫拦浮动范围。
3. **升级关键依赖必须先读 changelog**，评估对功能的影响再应用。

**借鉴**：`pi-main/AGENTS.md` §"Dependency and Install Security"（origin：`--ignore-scripts`、钉死精确版本、新依赖带 lifecycle script 必须入 allowlist 且“never add one silently”、升级关键依赖先读 changelog；`evoharness/AGENTS.md` 与 `naveti/AGENTS.md` §10 同源）、`naveti/AGENTS.md` §10（`check-pinned-deps` 拦浮动范围、`allowBuilds` 显式清单）。

**为什么这是最优**：**判据客观**（版本字符串是否含范围符、是否在 allowlist 里），所以能机械化。这是本类唯一能到 L3 的部分。

**边界**：钉死版本会让安全补丁滞后；需要配一条"定期升级"的流程，否则会被"锁得越死越安全"的错觉困住。

### 6.3 合规与数据外泄

**症状**：PII 进日志、secret 进默认配置、内网地址进前端。

**解（组合）**：

1. **禁止读取/打印/提交/复制**未被任务需要的 secret、token、cookie、会话、生产配置；日志和测试输出同样不得泄漏。
2. **用户填写的值只交给宿主执行，不进模型、记录、日志、IM 与推送** —— 这是 AI 应用特有的一条边界。
3. **子进程环境清洗**：派生的命令拿到的是清洗过的 env（丢弃 `*KEY*` / `*SECRET*` / `*TOKEN*` / `*PASSWORD*`）；临时文件用私有目录、随机名、独占 open。

**借鉴**：`PI-Desktop-main/AGENTS.md` §11、`cindy-main/AGENTS.md`（第 2 条）、`deepseek-harness-master/docs/defensive-patterns/general.md`（第 3 条）。

**为什么这是最优**：第 3 条是唯一机制化的（在代码里做，而不是在规则里写）。第 2 条是 AI 应用特有的、别处抄不到的边界。

**边界**：第 1、2 条靠自觉，必须配合 secret 扫描（pre-commit）才有意义。

### 6.4 平台差异

**症状**：Windows 路径分隔符、大小写敏感、换行符 —— 本地过、CI 挂。

**解**：以**对应平台的 CI job 作为权威票据**；本地其他平台的绿灯不构成证据；远端与本地不一致时，**这个不一致本身就是发现**。

**借鉴**：`better-harness-main/AGENTS.md`、`penguin-harness-main`（`remote-test.sh`）。

**为什么这是最优**：它纠正的是 AI 最典型的证据错误 —— **把一种环境的成功外推成通用成功**。一句话就能修正，成本极低。

**边界**：需要真实的跨平台 CI；没有的话只能靠"声明盲区"。

### 6.5 并发与幂等

**症状**：AI 写的重试、消息消费者、定时任务默认不幂等，单机测试永远发现不了。

**解（组合）**：

1. **把幂等写成契约**：重复提交同一个 id 时，第一次受理生效，重试的 payload / metadata 被忽略（无论该项仍待处理还是已投递）；跨会话或跨类型复用则失败。
2. **串行 admission + owner/lease**：入口串行化，stale run 有防护。
3. **I/O adapter 显式声明**输入、输出、错误类型、超时、取消、重试语义、**幂等性**和副作用范围。

**借鉴**：`opencode-dev/AGENTS.md`（`session_inbox` 幂等契约的完整表述）、`ZCode-main`（`CommandInbox` 串行 admission、owner/lease、stale run）、`ZCode-main/apps/zcode-cli/AGENTS.md`（adapter 契约要求）。

**为什么这是最优**：这一类的正确答案不是"写代码时小心"，而是**在类型/契约层面强制声明**。第 3 条把"幂等"从隐性假设变成必填字段。

**边界**：仍然没有静态检查能验证"你声明的幂等性是真的"。只能靠"重投测试"。

---

## 七、元层：守卫自己的治理

### 7.1 守卫会腐烂

**症状**：守卫写的时候是对的，三个月后它指向的文件改名了、它检查的规则被废了，但它依然是绿的。**一个永远绿的守卫等于不存在，且比不存在更坏**（它让人误以为已经守住）。

**解（组合，五条）**：

1. **没有自我证明的守卫视为不存在**：每条守卫必须附一份 self-proof —— **一次绿 + 至少三类注入变红**。
2. **登记表自校验**：`selfProof` 指向不存在的文件 → 门禁直接红；`script` 不存在 → 红；写了守卫没登记 → 红。
3. **`bornAt`**：登记表里出现没有出生 tag 的守卫 = 提前建空壳，拒绝。
4. **`budgetMs`**：单次运行预算，超了就下沉到夜间 lane，**不是劝人忍**。
5. **先写红例**："先写下你希望它变红的那条命令。**写不出可复现的红例，就先别写守卫**"；守卫头注释要能指出是哪次事故催生了它。

**借鉴**：`anero/docs/anero/verification.md` §4.10 + `anero/scripts/verify-guard-manifest.mjs` + `scripts/guards/registry.mjs`、`naveti/.agents/skills/add-a-guard/SKILL.md`。

**为什么这是最优**：这是**唯一一条有真实事故证据的元规则**。某项目自己的守卫测试注释写着："真实现场就是它自己 —— 一条指向不存在 selfProof 的登记，**曾经让两条假守卫通过了所有门禁**"。守卫会比业务代码烂得更快，因为它没有用户、没有报错、只有绿灯。

**边界**：五条全做成本很高（每条守卫要配一份自证）。按守卫的"拦住的损失"分级：拦不可逆事故的做满五条，拦风格问题的只做第 5 条。

### 7.2 指令文件自身的治理

**症状**：`AGENTS.md` 和 `CLAUDE.md` 内容漂移；两份都在改；规则越堆越多，关键约束被稀释；自动生成的指令文件写错项目类型。

**解（组合）**：

1. **单一权威源**：另一份只做指针（一行 `@AGENTS.md`）、软链，或"精简镜像"。
2. **字数预算 + 触发式下沉**：根文件只放常热路径；细则进触发表；定期删掉模型已能推断的规则。
3. **如果确实要双文件：用"锚点同时存在 + 版本 token 一致"守卫** —— 但要清楚它守的是**文档不漂移**，不是**行为被守住**。

**借鉴**：`cindy-main/CLAUDE.md`（一行 `@AGENTS.md`）、`deepseek-harness-master`（`CLAUDE.md` 软链）、`naveti/AGENTS.md` §首（"规则只有这一份"）、`PI-Desktop-main/scripts/check-agent-policy-sync.mjs`（锚点守卫，**反面参照**）、`nanocoder-main`（反面教材：自动生成的 AGENTS.md 把项目类型写错）。

**为什么这是最优**：**第 1 条是唯一正确的答案，第 3 条是不得已的补丁。** 锚点守卫的本质是 `includes()` 字符串匹配（实测：纯子串比较 + 大小写归一 + 多写法容忍），它守的是"这句话还在文档里"。它防住了文档漂移（这是它声称要防的），但**任何把"权限检查被简化"寄托在它上面的预期都会落空**。能用单源就不要用双源 + 守卫。

**边界**：某些工具链强制读取特定文件名（如 `CLAUDE.md`），这时单源只能用软链或指针。软链在 Windows 上需要额外权限，指针（一行 import）是退路。

### 7.3 证据链

**症状**："我跑过了"没有输出；"静态检查通过"被写成"测试通过"；PR 描述写 "should work"。

**解（组合）**：

1. **PR 必含 `## Verification` 段**：跑了什么命令、真实输出是什么、如何复现。**禁止写 "should work" / "tested locally" 这类无证据表述。**
2. **报告四块制**：已验证（贴命令与结果）／未验证及原因／风险／需要用户决定的事项。**不把"静态检查通过"写成"测试通过"。**
3. **贴完整输出不截尾**；**永不把跳过的命令报告为通过**。
4. **e2e 断言要重跑命令或从外部重读文件**，不要在 agent 自己的输出上做关键词探测 —— 那会让一个作弊的 agent 通过。

**借鉴**：`anero/AGENTS.md` §5.6、`naveti/AGENTS.md` §16、`PI-Desktop-main/AGENTS.md` §12+§18、`deepseek-harness-master/docs/testing.md`（"Verify the world, not the self-report"）。

**为什么这是最优**：这四条是**把"要证据不要断言"从口号变成可审的外壳**的完整方案。第 4 条最深：它指出"在自己的输出上做断言"根本不是验证 —— 这句话适用于所有人，不只 AI。

**边界**：`## Verification` 段可以被填假的。可机检的只有"段存在"，不可机检"段内容为真"。所以它必须和 7.1 的"红例"配合使用。

---

## 八、与本仓库的对照

本仓库 `npm run check` 当前包含：biome、parked 触发条件、钉死依赖、运行时依赖闭包、TS 相对导入、入口图、包分层、install-lock、`tsc --noEmit`、browser smoke。

对照上文各类，缺口按"该补的顺序"排：

| 优先级 | 缺口 | 对应条目 | 建议形态 |
|---|---|---|---|
| 1 | 改测试过绿的防线 | 4.3 | 测试清单同提交 diff + 条数基线（最能立刻见效，判据全客观） |
| 2 | 包边界只查了 manifest，没查 import | 3.2 | **已确认**：`scripts/check-package-layers.mjs` 读的是 `package.json` 四个依赖段（第 91–96 行），唯一扫源码的地方是一条正则（`HARNESS_IMPORT`，第 57 行）。两层漏网：① 假阳性 —— 声明了但代码不 import；② **假阴性 —— workspace 提升后能 import 未声明的包，这种不会报**。后者是真洞，修法：把依赖图改为从 AST 的 import 边导，manifest 只当声明一致性检查 |
| 3 | "改全了吗"的定点守卫 | 1.1 | 对本仓库少数"违反即事故"的符号做语法感知点名 |
| 4 | 棘轮的下降要求 | 3.5 | 现有预算类指标补"只降不跟涨"与到期日 |
| 5 | 逃生舱计数器 | 2.3 / 2.1 | 任何 opt-out / allowlist 补比例上限 |
| 6 | 守卫自证 | 7.1 | 给现有守卫补红例测试；`check:*` 里已有多数带 `.test.mjs`，缺"注入即红"的形态 |
| 7 | 时序判据 | 2.2 | 新增 `docs/` 之外的触发式文档前，先确认是否会超 `docs/` 的容量预算 |
| 8 | 安全边界的执行器拒绝测试 | 6.1 | 对权限/沙箱路径补"从执行器发起拒绝"的测试 |
| 9 | 空吞错误的 lint | 6.1 | 空 catch / 空 `.catch` 拦截；本仓库用 biome，需确认自定义规则能力，否则退为脚本 |
| 10 | **本文件自己的引用检查** | 7.1 | `check:doc-refs`：解析本文所有反引号路径、验证存在；**红例：改名一个文件它必须变红**。这条是自指的 —— 本文 70+ 个路径全是纯文本，按 7.1 的标准等于不存在 |

其中 1、2、5、6 是**判据客观、可机械化**的，收益/成本比最高；3、7 需要逐个符号/逐条规则的手工设计；4、8 是长期项；10 成本最低（一小时）且直接保护本文档自己。

---

## 九、不推荐照抄

前面推荐的都是"判据客观"或"可推一级"的。以下三类明确不推荐：

1. **文本锚点型的"行为守卫"**。以 `grep` 检查"某句话还在文档里"来声称"某行为被守住"，会让所有人误以为已经安全。它唯一正当的用途是防**文档**漂移，且要写明这个窄边界。
2. **无到期日、无比例上限、无归属人的豁免清单**。实测中，某项目 16 条架构豁免里有 8 条理由是"不在本次重构范围内" —— 这是永久居留证的语法形态。
3. **把元系统做到与业务同等规模**。实测中，最重的那个项目：代码 139 万行，文档 44 万行（32%），守卫脚本约 1.2–1.5 万行。这个比例在"研究 agent 治理本身就是产品"的项目里付得起，在业务项目里会先压垮团队。**守卫的边际收益递减，边际成本递增，拐点按团队规模而非代码规模决定。**

---

## 十、来源索引

按"引用最多"排序，每个项目一句话说明它在这份文档里代表什么。

**先看血统**：`pi-main` 是 `evoharness`、`naveti`、`pi-E/*` 多家的规则源头（生成物禁令、锁文件闸门、多会话共存、整文件通读、issue 锚点都出自它）。它们联名出现时是**同一个机制的多个副本，不是多次独立验证** —— 把它们当作互相佐证，就是本文 5.3 批判的"来源失传"。

| 项目 | 代表什么 | 主要文件 |
|---|---|---|
| `pi-main` | **上游源头**：整文件通读、生成物/锁文件闸门、多会话共存的失效机制、依赖安装安全、issue 锚点 | `AGENTS.md` |
| `deepseek-harness-master` | 判据最硬：judged condition 格式、文档代码块 typecheck、单一 mock、覆盖率门禁、守卫自证要求 | `docs/defensive-patterns/`、`docs/testing.md`、`packages/AGENTS.md`、`scripts/verify-*` |
| `naveti` | 闭环最干净：规则单源、风险匹配验证、测试清单棘轮、parked 三字段、add-a-guard | `AGENTS.md`、`.agents/skills/add-a-guard/` |
| `PI-Desktop-main` | 流程最完整：worktree 隔离、架构棘轮、两阶段 E2E、单行 commit 拒绝 | `AGENTS.md`、`scripts/check-architecture.mjs`、`scripts/check-agent-policy-sync.mjs` |
| `anero` | 元治理最深：守卫自证、登记表自校验、bornAt/budgetMs、rejected 优先 | `AGENTS.md`、`docs/anero/verification.md`、`scripts/guards/registry.mjs` |
| `kimi-code-main` | 评审最锋利：枚举被改变的行为、prompt 即行为、盲审 | `AGENTS.md`、`.agents/skills/review-pr/` |
| `better-harness-main` | 边界最实：用 AST 解析真实 import 图、跨平台票据、"grep 型守卫是反模式" | `AGENTS.md`、`layering.test.ts` |
| `Tianshu-harness-main` | 假通过取证：退出码 0 但条数少、跨进程 typecheck 闸门、还原缺陷即红 | `CLAUDE.md`、`scripts/verify-*` |
| `ZCode-main` | 结构与状态：knip、architecture policy、`CommandInbox` 串行 admission、不变量表 | `AGENTS.md`、`.agents/skills/` |
| `opencode-dev` | 协议与幂等：`no-restricted-imports` 三段、`session_inbox` 幂等契约 | `AGENTS.md`、`packages/*/AGENTS.md` |
| `evoharness`（本仓库） | pi 的下游：生成物禁令、依赖安装安全、多会话共存的明确声明 | 根 `AGENTS.md` |
| `pi-E/durable/ultimate-main` | 自研 lint 最成熟：`no-silent-catch` / `no-test-timeout` / `no-real-wait-in-fast-tests` / `no-local-test-polling`；“行为规则进 prompt，不进代码”这条原则的 origin；commit → 会话 trailer | `lint/ultimate.ts`、`AGENTS.md`、`extensions/coding-tools/` |
| `pi-E/durable/pinomad-main` | 快照与决策的准入：重录需环境变量显式解锁（三把钥匙）、ADR 三条件门槛、拒绝工具链向指令文件注入 | `AGENTS.md`、`docs/adr/README.md` |
| `pi-E/pi-tasks-master` | 兼容范围的双端 CI：下限硬、上限软的不对称设计 | `AGENTS.md`、`.github/workflows/ci.yml` |
| `pi-subagents-main` | 多 agent 协作协议：advisor 只读、默认互不可见、轮次有硬上限 | `skills/council-mode/SKILL.md` |
| `gptme-master` | 上下文持久化路线：跨 harness 共享记忆库、分层根目录、共享字节预算 | `AGENTS.md` |
| `cindy-main` | 隐私流向与术语：值不进模型/日志、术语 glossary | `AGENTS.md` |
| `Claude-Code-main` | 用数字讲因果（构建代价）、`mock.module` 污染排查 | `CLAUDE.md` |
| `penguin-harness-main` | 远端不确定性即发现 | `remote-test.sh` |
| `thinkrail-main` | 减法 pass（唯一"主动减法"） | `AGENTS.md` |
