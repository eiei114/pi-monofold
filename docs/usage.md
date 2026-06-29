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
    defaultRouteOverride: design
    focusSkills: [commit]
    targets:
      - targetTags: [control]
  - id: pi-monofold
    label: Pi Monofold project + dev
    defaultRouteOverride: progress
    focusSkills: [commit, pr-review]
    targets:
      - targetTags: [project, pi-monofold]
      - targetTags: [development, pi-monofold]

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

In the TUI, `/monofold:focus` selects Active Focus from a list of preset labels. The default shortcut `ctrl+shift+m` cycles Active Focus forward through `focusPresets` YAML order and the footer status shows `focus: <label> (n/N) ctrl+shift+m`. The MVP does not ship a backward focus shortcut.

The example above includes a generic seed preset `control`. Add matching workspace tags in your own config when you adopt it.

### focusSkills auto-load

Optional `focusSkills` on a preset declares up to six Pi skill names to expose automatically while that preset is Active Focus.

- Use `focusSkills` for a small, stable set of skills you always want for a control/project pair (for example commit helpers for a vault + OSS dev preset).
- Pi still discovers skills through the normal inventory; Monofold only filters the system prompt to the declared names for the active preset.
- Unknown names produce a warning with the missing skill name. Fix the name, install the skill package, or reload Pi after changes.
- Prefer Pi Skill Shiori (`shiori:*`) or `/skill:name` when you need task-triggered discovery across the full catalog instead of a fixed preset bundle.

### defaultRouteOverride

Optional `defaultRouteOverride` on a preset biases Monofold write flows toward a configured route type while that preset is Active Focus.

- Valid values: `default`, `prd`, `design`, `progress`, `issue`, `research`, `decision`.
- Unknown values fail config validation with an actionable error.
- Precedence: explicit `routeType` on `monofold_write` or `--route` on `/monofold:write` always wins; when omitted, Active Focus `defaultRouteOverride` is used; otherwise Monofold falls back to `default`.
- The footer status shows `route:<type>` when the active preset declares an override.
- Use `design` or `progress` for control/docs presets and `progress` or `research` for project/dev presets so write intent defaults match the work mode without hiding explicit route selection.

## Commands

Human-facing commands accept natural-language arguments and hand off interpretation to the Pi agent:

| Command | Purpose |
|---------|---------|
| `/monofold:explore [request]` | List, read, search, or inspect workspace trees |
| `/monofold:write [request]` | Create routed Markdown outputs |
| `/monofold:config [request]` | Add or change workspaces and project workspaces |
| `/monofold:git [request]` | Run git status, commit, push, or commit+push workflows |
| `/monofold:focus` | Select Active Focus from configured `focusPresets` |
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

## Safe read contract (`monofold_read`)

This section is the agent-facing contract for read tools. Implementations live in `file-read-preview.ts`, `read-caps.ts`, and `monofold-read-ops.ts`.

### Why reads are bounded

`monofold_read` resolves paths inside configured workspaces that may live outside the Pi session cwd. Tool output becomes part of the conversation transcript. Unbounded reads risk:

- **Context pollution** — large files or wide search hits consume tokens and crowd out prior reasoning.
- **Accidental full-repo dumps** — tree/search without caps can return thousands of lines.
- **Implicit bias** — an agent may treat the first huge chunk as “the whole file” even when only a preview was intended.

The safe default is therefore **metadata + bounded preview** for files, and **hard caps with explicit truncation markers** for search and tree. Full or larger reads remain available but must be **opt-in** via documented parameters.

### Human vs agent surfaces

| Audience | Preferred surface |
|----------|-------------------|
| Pi agents | `monofold_read` with explicit `mode` and cap parameters |
| Humans | `/monofold:explore` (natural language; the agent chooses tools) |
| Legacy / scripts | `/monofold:read`, `/monofold:tree`, `/monofold:search`, and underscore aliases — same caps, **not** documented as the primary UX |

Do not tell users to prefer `/monofold:read` over `/monofold:explore`. Legacy commands exist for backward compatibility and mirror `monofold_read` behavior.

### Mode: `file`

**Default (no extra parameters):**

