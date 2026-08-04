## Unreleased

## [0.12.3] - 2026-08-04

### Changed

- Bump package version for the Discord release webhook verification.

## [0.12.2] - 2026-07-20

### Changed

- Sync README package contents tree with repository layout (DOT-1274).
- Pin GitHub Actions `checkout` and `setup-node` to commit SHAs across CI and release workflows.

### Added

- Regression tests for README package contents tree and GitHub Actions workflow pins.

## [0.12.1] - 2026-07-13

### Added

- Post-dogfood Focus context injection cap review (DOT-99): documented provisional caps in `docs/design-focus-preset.md` and recorded representative-session evidence in `docs/focus-context-injection-dogfood.md`.

### Changed

- Confirmed provisional injection caps unchanged (6 files / 6,000 chars per file / 12,000 total per turn); constants remain exported from `index.ts` for future tuning.

## [0.12.0] - 2026-07-05

### Added

- Optional workspace `pathOverlays` for multi-runtime configs, so one logical workspace can resolve to different absolute roots on different machines.
- Active runtime detection via `PI_MONOFOLD_RUNTIME` / `MONOFOLD_RUNTIME` override or auto-detected local runtime id.
- `monofold_list` now shows the active runtime and whether each resolved workspace path came from an overlay or the base path.

### Changed

- Manifest validation now checks only the active runtime's resolved workspace path, so inactive-machine overlay paths no longer break the current runtime.

### Added

- Cross-session Active Focus restore via `.pi/monofold-focus-session.json`, with safe fallback when saved state is missing, malformed, or stale.
- Footer status and manifest output show whether Active Focus was restored, fell back to default, or used a stale saved preset.
- `monofold_list` now includes a compact **Active Focus Health** block (preset, route override, unresolved targets, and validation warnings) as the first-line Focus status surface.

### Changed

- `monofold_list` Active Focus health now lists declared `focusSkills` for the active preset.
- Documented dogfood recommendations for when to enable `focusSkills`, including the all-declared-names-missing case (`docs/usage.md`, `docs/focus-skills-dogfood.md`).

## [0.11.1] - 2026-07-04

### Added

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

## [0.10.0] - 2026-07-02

### Added

- Optional `decisionNoteDestination` on Focus presets exposes one reusable decision/note file when that preset is Active Focus.
- Missing decision-note workspaces or files emit actionable runtime warnings instead of failing silently.
- Active Focus manifest, status, and context injection surface the configured decision-note destination.
- Documented when to use `decisionNoteDestination` versus ordinary `monofold_write` decision routes.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-06-30

### Added

- Added `shift+ctrl+f` backward focus-cycle shortcut and `/monofold:focus-prev` command to move Active Focus to the previous preset in YAML order.
- Footer focus status now shows both forward and backward shortcuts.

## [0.8.0] - 2026-06-29

### Added

- Optional `defaultRouteOverride` on Focus presets biases write-route defaults while that preset is Active Focus.
- Unknown `defaultRouteOverride` values fail validation with actionable errors.
- Active Focus status and manifest output show the resolved route override when present.
- Explicit `routeType` / `--route` still override Focus-derived defaults.
- Documented configuration examples and precedence rules for `defaultRouteOverride`.

## [0.7.0] - 2026-06-28

### Added

- Optional `focusSkills` on Focus presets auto-loads a bounded set of declared Pi skills when that preset is active.
- Missing or unknown `focusSkills` names emit actionable runtime warnings instead of failing silently.
- Documented when to use `focusSkills` versus Pi Skill Shiori or ordinary triggerable skill discovery.

## [0.6.2] - 2026-06-21

### Added

- Bias tag-based Unique Target Inference toward Active Focus workspaces in `monofold_read`, `monofold_write`, and `monofold_git` when a tag query matches multiple candidates.

## [0.6.1] - 2026-06-19

### Changed

- Document Focus Preset as the Monofold-owned workspace-context switch pattern in the shared Pi extension OSS rules (vault reference; no package behavior change).

## [0.6.0] - 2026-06-16

### Added

- Inject Active Focus context files into agent turns with provisional file-count, per-file, and total-character caps.
- Recompose focused manifests so active Workspace Targets appear first and non-active targets are collapsed.

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

