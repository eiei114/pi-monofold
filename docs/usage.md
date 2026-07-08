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
    decisionNoteDestination:
      targetTags: [control]
      path: Decisions/ACTIVE.md
    targets:
      - targetTags: [control]
  - id: pi-monofold
    label: Pi Monofold project + dev
    defaultRouteOverride: progress
    focusSkills: [commit, pr-review]
    decisionNoteDestination:
      targetTags: [project, pi-monofold]
      path: Progress/DECISIONS.md
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
    pathOverlays:
      mac-eiei114: /Users/eiei114/IMspace/oss/app
      win-keisu: C:/Users/Keisu/Projects/OSS/app
    tags: [development, app]
    capabilities: [read, editCode, runCommands, git]
    contextFiles: [README.md, AGENTS.md]
```

## Runtime path overlays

Optional `pathOverlays` lets one logical workspace resolve to different absolute roots on different runtimes.

- Keys are runtime IDs such as `mac-eiei114` or `win-keisu`.
- Values must be absolute paths.
- Pi Monofold resolves the current runtime from `PI_MONOFOLD_RUNTIME` / `MONOFOLD_RUNTIME` when set, otherwise auto-detects a stable local id like `mac-<username>` or `win-<username>`.
- When `pathOverlays[activeRuntime]` exists, Monofold uses that path as the effective workspace root.
- When no overlay matches, Monofold falls back to the base `path`.
- Inactive runtime overlays do not fail validation just because those paths do not exist on the current machine.

Use this when one control repo is shared across multiple machines or OS-specific runtimes, but the same development repo lives at different absolute paths locally.

## Focus presets

Optional `focusPresets` define tag-based focus targets for the control workspace.

- Preset `id` values must be unique.
- Each target uses `targetTags`, matching workspace tags the same way as other Monofold target selectors.
- Targets that match zero configured workspaces are allowed in config and emit a runtime warning when the active preset is applied.

Active focus (the selected preset id) is persisted in `.pi/monofold-focus-session.json` for the Control Repository. When Pi starts a new session in the same Control Repository, Monofold restores the saved preset when it still exists in `focusPresets`; otherwise it falls back to the first preset in YAML order. A malformed session-state file or a deleted preset id does not block startup. When the saved state is explicitly cleared (`activeFocusPresetId: null`), Active Focus stays unset across restarts.

Footer status and manifest output append `[restored]`, `[stale save, using default]`, or `[using default]` when applicable so you can tell whether Focus was restored or freshly chosen.

In the TUI, `/monofold:focus` selects Active Focus from a list of preset labels. The default shortcut `ctrl+shift+m` cycles Active Focus forward and `shift+ctrl+f` cycles backward through `focusPresets` YAML order; the footer status shows `focus: <label> (n/N) ctrl+shift+m / shift+ctrl+f`. `/monofold:focus-prev` mirrors the backward shortcut for discoverability.

The example above includes a generic seed preset `control`. Add matching workspace tags in your own config when you adopt it.

### focusSkills auto-load

Optional `focusSkills` on a preset declares up to six Pi skill names to expose automatically while that preset is Active Focus.

- Use `focusSkills` for a small, stable set of skills you always want for a control/project pair (for example `commit` on a control preset and `commit` + `pr-review` on a project/dev preset).
- Omit `focusSkills` when you rely on Pi's full skill catalog or task-triggered discovery; filtering is opt-in per preset.
- Pi still discovers skills through the normal inventory; Monofold only filters the system prompt to the declared names for the active preset.
- Unknown names produce a warning with the missing skill name. Fix the name, install the skill package, or reload Pi after changes.
- When every declared name is missing, Monofold removes the default skills block and injects nothing. That reduces prompt noise but also hides the full catalog until you fix names or remove `focusSkills`.
- Prefer Pi Skill Shiori (`shiori:*`) or `/skill:name` when you need task-triggered discovery across the full catalog instead of a fixed preset bundle.

**When to enable `focusSkills` (dogfood recommendation):**

| Scenario | Recommendation |
|----------|----------------|
| Control vault with 20+ installed skills | Enable on the control preset with 1–2 stable helpers (for example `commit`) to cut catalog noise. |
| Project/dev preset with known git + review flows | Enable with 2–3 workflow skills; cycle Focus to switch bundles. |
| Exploratory work or unfamiliar repos | Omit `focusSkills`; use Shiori or `/skill:name` instead. |
| Skill names still in flux | Omit until names are stable; missing names strip the catalog without injecting replacements. |

`monofold_list` shows declared `focusSkills` for the active preset alongside route override and health warnings.


### decisionNoteDestination

Optional `decisionNoteDestination` on a preset points Active Focus at one reusable Markdown file for decision capture.

- Declare `targetTags` plus a workspace-internal `path` to a single note file (for example a rolling decision log).
- Monofold resolves that one workspace target and surfaces the destination in `monofold_list`, footer status, and Focus Context Injection.
- When the file exists, its bounded preview is injected alongside other focus context files.
- Missing workspaces fail config validation. Missing files stay a visible runtime warning and otherwise no-op.

**When to use `decisionNoteDestination`:**

| Scenario | Recommendation |
|----------|----------------|
| Control/project preset with one rolling decision log | Enable with a stable path you reuse across sessions. |
| One-off routed decision writes | Omit; use `monofold_write` with `routeType: decision` instead. |
| Broad journaling or multi-file note sync | Out of scope; keep manual writes or external tooling. |

**When to use `decisionNoteDestination` (dogfood recommendation):**

| Scenario | Recommendation |
|----------|----------------|
| Control/project preset with one rolling decision log | Enable with a stable path you reuse across sessions. `monofold_list` and footer status show the destination and availability. |
| Reusable decision log for a second preset (for example pi-monofold) | Add a second `decisionNoteDestination` on a different preset with workspace-targeting tags matching a different workspace; focus cycling switches the injected note file. |
| One-off routed decision writes | Omit; use `monofold_write` with `routeType: decision` instead. |
| Broad journaling or multi-file note sync | Out of scope; keep manual writes or external tooling. `decisionNoteDestination` is for one reusable file per preset. |
| Preset with no ongoing decision log | Omit; leaving it unset avoids prompt noise without any loss of functionality. |

This differs from ordinary note-taking because Monofold only exposes the configured destination for the active preset. It does not scan workspaces, auto-create hidden notes, or replace explicit `monofold_write` routes. Design background: [design-focus-preset.md](./design-focus-preset.md).

### defaultRouteOverride

Optional `defaultRouteOverride` on a preset biases Monofold write flows toward a configured route type while that preset is Active Focus.

- Valid values: `default`, `prd`, `design`, `progress`, `issue`, `research`, `decision`.
- Unknown values fail config validation with an actionable error.

### Active Focus health in monofold_list

Run `monofold_list` (or rely on the injected manifest) to inspect Focus health before deeper debugging:

- current Active Focus preset and YAML position
- `defaultRouteOverride` when declared
- invalid `targetTags`, duplicate selectors, or capability/route mismatches fail config validation before Focus activation
- runtime health warnings such as missing `focusSkills` names (when Pi skill inventory is available) or unavailable `decisionNoteDestination` files

The health block stays compact and does not dump raw internal state.
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
| `/monofold:focus-prev` | Cycle Active Focus backward through `focusPresets` YAML order |
| `/monofold:guide` | Interactive guide for Explore, Write, Config, Git, init, and update flows |
| `/monofold:init` | Create or update `.pi/monofold.yaml` with an interactive wizard |
| `/monofold:update [request]` | Migrate/clean up legacy config and optionally hand a config-change request to the agent |

Fine-grained legacy commands such as `/monofold:list`, `/monofold:read`, `/monofold:search`, `/monofold:tree`, `/monofold:add`, `/monofold:project-add`, and underscore aliases are not part of the human command surface.

More examples: [examples.md](./examples.md).

## Agent API

Pi agents use strict `monofold_*` tools behind the natural-language command surface:

| Tool | Purpose |
|------|---------|
| `monofold_list` | Show manifest, Active Focus health, and git status summary (first-line Focus status check) |
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