1. Read the workspace-relative file from disk.
2. Return a text block with file metadata (`Path`, `Byte size`, `Characters`, `Lines`, `Modified`).
3. Append `--- preview ---` and the preview body.
4. If the preview is smaller than the full file, append `[truncated]` plus a hint: pass `includeContent: true` for the full body, or use `head`, `tail`, and/or `maxChars` for a larger bounded slice.

**Default preview limits:** first **20** lines, then clip to **2,000** characters (whichever is stricter). Small files that already fit both limits are returned in full with `truncated: false` in tool `details`.

**Opt-in parameters (all positive integers when set):**

| Parameter | Effect |
|-----------|--------|
| `includeContent: true` | Return the entire file when `maxChars`, `head`, and `tail` are unset |
| `maxChars` | Cap preview/output characters (applies after line selection) |
| `head` | Include the first N lines in the preview |
| `tail` | Include the last N lines in the preview |
| `head` + `tail` | Show both ends; omitted middle lines appear as `... [N lines omitted] ...` |

**Tool `details` fields (file):** `truncated`, `characterCount`, `lineCount`, `previewLineCount`, `previewCharacterCount`, `includeContent`, and any of `maxChars` / `head` / `tail` that were set.

### Mode: `search`

Runs ripgrep inside the resolved workspace (default path `.`).

**Default caps:** `maxMatches = 50`, `maxChars = 8000` (output character budget across returned lines).

**Truncation:** When matches or characters exceed the cap, the text ends with:

```text
[truncated: showing X of Y matches (maxMatches=…, maxChars=…). Narrow path/query or pass higher maxMatches/maxChars intentionally.]
```

**Opt-in:** Pass higher `maxMatches` and/or `maxChars`, or narrow `path` / `query`.

**Tool `details` fields (search):** `matchCount`, `returnedMatchCount`, `maxMatches`, `maxChars`, `truncated`, optional `hint`.

### Mode: `tree`

Lists files and directories under a workspace path (skips `.git` and `node_modules`).

**Default caps:** `maxEntries = 200`, `depth` default **1** (clamped to **0–5**).

**Truncation:** When traversal or the entry budget stops early:

```text
[truncated: showing X of Y entries (maxEntries=…). Narrow path/depth or pass a higher maxEntries intentionally.]
```

**Opt-in:** Pass higher `maxEntries`, lower `depth`, or a narrower `path`.

**Tool `details` fields (tree):** `entryCount`, `returnedEntryCount`, `maxEntries`, `truncated`, optional `hint`.

### Legacy slash commands (compatibility)

`/monofold:read`, `/monofold:tree`, `/monofold:search`, and related aliases call the same preview/cap logic. Flags mirror tool parameters, for example:

```text
/monofold:read file path/to/file.md --include-content
/monofold:read file path/to/large.log --head 40 --tail 20
/monofold:search "pattern" --max-matches 100 --max-chars 16000
/monofold:tree src --depth 2 --max-entries 500
```

Prefer `/monofold:explore` for interactive use; use `monofold_read` in agent tool calls.

### Agent checklist

1. Start with default `monofold_read` (no caps raised) unless you already know the file is tiny.
2. If `details.truncated` is true or the body contains `[truncated]`, decide whether you need more—do not assume the preview is the full file.
3. Request full content only with `includeContent: true` (file mode, no `head`/`tail`/`maxChars`).
4. For partial follow-ups, prefer `head` / `tail` / targeted `search` over dumping entire large files.
5. Use workspace targeting (`targetTags`, `workspaceName`, etc.) to keep reads inside the intended repo.

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

### Windows paths

On Windows with Git Bash or MSYS, Pi session cwd can arrive as a mixed path such as `C:/c/Users/...` instead of `C:/Users/...`. Pi Monofold normalizes these paths before workspace guard checks.

For Development Workspace work, prefer canonical Windows paths in `cd` targets and in `.pi/monofold.yaml`:

```powershell
cd C:/Users/Keisu/Projects/OSS/pi-weighted-model-router
```

Use forward slashes or escaped backslashes. Avoid `/c/Users/...` style paths when moving between the control repo and OSS dev repos.

