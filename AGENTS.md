# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Technical prose only, be direct
- Use concise, clear, simple language. Define unavoidable jargon before using it.
- Explain non-trivial designs and problems as: problem, concrete example or short trace, then solution. State why the solution is necessary and distinguish it from optional complexity.
- Prefer concrete behavior and small illustrations over abstract summaries, dense terminology, or unexplained lists of changes.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Task Routing

三个问题决定一次改动欠哪套流程。在动手前回答，而不是等守卫红了再回答。顺序之所以要紧，是因为其中两道门只能与代码在同一次改动里满足，事后补等于没补。

1. **碰内核了吗？** 指 [`KERNEL.md`](KERNEL.md) §1 表里列的任何位置：`packages/agent`，以及 `packages/coding-agent/src/core/` 下的 `agent-session*`、`session-*`、`system-prompt.ts`、`resource-loader.ts`、`event-bus.ts`、`project-trust.ts`、`trust-manager.ts`、`compaction/`、`extensions/`、`tools/`。
   → 先在 `KERNEL.md` §3 选定档位，再在同一次改动里带上那一档的证据：A 档给出所碰机制的契约测试；B、C 档在 `docs/kernel/divergence.md` 新增一条 `## D-xxx`。`npm run check:kernel-audit` 拦的就是这个。
2. **是新的能力或功能吗？** 即新建 `packages/cap-*` 或 `packages/feature-*`。
   → 建目录之前先读 `docs/structure.md` §7（出现条件）与 §4（归属决策树），再把 §5.4 的一页规格复制到 `packages/<name>/docs/spec.md`。`npm run check:feature-spec` 只要求这页存在；它的答案成不成立是评审问题，不是 grep 问题。
3. **是跨包的大功能吗？**
   → 按纵向切片来做，也就是 `packages/chord/docs/next/slices.md` 那套流程：一页规格写清每个 API 的真实调用者、规格获批、构建、审未提交的 diff、提交，延迟的工作记在同一次改动里。自底向上猜调用者的层会被删掉；Chord 的 L2 就是。

三问全答"否"的改动不欠上面任何一套；`CONTRIBUTING.md` 与本文其余规则照样适用。

### 宿主中立的入口

`.evoharness/prompts/` 与 `.evoharness/skills/` 只有在宿主是 evoharness 自身时才会被自动发现。换任何别的宿主，就按下表读文件并照它执行；每个文件 frontmatter 的 `description` 说明了它在什么时候适用。

| 要做的事 | 读哪个 |
|---|---|
| 处理本仓的 GitHub issue 与 PR（总入口） | `.evoharness/skills/github-work.md` |
| 分析 issue（只提方案，被要求才实现） | `.evoharness/prompts/is.md` |
| 审 PR（不 checkout 或切到 PR 分支） | `.evoharness/prompts/pr.md` |
| 收尾：changelog、提交、push、关 issue（评论只在用户要求时发） | `.evoharness/prompts/wr.md` |
| 简化一个已完成的工作包（显著删除需先批准） | `.evoharness/prompts/deslop.md` |
| 发布前审 changelog 条目 | `.evoharness/prompts/cl.md` |
| 找 issue 的疑似重复（只读，不发任何东西） | `.evoharness/prompts/dup.md` |
| 起草或应用安全公告 | `.evoharness/prompts/sa.md` |
| 加一个 LLM provider，含测试矩阵 | `.evoharness/skills/add-llm-provider.md` |
| 在 tmux 里测或冒烟交互模式 | `.evoharness/skills/interactive-testing.md` |
| 准备、发布、恢复一个 release | `.evoharness/skills/release.md` |
| 接下来做哪个功能、按什么顺序（只答顺序与依赖） | `docs/plan/feature-roadmap.md` |

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check node_modules for external API types; don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- In `packages/coding-agent`, resolve package assets through helpers in `src/config.ts`. Do not use `__dirname` directly; the helpers account for source checkouts, npm installations, and standalone binaries.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Use only erasable TypeScript syntax (Node strip-only mode) in code checked by the root config (`packages/*/src`, `packages/*/test`, `packages/coding-agent/examples`): no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs needing JS emit. Use explicit fields with constructor assignments.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.
- Never hardcode key checks (e.g. `matchesKey(keyData, "ctrl+x")`). Add defaults to `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS` so they stay configurable.
- Never modify `packages/ai/src/models.generated.ts` directly; update the catalog definitions in `packages/ai/catalog/` instead (see its README), then regenerate. Including the resulting `models.generated.ts` diff is always OK, even if regeneration includes unrelated upstream model metadata changes. The generated model data in `packages/ai/src/providers/data/` is gitignored: never stage it, and don't look for it in git history.

