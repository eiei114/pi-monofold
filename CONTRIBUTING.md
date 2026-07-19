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

Releases publish **`pi-monofold`** to npm through Trusted Publishing. Do not add `NPM_TOKEN` to GitHub Secrets.

```bash
npm version patch
git push
```

See `docs/release.md` for release notes and Trusted Publisher settings.
