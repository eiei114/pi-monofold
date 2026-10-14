# Release

Pi Monofold uses GitHub Actions for releases and npm publish, but maintenance PR merges do not trigger either protected action.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push or PR to `main` | Run `npm run check` (typecheck, tests, actual pinned Pi SDK RPC smoke, pack dry-run); on pull requests also run `npm run version:check` |
| `auto-release.yml` | Manual dispatch from `main` | Validate the stable package version, create its `v<version>` tag and GitHub release |
| `publish.yml` | Version tag, GitHub release, or manual dispatch | Publish to npm with Trusted Publishing (OIDC) |

## Pull request validation

On pull requests, CI runs two validation steps after `npm ci`:

1. `npm run check` — typecheck, tests, actual pinned Pi SDK RPC smoke, and `npm pack --dry-run`.
2. `npm run version:check` — optional version-bump policy guard (`scripts/check-version-bump.mjs`). If you bump `package.json`, update `CHANGELOG.md` in the same PR; major bumps need explicit approval (see script header).

Reproduce locally before opening a PR. The smoke uses isolated Pi processes and offline extension RPC commands; it does not read global Pi settings or make model requests.

```powershell
npm install
npm run check
$env:BASE_REF = "origin/main"; npm run version:check
```

## Release steps

1. Update `CHANGELOG.md` with the new version and date.
2. Bump `version` in `package.json`.
3. Open a PR and ensure CI passes (including `version:check` when you bump the version).
4. Merge to `main`. This runs CI only; it does not tag, release, or publish.
5. After separate release authorization, manually dispatch **Release (manual)** on `main`.
6. The workflow validates the stable SemVer, creates and pushes `v<version>`, then creates the GitHub release.
7. **Publish** runs on the authorized version tag/release and publishes to npm with provenance.

## Manual publish

Use the **Publish to npm** workflow dispatch in GitHub Actions when you need to publish a specific ref without waiting for a tag event. Prefer the normal tag-driven flow for routine releases.

## Version policy

Follow [Semantic Versioning](https://semver.org/). Document user-visible changes in `CHANGELOG.md` before merging a version bump.
