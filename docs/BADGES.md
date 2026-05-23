# Badge ledger

Inventory of every badge currently rendered in [`README.md`](../README.md), plus
candidates to add when their data source becomes available.

## Currently rendered

Listed in the order they appear in the README badge row.

| Badge                 | Source                                        | What it reports                                     | Refresh cadence                                        |
| --------------------- | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| **CI**                | `.github/workflows/ci.yml`                    | Pass/fail of the orchestrator CI run on `main`      | Every push to `main`, every PR                         |
| **CodeQL**            | `.github/workflows/codeql.yml`                | Pass/fail of the weekly + push-to-main CodeQL scan  | Push to `main`, weekly cron (Mon 06:00 UTC)            |
| **OSV-Scanner**       | `.github/workflows/osv-scanner.yml`           | Pass/fail of the vulnerability scan against OSV.dev | Push to `main`, weekly cron (Mon 08:00 UTC)            |
| **Coverage**          | Codecov.io (via `_test.yml` upload)           | Line coverage % from the latest CI run on `main`    | Every CI run on `main`                                 |
| **License: MIT**      | Static shields.io badge                       | Repo license                                        | Static — change only if license changes                |
| **Status**            | Static shields.io badge (`pre-alpha`, orange) | Lifecycle stage                                     | Manual — bump to `alpha` / `beta` / `stable` over time |
| **OpenSSF Scorecard** | `api.securityscorecards.dev`                  | Aggregate Scorecard score (0-10)                    | Weekly scan publishes; badge fetches latest            |

## Badge URLs (cheat sheet)

Workflow badges follow this shape:

```
https://github.com/dgtalbug/dextree/actions/workflows/<file>.yml/badge.svg
```

Static badges via shields.io:

```
https://img.shields.io/badge/<label>-<value>-<color>.svg
```

The current row HTML is in [`README.md`](../README.md) between the hero block
and the first `---`.

## Candidates — add when their data source goes live

These badges have no data today (pre-alpha, no releases, not on Marketplace).
Add them on the milestone shown.

| Badge                        | Trigger to add                                               | Source URL pattern                                                             |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| VS Code Marketplace version  | v0.1 publishes to Marketplace                                | `https://img.shields.io/visual-studio-marketplace/v/dgtalbug.dextree`          |
| VS Code Marketplace installs | v0.1 publishes                                               | `https://img.shields.io/visual-studio-marketplace/i/dgtalbug.dextree`          |
| Open VSX downloads           | v0.1 publishes to Open VSX                                   | `https://img.shields.io/open-vsx/dt/dgtalbug/dextree`                          |
| GitHub release               | First tagged release                                         | `https://img.shields.io/github/v/release/dgtalbug/dextree?include_prereleases` |
| GitHub stars                 | Once ≥ 25 stars (avoids vanity at low counts)                | `https://img.shields.io/github/stars/dgtalbug/dextree?style=social`            |
| OpenSSF Best Practices       | After registering at https://www.bestpractices.dev           | `https://bestpractices.coreinfrastructure.org/projects/<ID>/badge`             |
| SBOM attached                | First release with `sbom.yml` attachment                     | Static or shields.io endpoint pointing at the latest release asset             |
| SLSA Level 3                 | After first signed release (`release.yml` already does this) | `https://slsa.dev/images/gh-badge-level3.svg`                                  |

## Workflows we explicitly do NOT badge

These exist but are not visitor-facing signal:

- `_build.yml`, `_test.yml`, `_package.yml`, `_static-checks.yml`,
  `_spell-check.yml`, `_link-check.yml`, `_dependency-review.yml`,
  `_publish-marketplace.yml`, `_publish-openvsx.yml` — reusable workflows
  rolled up by `ci.yml` / `release.yml`. The `CI` badge already reports
  their aggregate status.
- `auto-merge-dependabot.yml`, `pr-title.yml`, `pr-size-label.yml`,
  `label-sync.yml`, `stale.yml`, `lock-threads.yml` — repo hygiene
  workflows, no useful signal for a reader.
- `sbom.yml`, `pre-release.yml` — only run on release events; surface them
  via release-attached artifacts and the release badge once data exists.

## Refresh / swap procedure

When swapping a badge (e.g. when v0.1 ships and Marketplace data is live):

1. Open [`README.md`](../README.md).
2. Update the inline `<p align="center">` block holding the badges.
3. Keep the row ≤ 8 badges to avoid wrapping awkwardly on common viewport
   widths. Drop a static badge (e.g. status, license) before adding new ones
   beyond 8.
4. Update this ledger to move the badge from "Candidates" to "Currently
   rendered" with the live refresh cadence.
5. Commit as `docs(readme): swap <badge> badge — <reason>`.

## Design rules

- One row of badges, no second row unless absolutely necessary.
- Pair every CI badge with its workflow file path in the alt text — helps
  screen readers and quick navigation.
- Avoid vanity badges. Stars under 25, contributors under 5, and similar
  early-stage counts are noise.
- Prefer live-data badges over static badges. The `Status: Pre-alpha` static
  badge is the one exception — it communicates intent that no API surfaces.
