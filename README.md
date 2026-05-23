# Pi Monofold

Pi Monofold (`pi-monofold`) is a Pi Coding Agent extension that folds multiple local repositories and folders into a guarded **Virtual Monorepo** for AI agents.

It keeps repositories physically separate, while giving Pi a lightweight manifest, routed writes, workspace-aware reads, guarded commands, and explicit git flows.

## Why

AI coding agents work best when documentation, rules, product context, and implementation code are visible as one connected system. Physical monorepos are not always practical. Pi Monofold gives Pi a logical monorepo boundary without forcing repository migration.

## Install for local development

```powershell
cd C:\Users\Keisu\Projects\OSS\pi-monofold
npm install
npm run typecheck
```

Try as a Pi extension:

```powershell
pi -e C:\Users\Keisu\Projects\OSS\pi-monofold
```

## Config

Place config in the control repository:

```text
<control-repo>/.pi/monofold.yml
```

Example:

```yaml
version: 1

defaults:
  filenameTemplate: "{{date}}-{{slug}}.md"
  metadata:
    created: "{{date}}"
    source: "pi-monofold"

workspaces:
  - name: "Product docs"
    path: "../business"
    tags: [business, markdown, planning]
    capabilities: [read, writeDocs, gitCommit]
    contextFiles: [README.md, CONTEXT.md]
    routes:
      default: "Notes"
      prd:
        path: "Docs/PRD"
        filenameTemplate: "prd-{{slug}}.md"
        metadata:
          type: prd

  - name: "Application"
    path: "../app"
    tags: [development, app]
    capabilities: [read, editCode, runCommands, gitCommit, gitPush]
    contextFiles: [README.md, AGENTS.md]
```

## Tools

- `monofold_list`: show manifest and git status summary.
- `monofold_read`: read files, search text, or show a tree inside readable workspaces.
- `monofold_write`: create routed Markdown outputs by `routeType`, `title`, and `body`.
- `monofold_git`: run guarded workspace git `status`, `commit`, or `push`.
- `monofold_init`: queue `/monofold:init`.

## Commands

- `/monofold:list` or `/monofold_list`: show manifest and git status summary.
- `/monofold:add <path> --name "Name" --tags tag1,tag2 --capabilities read,editCode,runCommands,gitCommit`: add a workspace to `.pi/monofold.yml`.
- `/monofold:read file <path> --workspace #0`: read a file from a workspace.
- `/monofold:tree [path] --workspace #0 --depth 2`: show a workspace tree.
- `/monofold:search <query> --workspace #0`: search a workspace.
- `/monofold:write --route progress --title "Title" --body "Markdown body"`: write routed Markdown.
- `/monofold:git status|commit|push --workspace #0`: run guarded workspace git.

Examples:

```text
/monofold:add C:/Projects/app --name "Application" --tags development,app --capabilities read,editCode,runCommands,gitCommit --context README.md,AGENTS.md
/monofold:add ../business --name "Product Docs" --tags business,docs --capabilities read,writeDocs,gitCommit --routes default=Notes,progress=Progress,research=Research
```

## Guard

When `.pi/monofold.yml` exists, Pi Monofold guards standard `read/write/edit/grep/find/bash` calls against workspace capabilities.

- Unknown path: confirm in UI, block without UI.
- Docs write: requires `writeDocs`.
- Code edit: requires `editCode`.
- Bash: requires workspace cwd and `runCommands`.
- Git commit/push via bash: blocked; use `monofold_git`.
