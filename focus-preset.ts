export type FocusPresetTarget = {
  targetTags: string[];
};

export type FocusPreset = {
  id: string;
  label: string;
  targets: FocusPresetTarget[];
};

export type FocusMatchableWorkspace = {
  tags: string[];
};

const FOCUS_PRESET_KEYS = new Set(["id", "label", "targets"]);
const FOCUS_PRESET_TARGET_KEYS = new Set(["targetTags"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(label: string, value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has unknown key: ${key}`);
  }
}

function asStringArray(label: string, value: unknown, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export function parseFocusPresets(value: unknown, label = "focusPresets"): FocusPreset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const presets: FocusPreset[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemLabel = `${label}[${index}]`;
    if (!isRecord(item)) throw new Error(`${itemLabel} must be an object`);
    assertKnownKeys(itemLabel, item, FOCUS_PRESET_KEYS);
    if (typeof item.id !== "string" || item.id.trim() === "") {
      throw new Error(`${itemLabel}.id must be a non-empty string`);
    }
    if (typeof item.label !== "string" || item.label.trim() === "") {
      throw new Error(`${itemLabel}.label must be a non-empty string`);
    }
    if (!Array.isArray(item.targets)) throw new Error(`${itemLabel}.targets must be an array`);
    const targets: FocusPresetTarget[] = [];
    for (let targetIndex = 0; targetIndex < item.targets.length; targetIndex += 1) {
      const target = item.targets[targetIndex];
      const targetLabel = `${itemLabel}.targets[${targetIndex}]`;
      if (!isRecord(target)) throw new Error(`${targetLabel} must be an object`);
      assertKnownKeys(targetLabel, target, FOCUS_PRESET_TARGET_KEYS);
      const targetTags = asStringArray(`${targetLabel}.targetTags`, target.targetTags);
      targets.push({ targetTags: uniqueStrings(targetTags) });
    }
    if (seenIds.has(item.id)) throw new Error(`${label} has duplicate preset id: ${item.id}`);
    seenIds.add(item.id);
    presets.push({ id: item.id, label: item.label, targets });
  }
  return presets;
}

export function pickDefaultFocusPresetId(focusPresets: FocusPreset[] | undefined): string | null {
  if (!focusPresets || focusPresets.length === 0) return null;
  return focusPresets[0]?.id ?? null;
}

export function findFocusPresetById(focusPresets: FocusPreset[] | undefined, id: string): FocusPreset | undefined {
  return focusPresets?.find((preset) => preset.id === id);
}

export function matchesFocusTarget(workspace: FocusMatchableWorkspace, targetTags: string[]): boolean {
  if (targetTags.length === 0) return false;
  return targetTags.every((tag) => workspace.tags.includes(tag));
}

export function countMatchingWorkspaces(
  workspaces: FocusMatchableWorkspace[],
  targetTags: string[],
): number {
  return workspaces.filter((workspace) => matchesFocusTarget(workspace, targetTags)).length;
}

export function warnZeroTargetMatchesForPreset(
  preset: FocusPreset,
  workspaces: FocusMatchableWorkspace[],
  warn: (message: string) => void,
): void {
  for (const target of preset.targets) {
    if (countMatchingWorkspaces(workspaces, target.targetTags) === 0) {
      warn(
        `Focus preset "${preset.id}" target [${target.targetTags.join(", ")}] matches no configured workspace`,
      );
    }
  }
}

let activeFocusPresetId: string | null = null;
let activeFocusInitialized = false;

export function ensureActiveFocusInitialized(focusPresets: FocusPreset[] | undefined): void {
  if (activeFocusInitialized) return;
  activeFocusInitialized = true;
  activeFocusPresetId = pickDefaultFocusPresetId(focusPresets);
}

export function getActiveFocusPresetId(): string | null {
  return activeFocusPresetId;
}

export function setActiveFocusPresetId(id: string, focusPresets: FocusPreset[] | undefined): void {
  if (!findFocusPresetById(focusPresets, id)) {
    throw new Error(`Unknown focus preset id: ${id}`);
  }
  activeFocusPresetId = id;
  activeFocusInitialized = true;
}

export function clearActiveFocusPresetId(): void {
  activeFocusPresetId = null;
  activeFocusInitialized = true;
}

/** Resets in-memory session state (for tests and process restart). */
export function resetActiveFocusSessionState(): void {
  activeFocusPresetId = null;
  activeFocusInitialized = false;
}
