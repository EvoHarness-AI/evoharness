# @evoharness/web

Web UI for the EvoHarness coding agent: a local Next.js server that hosts agent
sessions, renders streaming responses, and exposes the full feature surface —
sessions, scheduled tasks, MCP, skills, worktrees, terminals — over HTTP. The
same UI serves the browser and (in a later phase) the desktop shell through the
host bridge in [`lib/host.ts`](lib/host.ts).

## Run from the repository

```bash
npm install --ignore-scripts   # from the repo root, once
npm run build                  # the app runs on the built @evoharness/* packages
npm run dev --workspace=@evoharness/web
# → http://127.0.0.1:30141
```

The app only consumes the `@evoharness/*` packages' public exports, and those
`exports` point at built `dist/` output — re-run the root `npm run build` after
changing anything under `packages/*/src`.

## Checks

```bash
npm run check:web   # static gate: tsc, rename-residue / boundary / doc-link guards
npm run test:web    # unit tests (node:test, ported from upstream)
```

`npm run lint` (eslint) is available but not part of the gate yet: the root
toolchain is on TypeScript 7 while typescript-eslint supports <6.1 — see the
spec's carry-over table.

## Attribution

Ported from [pi-agent-desktop](https://github.com/abcwyc/pi-agent-desktop) — a
fork of [pi-web](https://github.com/agegr/pi-web), MIT, Copyright (c) 2026
agegr — which packages the pi coding agent's web UI. See [LICENSE](LICENSE).
