# AGENTS.md — Dextree

> Routing alias for agent frameworks that look for `AGENTS.md` instead of `CLAUDE.md`.
> The full agent instructions are in `CLAUDE.md`. Read that file now — everything there is binding.

---

## Where everything lives

| Location                       | Owner                      | Contents                                               |
| ------------------------------ | -------------------------- | ------------------------------------------------------ |
| `.dextree/design.md`           | Dextree                    | Architecture, schema, VS Code data sources, slice plan |
| `.dextree/rules.md`            | Dextree                    | 37 binding rules — overrides everything else           |
| `.dextree/build.md`            | Dextree                    | Agentic build playbook (Mode A/B, sub-agents, CI)      |
| `.dextree/kickstart.md`        | Dextree                    | Setup guide                                            |
| `.dextree/memory/decisions.md` | Dextree                    | Why key decisions were made                            |
| `.dextree/alfred/`             | Dextree                    | Alfred LLM prompt templates                            |
| `.specify/`                    | **SpecKit — do not touch** | Spec framework config, templates, workflows            |
| `.github/agents/`              | Shared                     | SpecKit agents + Dextree agents coexist                |
| `.github/prompts/`             | SpecKit                    | SpecKit-managed prompts                                |
| `.claude/agents/`              | Dextree                    | Claude Code sub-agents                                 |
| `packages/`                    | Dextree                    | All implementation code                                |

## Priority order

`.dextree/rules.md` > `CLAUDE.md` / `AGENTS.md` > `.dextree/design.md`

## Lane boundaries

| Agent   | Owns                                                         | Does not touch                                                           |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Claude  | `packages/*/src/`, tests, JSDoc                              | README, CHANGELOG, marketplace metadata, `.specify/`, `.github/prompts/` |
| Copilot | Review, user docs, release notes                             | Implementation, tests, `.dextree/`, `.specify/`                          |
| SpecKit | `.specify/`, `.github/prompts/`, `.github/agents/` (its own) | `packages/`, `.dextree/`                                                 |
