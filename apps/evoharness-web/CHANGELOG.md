# Changelog

## [Unreleased]

### Added
- Initial port of the pi-agent-desktop web UI as `@evoharness/web` (Phase 0 of
  `docs/plan/web-frontend-spec.md`): the vendored Next.js app with the host
  bridge seam (`lib/host.ts`), the renamed branding/env/key surface, and the
  root guards (`check:web`, `test:web`, `check-web-names`, `check-web-boundary`).
