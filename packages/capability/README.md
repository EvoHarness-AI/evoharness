# @evoharness/capability

The permission vocabulary and the descriptor shape every capability declares. `docs/structure.md` §1
principle 4 requires a capability to describe itself; this package is what "itself" means, so the
assembly layer can check declarations instead of trusting them.

## What a declaration is

A permission id names the outer edge of what a tool is allowed to affect: `fs.write`, `net.out`,
`process.exec`, and the rest are listed in `src/permissions.ts`, which is the only place that list
exists. `docs/` does not copy it, because two authorities drift.

**Declaring a permission grants nothing.** It is metadata the policy layer reads. Enforcement lives
in the `policy` module (`docs/architecture.md` §3), and until roadmap item 2 lands no tool call is
blocked on the strength of these ids. A tool that declares `fs.read` and then writes a file has lied
in its declaration; nothing stops it yet.

Where the ids come from: `ALL_PERMISSIONS` is versioned by `PERMISSION_SCHEMA_VERSION` because item 2
persists approval rules keyed by these ids and item 18 groups a cost ledger by them. Renaming an id
is therefore a data migration, not an edit. Append only; never reuse.

## Who reads it

- `core/extensions/loader.ts` checks a declaration when an extension registers a tool, so a malformed
  one is a load error naming the extension.
- `core/extensions/tool-permissions.ts` checks the entrances that never pass through the extension
  API (tools handed in by an SDK host) and reports a custom tool that takes a built-in's name, with
  both ceilings side by side: replacing `bash` is allowed, doing it silently is not.
- Item 2's policy reads the declared set from `AgentSession._toolDefinitions` (via
  `getToolDefinition(name)`), **not** from `AgentTool`: the wrapper into the kernel loop drops
  definition-only fields on purpose, and widening it would be a `KERNEL.md` §3 B-tier change.
- `scripts/check-capability-boundaries.mjs` records every file that still registers a tool without
  declaring, in `scripts/capability-permissions.baseline.json`. That ledger is a ratchet like
  `file-size`'s: it may only shrink, and an entry whose file has gone fails until pruned. It records
  today's shape, not an intention - the 43 entries are what predates this contract.

## What is not here

No judgement about whether a call should be allowed, no persistence, no approval flow. Those are
item 2. One rule item 2 must keep: an **undeclared** tool is *unknown*, not harmless - reading it as
`fs.read`-only would be a false claim, so unknown is the strictest case. Nor does a narrower
replacement of a built-in pass: inheriting the name `bash` while disclaiming `process.exec` would
inherit that name's policy treatment, and the merge refuses it.

`validateCapability` exists so the first `cap-*` package has a rule to meet, and it will be
called by `scripts/check-capability-boundaries.mjs` once such a package exists; today nothing in the
runtime calls it.
