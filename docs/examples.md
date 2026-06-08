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
ctrl+shift+m
```

`/monofold:focus` opens a TUI selector by preset label. `ctrl+shift+m` cycles Active Focus forward through `focusPresets` YAML order.

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
