# Release

Pi Monofold uses automated GitHub Actions for tagging and npm publish.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push or PR to `main` | Run `npm run check` (typecheck, tests, pack dry-run); on pull requests also run `npm run version:check` |
| `auto-release.yml` | Push to `main` | Create `v<version>` tag and GitHub release when the tag is new |
| `publish.yml` | Version tag, GitHub release, or manual dispatch | Publish to npm with Trusted Publishing (OIDC) |

## Pull request validation

On pull requests, CI runs two validation steps after `npm ci`:

1. `npm run check` — typecheck, tests, and `npm pack --dry-run`.
2. `npm run version:check` — optional version-bump policy guard (`scripts/check-version-bump.mjs`). If you bump `package.json`, update `CHANGELOG.md` in the same PR; major bumps need explicit approval (see script header).

Reproduce locally before opening a PR:

```powershell
npm install
npm run check
$env:BASE_REF = "origin/main"; npm run version:check
```

## Release steps

1. Update `CHANGELOG.md` with the new version and date.
2. Bump `version` in `package.json`.
3. Open a PR and ensure CI passes (including `version:check` when you bump the version).
4. Merge to `main`.
5. **Auto Release** reads `package.json`, creates `v<version>` if missing, and pushes the tag.
6. **Publish** runs on the new tag and publishes to npm with provenance.

## Manual publish

Use the **Publish to npm** workflow dispatch in GitHub Actions when you need to publish a specific ref without waiting for a tag event. Prefer the normal tag-driven flow for routine releases.

## Version policy

Follow [Semantic Versioning](https://semver.org/). Document user-visible changes in `CHANGELOG.md` before merging a version bump.
