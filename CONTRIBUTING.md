# Contributing to Dextree

Thanks for your interest in Dextree. This guide covers how to set up your
environment, the workflow for opening a pull request, and the conventions the
project follows.

## Environment

- **Node** ≥ 22.0.0
- **pnpm** exactly `11.1.2` (the lockfile and `engines` field enforce this)
- **VS Code** ≥ 1.85.0 for running the extension locally

```bash
git clone https://github.com/dgtalbug/dextree.git
cd dextree
pnpm install --frozen-lockfile
pnpm build
```

## Project structure

Documentation about how the project is laid out and what code lives where:

- `.dextree/design.md` — architecture, schema, slice plan
- `.dextree/rules.md` — binding constraints (read this first)
- `.dextree/memory/decisions.md` — why key choices were made
- `specs/` — feature specifications managed via SpecKit
- `packages/` — all source code (`core`, `extension`, future surfaces)

## Workflow

Dextree uses a vertical-slice workflow. Every change goes through:

1. A spec in `specs/NNN-<slice>/` describing **what** changes and **why**
2. A plan and tasks file describing **how**
3. An implementation PR on a feature branch

### Branch naming

- `feature/slice-<N>-<short>` — feature work, where `N` matches the spec number
- `fix/<issue>-<short>` — bug fixes
- `refactor/<scope>-<short>` — refactors

### Commit messages

Conventional Commits. Examples:

- `feat(core): add DuckPGQ query layer`
- `fix(extension): handle missing workspace folder`
- `chore(ci): bump action SHAs`
- `docs: clarify Alfred opt-in flow`

The PR title MUST follow the same format — `release-please` reads it to
generate the changelog.

### Pull requests

- Open as **draft** first
- Fill every section of `.github/PULL_REQUEST_TEMPLATE.md`
- Link the spec issue
- Keep each PR under ~400 LOC net; split larger work into multiple slices
- Mark **ready for review** only after CI is green and self-review is complete

### Required CI checks

Branch protection on `main` requires all of:

- `format` — Prettier check
- `lint` — ESLint with `--max-warnings=0`
- `typecheck` — `tsc --noEmit` across all packages and webview
- `test` — Vitest across all projects
- `build` — full monorepo turbo build
- `package` — `.vsix` assembly
- `dependency-review` — block PRs introducing high-severity vulnerabilities
- One approving review

Plus repository rules:

- Linear history (no merge commits)
- Up-to-date branches before merge
- Resolved conversations before merge
- No force pushes, including admins
- No direct pushes to `main`

## Coding conventions

- TypeScript strict mode. No `any` without a justifying comment.
- Approved libraries only — see `.dextree/rules.md` for the binding list.
- `packages/core` has no VS Code dependencies and must run in browser/WASM contexts.
- No `localStorage` in webviews — use `vscode.postMessage`.
- VS Code CSS variables only in extension webview styles; no hardcoded colours.
- CSS Modules for component styles; no Tailwind, no CSS-in-JS.
- Imports use `@/*` aliases; no deep relative paths.

## Secrets inventory

Maintainers configure these in repository settings:

| Secret              | Used by                                | Phase |
| ------------------- | -------------------------------------- | ----- |
| `GITHUB_TOKEN`      | All workflows (auto-provided)          | 1     |
| `ANTHROPIC_API_KEY` | `claude-handoff.yml`                   | 1     |
| `VSCE_PAT`          | `_publish-marketplace.yml`             | 2     |
| `OVSX_PAT`          | `_publish-openvsx.yml`                 | 2     |
| `CODECOV_TOKEN`     | Optional, for the `test` job           | 1–2   |

## Disclosing security issues

See [`SECURITY.md`](./SECURITY.md). **Do not** open public issues for
vulnerabilities.

## Code of Conduct

Participation in this project is governed by the
[Contributor Covenant](./CODE_OF_CONDUCT.md). Report violations to
`dgtalbug@gmail.com`.
