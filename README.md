# pi-monofold

[![Join dotfield.xyz on Discord](https://img.shields.io/badge/Join%20dotfield.xyz%20on%20Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/4945dXZVW5)

[![CI](https://github.com/eiei114/pi-monofold/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-monofold?color=cb3837&logo=npm)](https://www.npmjs.com/package/pi-monofold)
[![npm downloads](https://img.shields.io/npm/dw/pi-monofold)](https://www.npmjs.com/package/pi-monofold)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Pi Package](https://img.shields.io/badge/Pi-package-6f42c1)](https://github.com/eiei114/pi-monofold)
[![Trusted Publishing](https://img.shields.io/badge/npm-provenance-yellow)](https://docs.npmjs.com/generating-provenance-statements)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

Pi extension that folds multiple local repositories and folders into a guarded **Virtual Monorepo** for AI agents.

## What this is

Pi Monofold (`pi-monofold`) keeps repositories physically separate while giving Pi a lightweight manifest, routed writes, workspace-aware reads, guarded commands, and explicit git flows. Documentation, rules, product context, and implementation code can appear as one connected system without migrating everything into a single git repository.

See [docs/usage.md](./docs/usage.md) for configuration, commands, agent tools, and guard behavior.

## Features

- **Virtual monorepo manifest** — declare workspaces and project workspaces in `.pi/monofold.yaml`
- **Multi-runtime path overlays** — keep one logical workspace definition while swapping absolute repo roots per runtime
- **Routed Markdown writes** — route PRDs, progress notes, and other doc types to configured folders
- **Workspace-aware reads** — list, read, search, and tree views scoped to readable workspaces, with bounded previews by default
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
pi install git:github.com/eiei114/pi-monofold@v0.12.3
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
pi install npm:pi-monofold@0.12.3
```

Try without installing:

```powershell
pi -e npm:pi-monofold
```

## Quick start

1. Install the extension (see [Install](#install)).
2. In your control repository, create `.pi/monofold.yaml` with at least one workspace entry (or run `/monofold:init`).
3. Start Pi in the control repository and run `/monofold:explore show the project workspaces`.
4. Use `/monofold:focus`, `ctrl+shift+m`, or `shift+ctrl+f` to switch focus presets when `focusPresets` are configured. Active Focus is restored automatically on the next Pi session in the same control repository.
5. Use `/monofold:write` for routed Markdown outputs and `/monofold:git` for guarded git workflows.

Example command flows: [docs/examples.md](./docs/examples.md).

## Usage summary

| Surface | Purpose |
|---------|---------|
| `/monofold:explore` | List, read, search, or inspect workspace trees |
| `/monofold:write` | Create routed Markdown outputs |
| `/monofold:config` | Add or change workspaces and project workspaces |
| `/monofold:git` | Run guarded git status, commit, push, or commit+push |
| `/monofold:focus` | Select the active focus preset from a TUI list |
| `/monofold:focus-prev` | Cycle Active Focus backward through `focusPresets` YAML order |
| `/monofold:guide` | Interactive guide for common flows |
| `/monofold:init` | Create or update `.pi/monofold.yaml` |
| `/monofold:update` | Migrate legacy config and optionally request config edits |

Default focus shortcuts: `ctrl+shift+m` cycles Active Focus forward and `shift+ctrl+f` cycles backward through `focusPresets` YAML order. Both wrap at the start/end of the list.

When Active Focus is set, Pi Monofold injects the active preset's `contextFiles` into each agent turn under **Focus Context Injection** and recomposes the manifest so active Workspace Targets are shown first while non-active targets are collapsed to one-line summaries. Tag-based target inference in `monofold_read`, `monofold_write`, and `monofold_git` also prefers Workspace Targets that belong to the active preset when a tag query would otherwise match multiple candidates; explicit `targetId` / workspace name selectors and uniquely matching targets are unchanged. If multiple in-focus targets still tie, the existing workspace selection flow applies. The MVP uses provisional context-injection caps that are intentionally temporary and exposed as constants for future tuning:

- Max **6** context files per active preset.
- Max **6,000** characters per file, with `… [truncated]` appended when a file is cut.
- Max **12,000** injected file-content characters per turn; remaining files are skipped and a warning is surfaced once for that turn.

Agent tools (`monofold_list`, `monofold_read`, `monofold_write`, `monofold_git`, `monofold_init`) sit behind these commands. Use `monofold_list` as the first-line Active Focus health check (preset, route override, unresolved targets, and warnings). Full reference: [docs/usage.md](./docs/usage.md).

## Safe read defaults

`monofold_read` can reach files across multiple configured workspaces. Returning full file bodies or unbounded search/tree output by default would flood the agent chat and can bias later turns. Pi Monofold therefore uses **preview-first, capped-by-default** reads.

| `monofold_read` mode | Default output |
|----------------------|----------------|
| **file** | Path, size, line/character counts, modified time, then a bounded preview (first **20** lines, up to **2,000** characters). Files that already fit those bounds are shown in full without a truncation marker. |
| **search** | Up to **50** match lines and **8,000** characters of ripgrep output. |
| **tree** | Up to **200** entries; traversal depth is capped at **5**. |

When output is cut, the tool response includes a **`[truncated]`** marker (file mode) or a **`[truncated: …]`** footer (search/tree) that states what was shown and how to request more.

**Request more content intentionally:**

| Goal | `monofold_read` parameters |
|------|----------------------------|
| Full file body | `mode: "file"`, `includeContent: true` |
| Larger bounded file slice | `head`, `tail`, and/or `maxChars` (positive integers) |
| More search results | Higher `maxMatches` and/or `maxChars`, or a narrower `path` / `query` |
| Larger directory tree | Higher `maxEntries`, lower `depth`, or a narrower `path` |

Agents should call **`monofold_read`** (not guess at raw Pi `read`). Humans should use **`/monofold:explore`** with natural language. Legacy slash commands such as `/monofold:read` apply the same caps for compatibility but are **not** the preferred human-facing surface—see [docs/usage.md](./docs/usage.md#safe-read-contract-monofold_read).

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
├── scripts/
│   └── check-version-bump.mjs      # PR version bump guard (CI)
├── tests/
│   ├── file-read-preview.test.ts
│   ├── focus-command.test.ts
│   ├── focus-context-injection.test.ts
│   ├── focus-decision-note-integration.test.ts
│   ├── focus-decision-note.test.ts
│   ├── focus-inference-bias.test.ts
│   ├── focus-preset.test.ts
│   ├── focus-route-override-integration.test.ts
│   ├── focus-route-override.test.ts
│   ├── focus-session-restore.test.ts
│   ├── focus-session-state.test.ts
│   ├── focus-skills-auto-load.test.ts
│   ├── focus-skills.test.ts
│   ├── changelog-hygiene.test.ts
│   ├── github-actions-pin.test.ts
│   ├── monofold-read-caps.test.ts
│   ├── monofold-read-ops.test.ts
│   ├── path-normalize.test.ts
│   ├── readme-package-contents.test.ts
│   ├── release-docs.test.ts
│   ├── readme-version-pin.test.ts
│   ├── runtime-path-overlays.test.ts
│   └── unknown-path-allows.test.ts
├── CHANGELOG.md
├── SECURITY.md
├── file-read-preview.ts
├── focus-decision-note.ts
├── focus-preset.ts
├── focus-route-override.ts
├── focus-session-state.ts
├── focus-skills.ts
├── index.ts
├── LICENSE
├── monofold-read-ops.ts
├── package.json
├── path-normalize.ts
├── read-caps.ts
├── README.md
├── unknown-path-allows.ts
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