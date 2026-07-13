# Focus context injection cap dogfood review (DOT-99)

Review date: 2026-07-13. Feature landed in v0.6.0 (context injection) and matured through v0.10.0–v0.12.0 (decision notes, session restore, path overlays). This note records a post-dogfood pass across the documented control + project/dev preset pair and representative Multica agent sessions.

## Caps reviewed (provisional defaults)

| Constant | Value | Export |
|----------|-------|--------|
| Max context files per active preset | **6** | `FOCUS_CONTEXT_MAX_FILES` |
| Max characters per injected file | **6,000** | `FOCUS_CONTEXT_MAX_CHARS_PER_FILE` |
| Max injected file-content characters per turn | **12,000** | `FOCUS_CONTEXT_MAX_TOTAL_CHARS` |

Decision-note content shares the same caps (`docs/focus-decision-note-dogfood.md`).

## Representative usage reviewed

| Preset | Typical `contextFiles` | Decision note | Observed injection size |
|--------|------------------------|---------------|---------------------------|
| `control` | `AGENTS.md`, vault guidance (1–2 files) | `Decisions/ACTIVE.md` | Well under per-file and total caps |
| `pi-monofold` | `README.md`, `AGENTS.md` (1–2 files) | `Progress/DECISIONS.md` | Well under per-file and total caps |

Configs mirror `docs/usage.md` and `docs/examples.md`. Review window spans Focus Preset MVP shipping (2026-06-16) through daily dogfood through 2026-07-13, including prior notes in `focus-skills-dogfood.md` and `focus-decision-note-dogfood.md`.

## Evidence collected

### Truncation and file-skip notifications

- **Rare in normal dogfood.** Typical `contextFiles` are short guidance markdown (hundreds to low thousands of characters). Truncation markers (`… [truncated]`) and total-cap skip notices appear only when stress-testing large files or stacking multiple max-sized files — behavior matches `tests/focus-context-injection.test.ts` and `tests/focus-decision-note-integration.test.ts`.
- **Notifications are bounded.** When the total cap is hit, one TUI notification fires per turn (`index.ts`); not repeated spam across subsequent turns unless caps remain exceeded.
- **Decision notes at cap behave predictably.** Large rolling logs truncate at 6,000 characters with a visible marker; combined decision-note + context-file total-cap skips are actionable (see DOT-740 replenishment).

### Agents re-reading `contextFiles`

- **No friction observed.** Active Focus auto-injects declared `contextFiles` on every `before_agent_start`, so agents do not need manual `monofold_read` for standing guidance. This is working as designed, not a cap problem.
- **No evidence that raising caps would reduce redundant reads** — the injection path already surfaces files each turn.

### Turn weight (manifest + injection)

- **Acceptable for documented presets.** Collapsed non-active manifest lines plus 1–3 injected files keep prompt overhead modest relative to the full workspace catalog.
- **Heavy turns only when configs declare many/large files.** The 6-file and 12,000-character totals act as intended guardrails; no dogfood session required relaxing them for routine OSS maintenance or vault control work.

## Decision

**Confirmed — no change.** Provisional caps (6 / 6,000 / 12,000) remain adequate after representative dogfood. Constants stay exported from `index.ts` for future tuning without logic changes.

## Changes from this review

1. **`docs/design-focus-preset.md`** — added explicit cap table and tuning note.
2. **`docs/focus-context-injection-dogfood.md`** — this dogfood record (DOT-99 acceptance).

## Follow-up (out of scope)

- Revisit caps if a preset routinely declares more than four large `contextFiles` or if maintainer dogfood shows repeated total-cap notifications in production sessions.
- Cache `access` between manifest and injection builds (low priority; noted in decision-note dogfood).
- Vault ADR 0006 change note: **no numeric change** — maintainer may add a one-line "confirmed" note in the vault copy when syncing.
