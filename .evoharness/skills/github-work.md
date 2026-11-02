---
name: github-work
description: Work on GitHub issues and pull requests of this repo. Use when asked to investigate, analyze, fix, or review an issue or PR, and when asked to wrap up such work (changelog, comment, commit, push, close).
---

# Working on GitHub issues and PRs

The repo's prompt templates in `.evoharness/prompts/` (two directories above this skill) define the workflow. Read the matching template in full and follow it. Where a template says `$ARGUMENTS` or `$@`, substitute the issue or PR number or URL from the request, and any extra instructions the user gave.

| Request | Template |
|---|---|
| Investigate, analyze, or fix an issue | `.evoharness/prompts/is.md` |
| Review a pull request | `.evoharness/prompts/pr.md` |
| Wrap up issue or PR work: changelog, final comment, commit, push, close | `.evoharness/prompts/wr.md` |

Rules:

- `is.md` analyzes and proposes only. Implement only when the user asks for it, then keep following AGENTS.md (checks, tests, changelog rules).
- `pr.md` never checks out or switches to the PR branch.
- Run `wr.md` only when the user asks to wrap up, commit, or push. Wrapping up is not itself a request to speak publicly: post a GitHub comment only when the user asked for one, at most one per session, ending with the exact disclaimer line `wr.md` specifies. Without that request the reasoning goes in the commit message.
- When a request spans several steps, for example "fix issue X and wrap it up", read every template involved before starting.
