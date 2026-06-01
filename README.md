# Pi Monofold

[![npm version](https://img.shields.io/npm/v/pi-monofold?color=cb3837&logo=npm)](https://www.npmjs.com/package/pi-monofold)
[![Publish to npm](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/publish.yml)
[![Auto Release](https://github.com/eiei114/pi-monofold/actions/workflows/auto-release.yml/badge.svg)](https://github.com/eiei114/pi-monofold/actions/workflows/auto-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Pi Package](https://img.shields.io/badge/Pi-package-6f42c1)](https://github.com/eiei114/pi-monofold)

Pi Monofold (`pi-monofold`) is a Pi Coding Agent extension that folds multiple local repositories and folders into a guarded **Virtual Monorepo** for AI agents.

It keeps repositories physically separate, while giving Pi a lightweight manifest, routed writes, workspace-aware reads, guarded commands, and explicit git flows.

## Why

AI coding agents work best when documentation, rules, product context, and implementation code are visible as one connected system. Physical monorepos are not always practical. Pi Monofold gives Pi a logical monorepo boundary without forcing repository migration.

## Install

Pi Monofold is a Pi package. Install it with Pi's package installer from git or npm.

> Security: Pi packages run with full system access. Review packages before installing third-party code.

### From git

```powershell
pi install git:github.com/eiei114/pi-monofold
```

Install into the current project settings instead of user settings:

```powershell
pi install -l git:github.com/eiei114/pi-monofold
```

Pin a version/ref:

```powershell
pi install git:github.com/eiei114/pi-monofold@v0.1.0
```

Try without installing:

```powershell
pi -e git:github.com/eiei114/pi-monofold
```

### From npm

After the package is published to npm:

```powershell
pi install npm:pi-monofold
```

Install into the current project settings instead of user settings:

```powershell
pi install -l npm:pi-monofold
```

Pin a version:

```powershell
pi install npm:pi-monofold@0.1.0
```

Try without installing:

```powershell
pi -e npm:pi-monofold
```

### Local development

```powershell
git clone https://github.com/eiei114/pi-monofold.git
cd pi-monofold
npm install
npm run typecheck
```

Try the local checkout without installing:

```powershell
pi -e .
```

## Config

Place config in the control repository:

```text
<control-repo>/.pi/monofold.yaml
```

Example:

```yaml
version: 1

defaults:
  filenameTemplate: "{{date}}-{{slug}}.md"
  metadata:
    created: "{{date}}"
    source: "pi-monofold"

focusPresets:
  - id: control
    label: Control workspace focus
    targets:
      - targetTags: [control]

workspaces:
  - name: "Product docs"
    path: "../business"
    tags: [business, markdown, planning]
    capabilities: [read, writeDocs, git]
    contextFiles: [README.md, CONTEXT.md]
    routes:
      default: "Notes"
      prd:
        path: "Docs/PRD"
        filenameTemplate: "prd-{{slug}}.md"
        metadata:
          type: prd
    projects:
      - name: "Launch plan"
        path: "Projects/Launch"
        tags: [project, launch]
        contextFiles: [CONTEXT.md]
        routes:
          default: "."
          progress: "Progress"

  - name: "Application"
    path: "../app"
    tags: [development, app]
    capabilities: [read, editCode, runCommands, git]
    contextFiles: [README.md, AGENTS.md]
```

## Focus presets

Optional `focusPresets` define tag-based focus targets for the control workspace. Preset `id` values must be unique. Each target uses `targetTags`, matching workspace tags the same way as other Monofold target selectors. Targets that match zero configured workspaces are allowed in config and emit a runtime warning when the active preset is applied.

Active focus (the selected preset id) lives in extension session memory only. It resets when Pi restarts. When `focusPresets` is non-empty, the first preset in YAML order becomes active at session start unless a later slice changes it.

The example above includes a generic seed preset `control`. Add matching workspace tags in your own config when you adopt it.

## Commands

Human-facing commands accept natural-language arguments and hand off interpretation to the Pi agent:

- `/monofold:explore [request]`: list, read, search, or inspect workspace trees.
- `/monofold:write [request]`: create routed Markdown outputs.
- `/monofold:config [request]`: add or change Workspaces and Project Workspaces.
- `/monofold:git [request]`: run git status, commit, push, or commit+push workflows.
- `/monofold:guide`: start an interactive guide for Explore, Write, Config, Git, init, and update flows.
- `/monofold:init`: create or update `.pi/monofold.yaml` with an interactive wizard.
- `/monofold:update [request]`: migrate/clean up legacy config and optionally hand a config-change request to the agent.

Examples:

```text
/monofold:explore show the project workspaces
/monofold:write write today's progress note for Pi Monofold
/monofold:config add 4_Project/NewApp as a Project Workspace under Obsidian Vault with tag project,newapp
/monofold:git commit and push the pi-monofold dev workspace
/monofold:guide
```

Fine-grained legacy commands such as `/monofold:list`, `/monofold:read`, `/monofold:search`, `/monofold:tree`, `/monofold:add`, `/monofold:project-add`, and underscore aliases are not part of the human command surface.

## Agent API

Pi agents use strict `monofold_*` tools behind the natural-language command surface:

- `monofold_list`: show manifest and git status summary.
- `monofold_read`: read files, search text, or show a tree inside readable workspaces.
- `monofold_write`: create routed Markdown outputs by `routeType`, `title`, and `body`.
- `monofold_git`: run guarded workspace git `status`, `commit`, `push`, or `commitPush`.
- `monofold_init`: queue `/monofold:init`.

Project Workspaces are listed under `workspaces[].projects`. Their `path` is relative to the parent workspace, `tags` are combined with parent tags, `capabilities` inherit unless explicitly replaced, and missing routes default to `default: "."` when the effective target has `writeDocs`.

## Updating configuration

`.pi/monofold.yaml` is the canonical config file. Legacy `.pi/monofold.yml` is still readable. Intent commands try to migrate a legacy-only config automatically, show a notice, and continue with the legacy config if migration fails. `/monofold:update` migrates or cleans up legacy config, writes timestamped backups such as `.pi/monofold.yml.bak-20260524-153012`, and removes the legacy file after a successful write. If both `.yaml` and `.yml` exist, normal intent commands prefer canonical `.yaml`; `/monofold:update` handles legacy cleanup.

`/monofold:update` is a configuration migration command, not a Pi package updater. Use `pi update`, `pi update --extensions`, or `pi install ...@new-ref` for package updates.

After migration, you can provide a natural-language configuration change request. The command hands that request to the Pi agent, which edits `.pi/monofold.yaml` directly and validates the result through the manifest path:

```text
/monofold:update add 4_Project/NewApp as a Project Workspace under Obsidian Vault with tags project,newapp and progress route Progress
```

## Guard

When `.pi/monofold.yaml` or legacy `.pi/monofold.yml` exists, Pi Monofold guards standard `read/write/edit/grep/find/bash` calls against workspace capabilities.

- Unknown path: confirm in UI, block without UI.
- Docs write: requires `writeDocs`.
- Code edit: requires `editCode`.
- Bash: requires workspace cwd and `runCommands`.
- Git commit/push via bash: blocked; use `/monofold:git` or the `monofold_git` agent tool.
