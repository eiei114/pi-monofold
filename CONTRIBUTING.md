# Contributing

Thanks for helping improve this Pi package.

## Development

```bash
npm install
npm run check
```

## Local Pi testing

```bash
pi -e .
```

## Pull requests

Before opening a PR:

- Run `npm run check`
- Update docs when behavior changes
- Update `CHANGELOG.md` for user-facing changes
- Keep package contents small and intentional
- Run `npm pack --dry-run` when you add, remove, or rename `docs/` files so `package.json` `files` matches what you ship

## Release

Releases publish **`pi-monofold`** to npm through Trusted Publishing after merge to `main`. Do not add `NPM_TOKEN` to GitHub Secrets.

1. Update `CHANGELOG.md` with the new version and date.
2. Bump `version` in `package.json`.
3. Open a PR and ensure CI passes (including `npm run version:check` when you bump the version).
4. Merge to `main`. **Auto Release** tags `v<version>` and **Publish** publishes to npm with OIDC provenance.

See [docs/release.md](./docs/release.md) for the full release flow and Trusted Publisher settings.
