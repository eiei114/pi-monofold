import { formatSkillsForPrompt, type Skill } from "@earendil-works/pi-coding-agent";

/** Max skills a single focus preset may auto-load (matches focus context file cap). */
export const FOCUS_SKILLS_MAX_COUNT = 6;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILLS_SECTION_PATTERN = /\n\nThe following skills provide[\s\S]*?<\/available_skills>/;

/** Validates a focusSkills entry per Agent Skills name rules. */
export function assertValidFocusSkillName(label: string, name: string): void {
  if (name.trim() === "") {
    throw new Error(`${label} must not contain empty skill names`);
  }
  if (name.length > 64) {
    throw new Error(`${label} skill name exceeds 64 characters: ${name}`);
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(`${label} skill name must use lowercase letters, digits, and hyphens only: ${name}`);
  }
}

/** Parses and validates an optional focusSkills list from preset config. */
export function parseFocusSkills(itemLabel: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${itemLabel}.focusSkills must be an array of strings`);
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index]!;
    const nameLabel = `${itemLabel}.focusSkills[${index}]`;
    assertValidFocusSkillName(nameLabel, raw);
    if (seen.has(raw)) {
      throw new Error(`${itemLabel}.focusSkills has duplicate skill name: ${raw}`);
    }
    seen.add(raw);
    names.push(raw);
  }
  if (names.length > FOCUS_SKILLS_MAX_COUNT) {
    throw new Error(`${itemLabel}.focusSkills must contain at most ${FOCUS_SKILLS_MAX_COUNT} skill names`);
  }
  return names;
}

/** Removes Pi's default available-skills block from a system prompt, if present. */
export function stripSkillsSectionFromSystemPrompt(systemPrompt: string): string {
  return systemPrompt.replace(SKILLS_SECTION_PATTERN, "");
}

/** Resolves declared focus skill names against Pi's discovered skill inventory. */
export function resolveFocusSkills(allSkills: Skill[] | undefined, focusSkillNames: string[] | undefined): Skill[] {
  if (!focusSkillNames) return [];
  const byName = new Map((allSkills ?? []).map((skill) => [skill.name, skill]));
  return focusSkillNames.flatMap((name) => {
    const skill = byName.get(name);
    return skill ? [skill] : [];
  });
}

/** Returns focusSkills names that are not present in the discovered inventory. */
export function findMissingFocusSkills(focusSkillNames: string[] | undefined, allSkills: Skill[] | undefined): string[] {
  if (!focusSkillNames?.length) return [];
  const available = new Set((allSkills ?? []).map((skill) => skill.name));
  return focusSkillNames.filter((name) => !available.has(name));
}

/** Replaces the default skills section with only focus-declared skills when configured. */
export function applyFocusSkillsToSystemPrompt(
  systemPrompt: string,
  allSkills: Skill[] | undefined,
  focusSkillNames: string[] | undefined,
): string {
  if (focusSkillNames === undefined) return systemPrompt;
  const stripped = stripSkillsSectionFromSystemPrompt(systemPrompt);
  const resolved = resolveFocusSkills(allSkills, focusSkillNames);
  if (resolved.length === 0) return stripped;
  return stripped + formatSkillsForPrompt(resolved);
}

let warnedFocusSkillsKey: string | null = null;

/** Clears per-activation focus skill warning deduplication (for tests and focus changes). */
export function resetFocusSkillsWarningState(): void {
  warnedFocusSkillsKey = null;
}

/** Emits one actionable warning per focus activation for missing focusSkills names. */
export function warnMissingFocusSkills(
  presetId: string,
  focusSkillNames: string[] | undefined,
  allSkills: Skill[] | undefined,
  warn: (message: string) => void,
): void {
  if (!focusSkillNames?.length) return;
  const missing = findMissingFocusSkills(focusSkillNames, allSkills);
  if (missing.length === 0) return;
  const key = `${presetId}:${missing.join(",")}`;
  if (warnedFocusSkillsKey === key) return;
  warnedFocusSkillsKey = key;
  for (const name of missing) {
    warn(
      `Focus preset "${presetId}" focusSkills: skill "${name}" was not found in Pi's discovered inventory. Check the skill name or install the package, then reload Pi.`,
    );
  }
}
