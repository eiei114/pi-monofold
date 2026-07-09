# Focus preset design

Design notes for Pi Monofold **Focus presets** — the control-repo mechanism for switching Active Focus between tag-based workspace contexts without broad scanning or hidden automation.

Related references:

- User guide: [usage.md](./usage.md) (`focusPresets`, `decisionNoteDestination`, `focusSkills`, `defaultRouteOverride`)
- Examples: [examples.md](./examples.md)
- Dogfood reviews: [focus-skills-dogfood.md](./focus-skills-dogfood.md), [focus-decision-note-dogfood.md](./focus-decision-note-dogfood.md)

## Goals

- Give Pi a **bounded** workspace context switch: one active preset at a time, declared in `.pi/monofold.yaml`.
- Surface preset-specific helpers (skills, route bias, decision note) only while that preset is Active Focus.
- Fail visibly when configuration or runtime state is incomplete — never silently skip a declared destination.

## Preset shape

Each `focusPresets[]` entry has:

| Field | Purpose |
|-------|---------|
| `id` | Stable preset identifier (persisted in `.pi/monofold-focus-session.json`) |
| `label` | Human label for `/monofold:focus` and footer status |
| `targets[]` | Tag selectors that define which workspace targets belong to this preset |
| `focusSkills` (optional) | Up to six Pi skill names auto-loaded for the active preset |
| `defaultRouteOverride` (optional) | Default `monofold_write` route while active |
| `decisionNoteDestination` (optional) | One reusable Markdown file for decision capture |

Activation flow:

1. User selects a preset (`/monofold:focus`, shortcuts, or session restore).
2. Monofold validates targets against configured workspaces (config load) and warns on zero matches (runtime).
3. `before_agent_start` injects focus context (manifest recomposition, context files, optional decision note) under explicit caps.
4. Footer status and `monofold_list` expose Active Focus health (preset, route, skills, decision note, warnings).

## decisionNoteDestination

### Problem

Repeated control/project work often revisits the same rolling decision log. Manual `monofold_read` on every turn adds friction; broad workspace search for “the decisions file” violates the bounded Focus model.

### Solution

Optional `decisionNoteDestination` declares **one** workspace-internal path per preset:

```yaml
decisionNoteDestination:
  targetTags: [control, markdown]
  path: Decisions/ACTIVE.md
```

Resolution rules:

- `targetTags` must match **exactly one** configured workspace (validated at config load).
- `path` must be workspace-relative (no `..`, no absolute paths).
- Matched workspace must include `read` capability.

Runtime behavior when the preset is Active Focus:

| State | Behavior |
|-------|----------|
| File exists and readable | Bounded preview injected before other focus context files; destination shown in manifest/footer |
| File missing | Visible warning once per activation; manifest shows “configured but unavailable”; no injection |
| Workspace unmatched at runtime | Visible warning; manifest shows “missing workspace”; no injection |
| Field omitted | No-op — ordinary focus behavior only |

Monofold does **not** scan workspaces for decision files, auto-create notes, or sync multiple destinations.

### Control + project example

Typical control / OSS dev pair (also in [usage.md](./usage.md) and [examples.md](./examples.md)):

```yaml
focusPresets:
  - id: control
    label: Control docs
    decisionNoteDestination:
      targetTags: [control, markdown]
      path: Decisions/ACTIVE.md
    targets:
      - targetTags: [control, markdown]
  - id: pi-monofold
    label: Pi Monofold
    decisionNoteDestination:
      targetTags: [project, pi-monofold]
      path: Progress/DECISIONS.md
    targets:
      - targetTags: [project, pi-monofold]
      - targetTags: [development, pi-monofold]
```

Focus cycling (`ctrl+shift+m` / `shift+ctrl+f`) switches which decision note is surfaced without changing config.

### vs ordinary manual note-taking

| Approach | When to use |
|----------|-------------|
| `decisionNoteDestination` | One reusable rolling log per preset; agent should see recent decisions each turn while that preset is active |
| `monofold_write` with `routeType: decision` | One-off routed decision documents (new file per write) |
| Manual `monofold_read` | Ad-hoc inspection without tying a file to Active Focus |
| Broad journaling / multi-file sync | Out of scope — use external tooling or explicit writes |

**When not to use:** presets without an ongoing decision log (adds prompt noise); multi-destination capture; hidden note generation.

## Non-goals

- Broad journaling automation or background note creation
- Multi-destination sync per preset
- Workspace-wide search for “any decisions file”
- Replacing explicit `monofold_write` routed decision flows

## Test coverage map

| Case | Tests |
|------|-------|
| Configured destination parses and validates | `tests/focus-decision-note.test.ts`, `tests/focus-preset.test.ts` |
| Missing file warns and skips injection | `tests/focus-decision-note-integration.test.ts` |
| Omitted destination (disabled) is no-op | `tests/focus-decision-note-integration.test.ts` |
| Injection + truncation caps | `tests/focus-decision-note-integration.test.ts`, `tests/focus-context-injection.test.ts` |
