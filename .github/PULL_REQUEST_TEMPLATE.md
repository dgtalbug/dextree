<!--
  Open as a DRAFT first. Mark "Ready for review" only after CI is green and
  self-review is complete. Fill every section below.
-->

## Summary

<!-- 1-3 sentences. What does this PR change, and why now? -->

## Linked spec / issue

<!--
  Reference the slice spec this PR implements, plus any GitHub issue:
    Spec: specs/NNN-<short>/spec.md
    Closes: #<issue-number>

  If this PR has no spec, explain why (typo fix, dependency bump, etc.).
-->

- Spec:
- Closes:

## Slice classification

- [ ] `feat` — new behavior in a Dextree surface
- [ ] `fix` — bug fix
- [ ] `refactor` — internal change, no behavior delta
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `chore` — build, CI, dependencies, tooling
- [ ] `perf` — performance only

## Affected surfaces

<!-- Tick each surface this PR touches. -->

- [ ] `packages/core`
- [ ] `packages/extension` (VS Code host)
- [ ] `packages/extension/src/webview` (React webview)
- [ ] `packages/alfred`
- [ ] `packages/exporters`
- [ ] `packages/mcp`
- [ ] `packages/cli`
- [ ] `packages/web`
- [ ] Build / CI / tooling

## Test plan

<!--
  Bullet list of what was tested and how. Include the exact pnpm commands you
  ran, plus any manual verification (e.g. "Loaded the .vsix in a fresh VS Code
  window, ran Dextree: Index File on a TS project, confirmed the graph view
  rendered").
-->

- [ ]
- [ ]

## Checklist

- [ ] PR title follows Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, etc.)
- [ ] Branch follows `feature/slice-<N>-<short>`, `fix/<issue>-<short>`, or `refactor/<scope>-<short>`
- [ ] `pnpm format:check` passes
- [ ] `pnpm lint` passes (zero warnings — `--max-warnings=0`)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `pnpm package` produces a valid `.vsix` (if extension code changed)
- [ ] Net diff under ~400 LOC, or this PR is split (see CLAUDE.md guideline)
- [ ] No edits to `README.md`, `CHANGELOG.md`, `packages/*/README.md`, or marketplace metadata (docs lane — leave to the docs-lane agent unless the slice explicitly says otherwise)
- [ ] No edits to `.specify/` or existing `specs/NNN-*/` (spec lane — toolchain-managed)
- [ ] No `any` introduced without a justifying comment
- [ ] No native deps added to `packages/core` (must run via WASM in browser contexts)
- [ ] No `localStorage` in webview code (uses `vscode.postMessage`)
- [ ] All new GitHub Action `uses:` references are pinned to a full commit SHA
- [ ] If touching graph schema: pass 1 / pass 2 impact described above

## Notes for reviewers

<!--
  Anything that would help a reviewer: trade-offs you weighed, things you
  intentionally did NOT change, follow-up TODOs filed elsewhere, performance
  measurements, screenshots / GIFs for UI changes, etc.
-->
