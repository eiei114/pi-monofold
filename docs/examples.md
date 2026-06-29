# Examples

Natural-language arguments are interpreted by the Pi agent. These samples show typical requests.

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

Use `monofold_list` first to inspect Active Focus health (preset, route override, unresolved targets, and warnings).

`/monofold:focus` opens a TUI selector by preset label. `ctrl+shift+m` cycles Active Focus forward and `shift+ctrl+f` (or `/monofold:focus-prev`) cycles backward through `focusPresets` YAML order.

Example `focusSkills` and `defaultRouteOverride` for a control + project/dev pair:

```yaml
focusPresets:
  - id: control
    label: Control docs
    defaultRouteOverride: design
    focusSkills: [commit]
    targets:
      - targetTags: [control, markdown]
  - id: pi-monofold
    label: Pi Monofold
    defaultRouteOverride: progress
    focusSkills: [commit, pr-review]
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
