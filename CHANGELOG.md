# Changelog

## [1.1.0](https://github.com/dgtalbug/dextree/compare/v1.0.1...v1.1.0) (2026-05-24)


### Features

* **core:** framework detection (slice 018) ([#67](https://github.com/dgtalbug/dextree/issues/67)) ([59884ff](https://github.com/dgtalbug/dextree/commit/59884ffa8d5562e45d86e78db4dd8bd71c659eb8))

## [1.0.1](https://github.com/dgtalbug/dextree/compare/v1.0.0...v1.0.1) (2026-05-24)

### Bug Fixes

- **ci:** compile fuzz targets with tsup before running Jazzer.js ([#64](https://github.com/dgtalbug/dextree/issues/64)) ([29dbc48](https://github.com/dgtalbug/dextree/commit/29dbc48ffbc6e951e9ed116ff02a04035f35b06d))

## 1.0.0 (2026-05-24)

### Features

- add auto sync watcher ([#51](https://github.com/dgtalbug/dextree/issues/51)) ([0701a6c](https://github.com/dgtalbug/dextree/commit/0701a6c9bdb45731884e233b03ad63eefcff6695))
- add initial project files including configuration and documentation ([2708dab](https://github.com/dgtalbug/dextree/commit/2708dabb13b7bdffe22855081d856419e1c2c459))
- add setup action, contributing guide, security policy, and update roadmap ([3ee226b](https://github.com/dgtalbug/dextree/commit/3ee226b600630dea0a716b34ba4e985d1fcd9856))
- **ci:** s6.9 release-truth gate ([#53](https://github.com/dgtalbug/dextree/issues/53)) ([1c3678d](https://github.com/dgtalbug/dextree/commit/1c3678d73440c7b6f01ff91267d9e810e902a543))
- **core,extension:** S010 extractor registry + pass-1 CALLS edges + legend wiring ([#49](https://github.com/dgtalbug/dextree/issues/49)) ([02992cb](https://github.com/dgtalbug/dextree/commit/02992cb029a6a2a4738b19e8f7510f44926823d9))
- **core:** s5 persistent workspace cache - migration 004 plus integration tests ([#50](https://github.com/dgtalbug/dextree/issues/50)) ([d061823](https://github.com/dgtalbug/dextree/commit/d0618238f393e172f4698583c4bac29cd7dbff34))
- **core:** schema alignment + migration scaffolding (slice 009 — S3.5) ([#48](https://github.com/dgtalbug/dextree/issues/48)) ([50a54b1](https://github.com/dgtalbug/dextree/commit/50a54b1b59b574d9792034ffd976270f71a3377c))
- enhance LoadingState component to accept custom labels ([99a46ba6070](https://github.com/dgtalbug/dextree/commit/99a46ba6070f1a34106211dd92740704e3962b4a))
- **exporters:** s7 hello export workspace graph as .mmd ([#56](https://github.com/dgtalbug/dextree/issues/56)) ([78cdd96](https://github.com/dgtalbug/dextree/commit/78cdd964e026f985db85dbfdfe0d7b5765520681))
- **extension,core:** workspace-scale indexing + hover highlight + PageRank node sizing (slice 008) ([#46](https://github.com/dgtalbug/dextree/issues/46)) ([47be49c](https://github.com/dgtalbug/dextree/commit/47be49cf9db6db3d2c6ba75d43d06a6fb746625e))
- **extension:** persistent workspace cache + graph render fixes (slice 007) ([#31](https://github.com/dgtalbug/dextree/issues/31)) ([8f8c943](https://github.com/dgtalbug/dextree/commit/8f8c943285f1b2d14af6915c5b18bad534d5b9fa))
- **extension:** render pass-1 subgraph with Sigma.js (spec 006) ([81b0e14](https://github.com/dgtalbug/dextree/commit/81b0e148f1b83ebe440249d976f5d08e7347c4ec))
- implement graph visualization with Sigma and Graphology ([99a46ba6070](https://github.com/dgtalbug/dextree/commit/99a46ba6070f1a34106211dd92740704e3962b4a))
- initialize project structure with core and extension packages, add configuration files, and set up TypeScript and ESLint ([40cc652](https://github.com/dgtalbug/dextree/commit/40cc652e8fad927bd8658c50b363ccd9d7af5657))
- update .gitignore and add initial ROADMAP.md ([604fb1c](https://github.com/dgtalbug/dextree/commit/604fb1c7a2def37104b821dccbcc7f28ee675b46))
- update pnpm workspace configuration and add TypeScript compiler options ([f78f832](https://github.com/dgtalbug/dextree/commit/f78f832d2dfabeb99e78ca4d4c2e107a4fc14592))
- **webview:** consolidate graph toolbar into unified horizontal bar ([#58](https://github.com/dgtalbug/dextree/issues/58)) ([80bdc1d](https://github.com/dgtalbug/dextree/commit/80bdc1d9476e9949f25dd13f2d6781b86c59fa80))
- **webview:** implement S3 hello-webview — dextree.openGraphView command ([7d9a8cc](https://github.com/dgtalbug/dextree/commit/7d9a8cc724a4ca1de873ecf6a60ab7b406aa1448))

### Bug Fixes

- add checkout step to all workflows for consistent setup ([06736e8](https://github.com/dgtalbug/dextree/commit/06736e804cab0966705fdd3c7aad5e21f9ea3d23))
- add vitest.webview.config.ts to test files in vitest configuration ([3496c1a](https://github.com/dgtalbug/dextree/commit/3496c1af5d3bb3d54b6164771598490813a151ef))
- **ci:** build core before running fuzz target ([#61](https://github.com/dgtalbug/dextree/issues/61)) ([49246fd](https://github.com/dgtalbug/dextree/commit/49246fd66b50ff828ed8ae94c0aa8be4f896b5d3))
- **ci:** pass CODECOV_TOKEN via env to avoid bash-injection bug in codecov-action@5.0.7 ([e01287a](https://github.com/dgtalbug/dextree/commit/e01287aedf870791bc15138e3ec2b42940858378))
- **ci:** prettier-format dependabot.yml ([4751d46](https://github.com/dgtalbug/dextree/commit/4751d463bf100a038c2571f0b9326a5be9ca4fc2))
- **ci:** remove step-security/harden-runner from docs-deploy ([#55](https://github.com/dgtalbug/dextree/issues/55)) ([97d0007](https://github.com/dgtalbug/dextree/commit/97d00078fb7ac0f68a0d98bbce554ac753ef78fb))
- **ci:** replace removed --exclude-mail flag in lychee args ([2a01465](https://github.com/dgtalbug/dextree/commit/2a01465e92cb8d2e0aea717bf82919b2e8cb3c0d))
- **rulesets:** drop invalid automatic_copilot_code_review_enabled param ([b178f3b](https://github.com/dgtalbug/dextree/commit/b178f3b430c83d8ca3e22afe1ffa715ae7a8a4d7))
- **rulesets:** use 2-level check names (workflow/job, not file/workflow/job) ([ad778ae](https://github.com/dgtalbug/dextree/commit/ad778ae68785f6cfe43822c6e8c8610fcfd01b3f))
- standardize table formatting in CONTRIBUTING.md and SECURITY.md ([2226421](https://github.com/dgtalbug/dextree/commit/2226421061e2843e1af57dd4b3f0ce057629fae3))
- update test:coverage script to ensure build runs before coverage ([e6474c3](https://github.com/dgtalbug/dextree/commit/e6474c318a87e2b79f4ee8b99cb3022801b821bd))
- update WebviewPanelManager to handle graph messages and caching ([99a46ba6070](https://github.com/dgtalbug/dextree/commit/99a46ba6070f1a34106211dd92740704e3962b4a))

### Reverts

- **ci:** roll back orchestrator pattern after startup_failure ([dc573a2](https://github.com/dgtalbug/dextree/commit/dc573a2acaf2792e727944ea7fb1c2c825cf2ff5))
