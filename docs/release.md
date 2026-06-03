# Release

Pi Monofold uses automated GitHub Actions for tagging and npm publish.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push or PR to `main` | Run `npm run check` (typecheck, tests, pack dry-run) |
| `auto-release.yml` | Push to `main` | Create `v<version>` tag and GitHub release when the tag is new |
| `publish.yml` | Version tag, GitHub release, or manual dispatch | Publish to npm with Trusted Publishing (OIDC) |

## Release steps

1. Update `CHANGELOG.md` with the new version and date.
2. Bump `version` in `package.json`.
3. Open a PR and ensure CI passes.
4. Merge to `main`.
5. **Auto Release** reads `package.json`, creates `v<version>` if missing, and pushes the tag.
6. **Publish** runs on the new tag and publishes to npm with provenance.

## Manual publish

Use the **Publish to npm** workflow dispatch in GitHub Actions when you need to publish a specific ref without waiting for a tag event. Prefer the normal tag-driven flow for routine releases.

## Version policy

Follow [Semantic Versioning](https://semver.org/). Document user-visible changes in `CHANGELOG.md` before merging a version bump.
