# Security Policy

## Supported Versions

Dextree is in active pre-1.0 development. Only the latest published release
receives security fixes.

| Version  | Supported          |
| -------- | ------------------ |
| 0.x      | :white_check_mark: |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Report privately via one of:

1. **GitHub Security Advisories** — preferred. Open a draft advisory at
   <https://github.com/dgtalbug/dextree/security/advisories/new>.
2. **Email** — `dgtalbug@gmail.com` with subject prefix `[dextree security]`.

Include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept code if possible)
- The affected Dextree version
- Your disclosure timeline preference

We aim to acknowledge reports within **3 business days** and to provide a
remediation timeline within **10 business days** of acknowledgement.

## Scope

In scope:

- The Dextree VS Code extension and its bundled webview
- The `@dextree/core` package and any sub-package published from this monorepo
- Build pipeline supply-chain issues (e.g., compromised GitHub Actions)

Out of scope:

- Issues in third-party dependencies that have already been disclosed upstream
  (please report those to the upstream project)
- Social engineering or physical attacks
- Denial-of-service against the indexing pipeline on hostile inputs unless it
  results in code execution or data exfiltration

## Disclosure Policy

Coordinated disclosure. We will credit you in the release notes for the fix
unless you ask to remain anonymous.

## Hardening Notes

- Every third-party GitHub Action is pinned to a full commit SHA. Dependabot
  keeps the pins fresh.
- Workflows run `step-security/harden-runner` as their first step to apply
  egress filtering.
- Marketplace publish credentials (`VSCE_PAT`, `OVSX_PAT`) are stored as
  repository secrets and only consumed by reusable publish workflows.
