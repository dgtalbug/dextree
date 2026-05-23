# `docs/` — public assets and reference pages

This directory holds publicly-linkable documentation assets used by the README,
release notes, and other user-facing surfaces.

## Hero image slot — `hero.gif` / `hero.png`

The README has a commented-out hero image slot pointing at this directory. To
ship a hero:

1. Capture a 720p, 3–8 second screen recording of the graph view inside VS Code.
   Static `.png` is also acceptable for v0.1.
2. Save as `docs/hero.gif` (animated) or `docs/hero.png` (static).
3. In [`README.md`](../README.md), uncomment the hero block:

   ```html
   <p align="center">
     <img src="docs/hero.gif" alt="Dextree graph view inside VS Code" width="720" />
   </p>
   ```

4. Optionally add a `hero@2x.png` for high-DPI displays and reference both via
   `srcset` if the static path is chosen.

Recommended capture rules:

- Use the default VS Code dark theme so the graph contrasts cleanly.
- Avoid any private code on screen — capture inside this repo, or a public
  fixture project under [`packages/extension/test/fixtures/`](../packages/extension/test/fixtures/).
- Keep the cursor visible and slow — viewers need to follow what's clicked.
- Trim to the moment the value is demonstrated; do not include the install
  banner or the workspace-folder picker.

## Other assets

| Path                | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `docs/index.html`   | Static landing page for the project (if used)                          |
| `docs/BADGES.md`    | Ledger of every badge shown in the README + how to refresh / swap them |
| `docs/hero.gif`     | Hero image referenced by the README (TBD)                              |
| `docs/screenshots/` | Slice-specific screenshots, if needed later                            |

## What does NOT belong here

- Source code (lives in `packages/`)
- Slice specs (live in `specs/`)
- Internal project docs (live in `.dextree/`)
- Generated build output (`dist/`, `*.vsix`)
