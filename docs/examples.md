# Examples

Natural-language arguments are interpreted by the Pi agent. The quick start below is a copy-and-run baseline; the remaining samples show typical requests.

## Copy-and-run quick start

Run these commands from a control repository. The workspace path `.` keeps the example self-contained, so no sibling repositories or machine-specific paths are required.

1. Create `.pi/monofold.yaml`:

```yaml
version: 1

workspaces:
  - name: Control repository
    path: .
    tags: [control, markdown]
    capabilities: [read, writeDocs, git]
    routes:
      default: Notes
```

2. Start Pi in that repository and confirm the manifest:

```text
/monofold:explore show the configured workspaces
```

Expected result: the `Control repository` workspace is listed with `read`, `writeDocs`, and `git` capabilities.

3. Create a routed Markdown note:

```text
/monofold:write write a short onboarding note for the project
```

Expected result: a Markdown file is created below `Notes/` using the default route. Use `/monofold:explore show the project workspaces` to inspect it.

The config wizard can create or update the same file interactively with `/monofold:init`; use `/monofold:guide` when you want guided Explore, Write, Config, or Git flows.

## Explore

```text
/monofold:explore show the project workspaces
/monofold:explore read README.md from the application workspace
/monofold:explore search for "monofold" in product docs
```

## Write

```text
/monofold:write write today's progress note for Pi Monofold
/monofold:write create a PRD draft for the onboarding redesign
```

## Config

```text
/monofold:config add 4_Project/NewApp as a Project Workspace under Obsidian Vault with tag project,newapp
```

## Focus presets

```text
/monofold:focus
/monofold:focus-prev
ctrl+shift+m
shift+ctrl+f
```

Use `monofold_list` first to inspect Active Focus health (preset, route override, declared `focusSkills`, decision-note destination, unresolved targets, and warnings).

See also:

- [focus-skills-dogfood.md](./focus-skills-dogfood.md) — bounded dogfood review of `focusSkills`
- [focus-decision-note-dogfood.md](./focus-decision-note-dogfood.md) — bounded dogfood review of `decisionNoteDestination`
- [design-focus-preset.md](./design-focus-preset.md) — Focus preset design including decision-note capture

`/monofold:focus` opens a TUI selector by preset label. `ctrl+shift+m` cycles Active Focus forward and `shift+ctrl+f` (or `/monofold:focus-prev`) cycles backward through `focusPresets` YAML order.

Example `focusSkills` and `defaultRouteOverride` for a control + project/dev pair:

```yaml
focusPresets:
  - id: control
    label: Control docs
    defaultRouteOverride: design
    focusSkills: [commit]
    decisionNoteDestination:
      targetTags: [control, markdown]
      path: Decisions/ACTIVE.md
    targets:
      - targetTags: [control, markdown]
  - id: pi-monofold
    label: Pi Monofold
    defaultRouteOverride: progress
    focusSkills: [commit, pr-review]
    decisionNoteDestination:
      targetTags: [project, pi-monofold]
      path: Progress/DECISIONS.md
    targets:
      - targetTags: [project, pi-monofold]
      - targetTags: [development, pi-monofold]
```

## Git

```text
/monofold:git commit and push the pi-monofold dev workspace
/monofold:git show git status for product docs
```

## Init and guide

```text
/monofold:init
/monofold:guide
```

## Update (config migration)

```text
/monofold:update
/monofold:update add 4_Project/NewApp as a Project Workspace under Obsidian Vault with tags project,newapp and progress route Progress
```

## Local development

```powershell
git clone https://github.com/eiei114/pi-monofold.git
cd pi-monofold
npm install
npm run check
pi -e .
```
