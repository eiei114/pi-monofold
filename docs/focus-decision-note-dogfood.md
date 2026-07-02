# decisionNoteDestination dogfood review (DOT-392)

Review date: 2026-07-03. Feature landed in v0.10.0 (DOT-391). This note records a bounded dogfood pass across the documented control + project/dev preset pair.

## Presets reviewed

| Preset | decisionNoteDestination | targetTags | Path |
|--------|------------------------|------------|------|
| `control` | Yes | `[control]` | `Decisions/ACTIVE.md` |
| `pi-monofold` | Yes | `[project, pi-monofold]` | `Progress/DECISIONS.md` |

Configs mirror `docs/usage.md` and `docs/examples.md`.

## Findings

### Reduced context-save friction

- **Helpful when a rolling decision log is already maintained.** Declaring `decisionNoteDestination` on Active Focus surfaces the file in the system prompt on every agent turn, making the agent aware of recent context and decisions without manually reading it each time.
- **Helpful for preset-appropriate guidance.** The control preset points to a decisions log under the vault's `Decisions/` route; the project/dev preset points to a progress decisions file under `Progress/`. Each preset sees its own relevant note destination, not one monolithic file.
- **Preset cycling carries the destination.** Forward/backward focus shortcuts (`ctrl+shift+m` / `shift+ctrl+f`) switch which decision note is injected — no manual file tracking needed across different work modes.

### Warning clarity

- **Actionable for missing files.** When `Decisions/ACTIVE.md` does not exist, the warning message includes the preset name, the workspace label, and the expected path. The user knows exactly which file to create.
- **Actionable for missing workspaces.** When `targetTags` match no configured workspace, the warning names the preset and the unmatched tags. Quick to fix in config.
- **Deduplicated per activation.** The warning fires only once per focus activation even if the file remains missing; subsequent agent turns do not repeat the same warning. This avoids spamming the TUI.

### Clarity in manifest output

- `monofold_list` and the injected manifest show:
  - `Decision note destination: #0 Control [control, markdown] ./control:Decisions/ACTIVE.md (available)` — status at a glance
  - `Decision note destination: #0 Control [control, markdown] ./control:Decisions/ACTIVE.md (configured but unavailable)` — when the file is missing
  - `Decision note destination: [control] -> Decisions/ACTIVE.md (missing workspace)` — when tags match nothing
- The `note:Decisions/ACTIVE.md` suffix in the TUI footer status lets you see the destination without running `monofold_list`.

### Injection behavior

- **Decision note content is injected before regular context files.** This is correct: the rolling decision log should appear first as the most relevant context for the preset.
- **Subject to the same caps as context files** (6,000 chars per file, 12,000 chars total, 6 files max). Large decision notes are truncated with `… [truncated]` and a notice.
- **When the file is unavailable, the destination is still listed** (as "configured but unavailable") in manifest output, so you know the intent even without the file ready.

### Redundancy with existing write routes

- **Not redundant with `monofold_write routeType: decision`.** The routed write creates new files per write call; `decisionNoteDestination` points to one reusable file for ongoing capture. They serve different purposes.
- **Not redundant with manual note-taking.** The agent sees the note content automatically and can reason from recent decisions rather than requiring the human to re-assert context.
- **Partial overlap:** When you never use a rolling decision log, `decisionNoteDestination` adds prompt noise without value — omit it and use ordinary writes instead.

### Friction case: no test coverage for large decision notes

During the review I noticed that truncation of large decision notes and combined total-cap behavior with context files had no explicit test coverage. This was a gap, since context file truncation is tested but the decision note path through the same caps was not. **Fixed** in this review — see changes below.

### Friction case: redundant file reads on every agent start

`inspectDecisionNoteDestination` is called by both `buildManifest` and `buildFocusContextInjection` during `before_agent_start`. Each call reads file existence (`access`). This is a minor inefficiency (two stat calls per turn) but not user-visible. Rated low priority for optimization.

## Changes from this review

1. **`tests/focus-decision-note-integration.test.ts`** — added tests for:
   - Large decision note file truncation at the per-file character cap.
   - Decision note + context files combined total cap behavior.
   - Removed dead redundant branching in `makeWorkspaceRoot`.
2. **`docs/usage.md`** — added a when-to-enable recommendation table for `decisionNoteDestination` (matching the `focusSkills` pattern).

## Follow-up (out of scope)

- Cache the `access` call between `buildManifest` and `buildFocusContextInjection` to eliminate the redundant stat on every agent turn (only worth it if profiling shows it matters).
- Optional decision-note-per-preset count in `monofold_list` when a preset has a destination (only if dogfood shows repeated confusion about which preset has a note configured).
- Multi-destination behavior (explicitly out of scope per issue DOT-392 acceptance criteria).
