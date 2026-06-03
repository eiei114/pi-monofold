# Usage

Pi Monofold configuration lives in the control repository. Place the manifest at:

```text
<control-repo>/.pi/monofold.yaml
```

Legacy `.pi/monofold.yml` is still readable; prefer `.yaml` for new configs.

## Example config

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

Optional `focusPresets` define tag-based focus targets for the control workspace.

- Preset `id` values must be unique.
- Each target uses `targetTags`, matching workspace tags the same way as other Monofold target selectors.
- Targets that match zero configured workspaces are allowed in config and emit a runtime warning when the active preset is applied.

Active focus (the selected preset id) lives in extension session memory only. It resets when Pi restarts. When `focusPresets` is non-empty, the first preset in YAML order becomes active at session start unless a later slice changes it.

The example above includes a generic seed preset `control`. Add matching workspace tags in your own config when you adopt it.

## Commands

Human-facing commands accept natural-language arguments and hand off interpretation to the Pi agent:

| Command | Purpose |
|---------|---------|
| `/monofold:explore [request]` | List, read, search, or inspect workspace trees |
| `/monofold:write [request]` | Create routed Markdown outputs |
| `/monofold:config [request]` | Add or change workspaces and project workspaces |
| `/monofold:git [request]` | Run git status, commit, push, or commit+push workflows |
| `/monofold:guide` | Interactive guide for Explore, Write, Config, Git, init, and update flows |
| `/monofold:init` | Create or update `.pi/monofold.yaml` with an interactive wizard |
| `/monofold:update [request]` | Migrate/clean up legacy config and optionally hand a config-change request to the agent |

Fine-grained legacy commands such as `/monofold:list`, `/monofold:read`, `/monofold:search`, `/monofold:tree`, `/monofold:add`, `/monofold:project-add`, and underscore aliases are not part of the human command surface.

More examples: [examples.md](./examples.md).

## Agent API

Pi agents use strict `monofold_*` tools behind the natural-language command surface:

| Tool | Purpose |
|------|---------|
| `monofold_list` | Show manifest and git status summary |
| `monofold_read` | Read files, search text, or show a tree inside readable workspaces |
| `monofold_write` | Create routed Markdown outputs by `routeType`, `title`, and `body` |
| `monofold_git` | Run guarded workspace git `status`, `commit`, `push`, or `commitPush` |
| `monofold_init` | Queue `/monofold:init` |

Project workspaces are listed under `workspaces[].projects`. Their `path` is relative to the parent workspace, `tags` are combined with parent tags, `capabilities` inherit unless explicitly replaced, and missing routes default to `default: "."` when the effective target has `writeDocs`.

## Updating configuration

`.pi/monofold.yaml` is the canonical config file. Legacy `.pi/monofold.yml` is still readable.

- Intent commands try to migrate a legacy-only config automatically, show a notice, and continue with the legacy config if migration fails.
- `/monofold:update` migrates or cleans up legacy config, writes timestamped backups such as `.pi/monofold.yml.bak-20260524-153012`, and removes the legacy file after a successful write.
- If both `.yaml` and `.yml` exist, normal intent commands prefer canonical `.yaml`; `/monofold:update` handles legacy cleanup.

`/monofold:update` is a configuration migration command, not a Pi package updater. Use `pi update`, `pi update --extensions`, or `pi install ...@new-ref` for package updates.

After migration, you can provide a natural-language configuration change request. The command hands that request to the Pi agent, which edits `.pi/monofold.yaml` directly and validates the result through the manifest path.

## Guard

When `.pi/monofold.yaml` or legacy `.pi/monofold.yml` exists, Pi Monofold guards standard `read` / `write` / `edit` / `grep` / `find` / `bash` calls against workspace capabilities.

| Situation | Behavior |
|-----------|----------|
| Unknown path | Confirm in UI; block without UI |
| Docs write | Requires `writeDocs` |
| Code edit | Requires `editCode` |
| Bash | Requires workspace cwd and `runCommands` |
| Git commit/push via bash | Blocked; use `/monofold:git` or `monofold_git` |
