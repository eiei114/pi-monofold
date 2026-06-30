# focusSkills dogfood review (DOT-377)

Review date: 2026-06-30. Feature landed in v0.7.0 (DOT-376). This note records a bounded dogfood pass across the documented control + project/dev preset pair.

## Presets reviewed

| Preset | focusSkills | defaultRouteOverride | Intent |
|--------|-------------|----------------------|--------|
| `control` | `[commit]` | `design` | Vault/control docs with commit helper only |
| `pi-monofold` | `[commit, pr-review]` | `progress` | OSS dev workspace with git + review helpers |

Configs mirror `docs/usage.md` and `docs/examples.md`.

## Findings

### Reduced manual reload friction

- **Yes, when names are stable.** Declaring `focusSkills` on Active Focus removes the need to `/skill:commit` or rely on the full `<available_skills>` catalog on every turn for presets that always need the same helpers.
- **Preset cycling works.** Forward/backward focus shortcuts (`ctrl+shift+m` / `shift+ctrl+f`) change which skill bundle is injected on the next agent turn without restarting Pi.

### Prompt noise vs. helpfulness

- **Helpful:** Filtering a large installed catalog down to 1–2 skills on the control preset noticeably shrinks the system prompt and keeps the model focused on vault-appropriate tools.
- **Helpful:** The project/dev preset's two-skill bundle matches typical commit + PR review flows without exposing unrelated skills.
- **Noisy / confusing:** When a declared name is missing, warnings appear in both the TUI and `monofold_list`, but the manifest did not previously list which skills were declared — hard to tell filtering from a broken install during dogfood.
- **Risk:** If every declared name is missing, the default skills block is stripped and nothing is injected. That is intentional noise reduction but can feel like "skills disappeared" until names are fixed.

### Redundancy with existing discovery

- **Not redundant with Shiori:** Shiori remains better for ad-hoc, task-triggered skill picks across the full catalog.
- **Not redundant with `/skill:name`:** Manual invocation still wins for one-off skills outside the preset bundle.
- **Partial overlap:** When `focusSkills` is omitted, behavior matches pre-0.7.0 discovery — no reason to enable the knob unless you want a fixed bundle.

## Changes from this review

1. **`monofold_list` health block** now prints declared `focusSkills` for the active preset (same surface as route override).
2. **`docs/usage.md`** documents the all-missing-names case and a when-to-enable recommendation table.
3. **Tests** cover the all-declared-names-missing prompt behavior and manifest output.

## Follow-up (out of scope)

- Optional manifest line showing *resolved* skill count vs. declared count (only if dogfood shows repeated confusion).
- Per-preset `focusSkills` validation against a checked-in allowlist in the control repo (larger product decision).