## Chord v2 Code Style

Binding for `packages/chord/src/next/` and its tests, when writing and when reviewing. The model is evoharness-durable's source.

- Files: one concept per file, named after it; no one-helper files, no grab-bag files. First line: a comment saying what the file is for. Order: imports, exported types, then the public entry point first and its helpers below it in the order they are used; constants right above their first user. A blank line between top-level declarations. Split files by concept, never by size: one concept may take a long file (up to about 1,000 lines is fine); a second concept in a file is the reason to split.
- Functions: every export has a one-line doc comment saying what it does or guarantees. Inline comments explain a non-obvious why (cost, race, decided rule), never what the next line does. Short functions with one job (about 40 lines needs a reason; one `switch` over a tagged union is fine). No boolean flag parameters that switch behaviour: two functions or a tagged value. Never write the same lines twice. Context last: required args, then `context`/`ctx` (always required, as in Durable; optional only on error-reporting paths), then optional args.
- Types and checks: tagged unions for every state and result. Casts only where TypeScript cannot express a decided invariant, each with a short why. Every remaining runtime check names the trust boundary it serves (wire input, schema-checked params and arguments, declaration policy the types cannot express). Same-host values are plain data, immutable by convention: never copied, frozen or walked to enforce it; freeze only Chord-owned metadata when a decision says so. No defensive code against broken adapters, callers or our own modules.
- Cost and memory: no hot-path work a decision did not ask for (walks, copies, compilations, per-call allocations). The function doing counted work counts it through its context; call sites never count for others. Caches are `WeakMap`s keyed by their owner, each with a GC test; no module-level strong caches.
- Names and API: the design's vocabulary (`params`, `binding`, `principal key`), no invented synonyms; decided `ChordError` codes and reasons. Export only what a later layer or app needs. No dev or test modes, no unrequested options.
- Tests: one test file per source file, one `describe` per mechanism, the layer spec's test list case by case; cost guards through the in-memory telemetry adapter; GC tests for every cache and binding. Every slice also adds one or more runnable examples in `packages/chord/test/next/examples/NN-topic.ts`, one topic each, numbered across slices, written as references for Chord's users (Durable's `test/examples/` format: header with what it shows and how to run it, commented steps, printed results).
- Slices: Chord v2 is built in vertical slices (`packages/chord/docs/next/slices.md`). Implementers and reviewers read the slice spec, the feature map in `slices.md` and the whole of `packages/chord/docs/next/design.md` in full, and check the work against all three; slice specs cite design sections for orientation, not as a reading limit.
- Deferred work: anything left to a later slice goes into the section "Carry-over" of `packages/chord/docs/next/slices.md` under that slice, in the same change; a slice's spec and build include every entry of its section.
- `docs/next/` was deleted by the rebrand commit `9990dcb` and restored from `9990dcb^`. The omitted `*/book.md` concatenations and `index.html` renders stay in git history: take them from there when needed instead of re-adding generated files. In `slices.md`, "What exists" is a ledger; the code and `git log` decide what exists.
- Before reporting: re-read every changed file top to bottom as a stranger would; each file must be understandable without jumping around. Then `npm run check` and the layer's tests.

## Commands

- After code changes (not docs): `npm run check` (full output, no tail). Fix all errors, warnings, and infos before committing. Does not run tests.
- `npm run check` never writes. To format, run `npm run check:fix` (biome `--write`, then the same checks); the pre-commit hook runs `check:fix` so the formatting is applied before the commit is created.
- Run `npm run build` whenever something needs built output (`dist/`): tests or benchmarks that import built packages, Durable's workerd suite. Never use it to type check or lint: that is `npm run check`, the preferred check.
- Never run `npm test` unless requested by the user.
- Never run the full vitest suite directly: it includes e2e tests that activate when endpoint/auth env vars are present. For all non-e2e tests, run `./test.sh` from the repo root. Otherwise run specific tests from the package root:
  - Vitest: `node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/specific.test.ts`
  - `packages/tui` (`node:test`): `node --test test/specific.test.ts`
- On Windows, `test.sh` needs bash: run it from Git Bash or WSL, not from PowerShell. `evoharness-test.ps1` / `.bat` launch the interactive CLI in an isolated home; they are not the test runner. Without bash, run the package tests directly instead of `npm test`.
- If you create or modify a test file, run it and iterate on test or implementation until it passes.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` + the faux provider. No real provider APIs, keys, or paid tokens.
- When regressions tests for fixing a github issue, add a comment with the github issue number next to the test.
- For ad-hoc scripts, `write` them to a temp file (e.g. `/tmp`), run, edit if needed, remove when done. Don't embed multi-line scripts in `bash` commands.
- Frozen files: `scripts/file-size.baseline.json` lists files above 1500 lines and `check:file-size` fails on any net gain in them, one line included. Never raise a recorded size with `--write`. Put the new logic in a new file, rewrite in place, or move a block out in the same change; deliberate growth needs `--write --allow-grow` and a reason in the change description (see `docs/structure.md` §1).
- The repo docs are UTF-8 without BOM. On Windows, `Get-Content`, `Select-String` and `git grep` decode them as ANSI and print mojibake: read them with the editor tools or `Get-Content -Encoding UTF8`, and set `[Console]::OutputEncoding` to UTF-8 before grepping.
- Never commit unless the user asks.

## Dependency and Install Security

- Treat npm dep and lockfile changes as reviewed code. Direct registry deps, including internal workspace deps, stay pinned to exact versions.
- When updating `undici`, you MUST read its changelog/release notes for the target version and evaluate whether any changes may affect functionality before applying the update.
- Hydrate/update locally with `npm install --ignore-scripts`; clean/CI-style with `npm ci --ignore-scripts`. Don't run lifecycle scripts unless the user asks.
- If dep metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/install-lock/` needs regen, run `node scripts/generate-coding-agent-install-lock.mjs` (verify with `--check` or `npm run check`). New deps with lifecycle scripts require review and an explicit allowlist entry in that script; never add one silently.
- Pre-commit blocks lockfile commits unless `EVOHARNESS_ALLOW_LOCKFILE_CHANGE=1`. Don't bypass unless the user wants the lockfile change committed.

## Git

Multiple evoharness sessions may be running in this cwd at the same time, each modifying different files. Git operations that touch unstaged, staged, or untracked files outside your own changes will stomp on other sessions' work. Follow these rules:

Committing:

- Only commit files YOU changed in THIS session.
- Stage explicit paths (`git add <path1> <path2>`); never `git add -A` / `git add .`.
- Before committing, run `git status` and verify you are only staging your files.
- `packages/ai/src/models.generated.ts` may always be included alongside your files.
- Message format: `{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <commit message> (optionally multiple lines)`. Message is informative and concise.

Never run (destroys other agents' work or bypasses checks):

- `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`.

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.
- Never force push.

## Issues and PRs

See `CONTRIBUTING.md` for the contributor gate (auto-close workflows, `lgtm`/`lgtmi`, quality bar).

When reviewing PRs:

- Do not run `gh pr checkout`, `git switch`, or otherwise move the worktree to the PR branch unless the user explicitly asks.
- Use `gh pr view`, `gh pr diff`, `gh api`, and local `git show`/`git diff` against fetched refs to inspect PR metadata, commits, and patches without changing branches.
- If you need PR file contents, fetch/read them into temporary files or use `git show <ref>:<path>` without switching branches.

When creating issues:

- Add `pkg:*` labels for affected packages (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`); use all that apply.

When posting issue/PR comments:

- Post a comment only when the user explicitly asked for one on that issue or PR. Wrapping up, committing, pushing, or closing does not by itself authorize one; without that request the reasoning belongs in the commit message.
- Write the comment to a temp file and post with `gh issue/pr comment --body-file` (never multi-line markdown via `--body`).
- Keep comments concise, technical, in the user's tone.
- End every AI-posted comment with the AI-generated disclaimer line specified by the originating prompt (e.g. `This comment is AI-generated by `/wr``).

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the message so merging auto-closes the issue. For multiple issues, repeat the keyword per issue (`closes #1, closes #2`); a shared keyword (`closes #1, #2`) only closes the first.

## 本仓的 GitHub 写入身份

PR 的创建、评论、关闭走仓内脚本 `scripts/github-pr.mjs`（子命令 `whoami` / `view` / `create` / `comment` / `close`），**不走 `gh` 写**。分支、tag、push 仍走 git，SSH 别名 `github-evoharness` 带着仓主身份。

为什么不用 `gh` 写：本机 `gh` 的 active account 是另一个账号，而 active account 是**机器级单一状态**，没有 git 那种 `includeIf` 目录级路由；那个账号对本仓只有 `pull=true`，任何写操作都会 403。上面的读法（`gh pr view` / `gh pr diff` / `gh api`、`git show <ref>:<path>`）照旧可用，审 PR 不切分支那条规则不变。

凭据按这个顺序取，脚本只读文件，绝不从命令行参数拿 token：

1. `--token-file <绝对路径>`。显式给了却读不到时**不回落**到其它来源，以免用未选定的身份写入。本机该文件是 `D:\DEVELOP\Project-main\TypeScript\evoharness.txt`（fine-grained PAT：限单仓 + 仅 Pull requests 读写 + 90 天到期）。它是**本机路径，不在仓库里**：不要把 token 内容写进任何输出、提交或 issue。
2. `$EVOHARNESS_GH_TOKEN`。
3. `~/.config/evoharness/github-pat`。长期放置点，换机器就靠这一项，不用改本文。

脚本自带的两道保险不要绕：每次写操作前先 `GET /user` 比对 login，不是仓主就拒且零个写请求发出；仓被钉死，要动别的仓必须显式 `--allow-repo`。多行文本走 `--body-file` / `--comment-file`，不塞命令行；`create` 可先加 `--dry-run` 看请求体再真发。

报错顺序：先确认 token 路径是**绝对路径**（相对路径在这条链路上会被静默读成空，报 "No usable token in …"，那是路径不是凭据），再跑 `whoami` 看身份与权限，最后才怀疑 token 失效。

## Changelog

Location: `packages/*/CHANGELOG.md` (one per package).

Sections under `## [Unreleased]`: `### Breaking Changes` (API changes requiring migration), `### Added`, `### Changed`, `### Fixed`, `### Removed`.

Rules:

- All new entries go under `## [Unreleased]`. Read the full section first and append to existing subsections; never duplicate them.
- Released version sections (e.g. `## [0.12.2]`) are immutable; never modify them.
- Do not create changelog entries when the work targets a branch other than `main`

Attribution:

- Internal (from issues): `Fixed foo bar ([#123](https://github.com/EvoHarness-AI/evoharness/issues/123))`
- External contributions: `Added feature X ([#456](https://github.com/EvoHarness-AI/evoharness/pull/456) by [@username](https://github.com/username))`

## Releasing

Load and follow [.evoharness/skills/release.md](.evoharness/skills/release.md) for release preparation, publishing, verification, or recovery. The Task Routing table above lists the same file for agents whose host cannot discover skills.

## 用户覆盖

用户的指令与本文任何一条规则冲突时，先取得明确确认再执行覆盖；拿到确认后才动手。
