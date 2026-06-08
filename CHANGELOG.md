# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-09

### Changed

- Marked the safe-read behavior changes as a minor release boundary: `monofold_read` file reads now default to metadata plus a bounded preview instead of full file content.
- Documented capped search/tree output with truncation markers so exploratory reads stay safe for chat history.
- Noted legacy slash-command parity for the same safe file preview and capped search/tree behavior.

## [0.4.0] - 2026-06-08

### Added

- Added `/monofold:focus`, the `ctrl+shift+m` forward focus-cycle shortcut, and a footer status indicator for the active focus preset.

## [0.3.3] - 2026-06-06

### Removed

- Legacy underscored slash commands (`monofold_list`, `monofold_read`, `monofold_tree`, `monofold_search`, `monofold_add`, `monofold_project_add`, `monofold_clear_unknown_path_allows`). Use the colon-separated equivalents (`monofold:list`, `monofold:read`, etc.) instead.

## [0.3.2] - 2026-06-04

### Fixed

- Normalize MSYS/Git Bash mixed Windows paths such as `C:/c/Users/...` and `/c/Users/...` before workspace guard checks, preventing false Unknown Path confirmations for registered Development Workspaces.
- Document canonical Windows `cd` usage in `docs/usage.md`.

## [0.3.1] - 2026-06-03

### Changed

- Restructured README to match the Pi OSS minimal-docs policy: added CI, npm downloads, and Trusted Publishing badges; added Features, Quick start, Usage summary, Package contents, Development, Release, Security, Links, and License sections.
- Moved detailed configuration, commands, agent API, migration, and guard documentation to `docs/usage.md`.
- Added `docs/examples.md` and `docs/release.md`.

### Added

- CI workflow (`ci.yml`) for package validation on push and PR.
- `CHANGELOG.md` and `SECURITY.md`.

## [0.3.0] - prior release

See git history and GitHub releases for earlier changes.
