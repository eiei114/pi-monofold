# pi-monofold

[![CI](https://github.com/eiei114/pi-monofold/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-monofold?color=cb3837&logo=npm)](https://www.npmjs.com/package/pi-monofold)
[![npm downloads](https://img.shields.io/npm/dw/pi-monofold)](https://www.npmjs.com/package/pi-monofold)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Pi Package](https://img.shields.io/badge/Pi-package-6f42c1)](https://github.com/eiei114/pi-monofold)
[![Trusted Publishing](https://img.shields.io/badge/npm-provenance-yellow)](https://docs.npmjs.com/generating-provenance-statements)

Pi extension that folds multiple local repositories and folders into a guarded **Virtual Monorepo** for AI agents.

## What this is

Pi Monofold (`pi-monofold`) keeps repositories physically separate while giving Pi a lightweight manifest, routed writes, workspace-aware reads, guarded commands, and explicit git flows. Documentation, rules, product context, and implementation code can appear as one connected system without migrating everything into a single git repository.

See [docs/usage.md](./docs/usage.md) for configuration, commands, agent tools, and guard behavior.

## Features

- **Virtual monorepo manifest** — declare workspaces and project workspaces in `.pi/monofold.yaml`
- **Routed Markdown writes** — route PRDs, progress notes, and other doc types to configured folders
- **Workspace-aware reads** — list, read, search, and tree views scoped to readable workspaces
- **Capability guard** — block or confirm `read` / `write` / `edit` / `grep` / `find` / `bash` based on workspace tags
- **Focus presets** — tag-based focus targets for the control workspace
- **Natural-language commands** — `/monofold:explore`, `/monofold:write`, `/monofold:config`, `/monofold:git`, and more
- **Strict agent tools** — `monofold_*` tools for programmatic access behind the command surface
- **Config migration** — upgrade legacy `.pi/monofold.yml` with backups and validation

## Install

Pi Monofold is a Pi package. Install it with Pi's package installer from git or npm.

> Security: Pi packages run with full system access. Review packages before installing third-party code.

### From git

```powershell
pi install git:github.com/eiei114/pi-monofold
```

Project-local install:

```powershell
pi install -l git:github.com/eiei114/pi-monofold
```

Pin a version:

```powershell
pi install git:github.com/eiei114/pi-monofold@v0.3.2
```

Try without installing:

```powershell
pi -e git:github.com/eiei114/pi-monofold
```

### From npm

```powershell
pi install npm:pi-monofold
```

Project-local install:

```powershell
pi install -l npm:pi-monofold
```

Pin a version:

```powershell
pi install npm:pi-monofold@0.3.2
```

Try without installing:

```powershell
pi -e npm:pi-monofold
```

## Quick start

1. Install the extension (see [Install](#install)).
2. In your control repository, create `.pi/monofold.yaml` with at least one workspace entry (or run `/monofold:init`).
3. Start Pi in the control repository and run `/monofold:explore show the project workspaces`.
4. Use `/monofold:write` for routed Markdown outputs and `/monofold:git` for guarded git workflows.

Example command flows: [docs/examples.md](./docs/examples.md).

## Usage summary

| Surface | Purpose |
|---------|---------|
| `/monofold:explore` | List, read, search, or inspect workspace trees |
| `/monofold:write` | Create routed Markdown outputs |
| `/monofold:config` | Add or change workspaces and project workspaces |
| `/monofold:git` | Run guarded git status, commit, push, or commit+push |
| `/monofold:guide` | Interactive guide for common flows |
| `/monofold:init` | Create or update `.pi/monofold.yaml` |
| `/monofold:update` | Migrate legacy config and optionally request config edits |

Agent tools (`monofold_list`, `monofold_read`, `monofold_write`, `monofold_git`, `monofold_init`) sit behind these commands. Full reference: [docs/usage.md](./docs/usage.md).

## Package contents

```text
pi-monofold/
├── .github/workflows/
│   ├── auto-release.yml            # Auto-tag + release on merge to main
│   ├── ci.yml                      # Validate on PR / push
│   └── publish.yml                 # Publish to npm (Trusted Publishing)
├── docs/
│   ├── usage.md                    # Config, commands, agent API, guard
│   ├── examples.md                 # Command examples
│   └── release.md                  # Release and publish flow
├── tests/
│   └── focus-preset.test.ts
├── CHANGELOG.md
├── SECURITY.md
├── focus-preset.ts
├── index.ts
├── LICENSE
├── package.json
├── README.md
├── validation.ts
└── tsconfig.json
```

## Development

Clone and validate:

```powershell
git clone https://github.com/eiei114/pi-monofold.git
cd pi-monofold
npm install
npm run check
```

Try the local checkout without installing:

```powershell
pi -e .
```

## Release

Releases are automated. See [docs/release.md](./docs/release.md) for details.

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Merge to `main`.
3. **Auto Release** tags `v<version>` and creates a GitHub release when the tag is new.
4. The tag triggers **Publish**, which publishes to npm with OIDC provenance.

## Security

Pi Monofold intercepts standard Pi tool calls when monofold config is present. Writes and shell commands are allowed only when the resolved workspace grants the matching capability. Git commit/push via raw `bash` is blocked; use `/monofold:git` or `monofold_git` instead.

Report vulnerabilities per [SECURITY.md](./SECURITY.md).

## Links

- **Repository**: <https://github.com/eiei114/pi-monofold>
- **npm**: <https://www.npmjs.com/package/pi-monofold>
- **Issues**: <https://github.com/eiei114/pi-monofold/issues>

## License

[MIT](LICENSE)
