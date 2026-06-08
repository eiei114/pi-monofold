import { assertKnownKeys, asStringArray, isRecord, uniqueStrings } from "./validation.js";

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

/** Parses and validates focus preset configuration from YAML/JSON input. */
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
    if (!Array.isArray(item.targets) || item.targets.length === 0) {
      throw new Error(`${itemLabel}.targets must be a non-empty array`);
    }
    const targets: FocusPresetTarget[] = [];
    for (let targetIndex = 0; targetIndex < item.targets.length; targetIndex += 1) {
      const target = item.targets[targetIndex];
      const targetLabel = `${itemLabel}.targets[${targetIndex}]`;
      if (!isRecord(target)) throw new Error(`${targetLabel} must be an object`);
      assertKnownKeys(targetLabel, target, FOCUS_PRESET_TARGET_KEYS);
      const targetTags = uniqueStrings(asStringArray(`${targetLabel}.targetTags`, target.targetTags));
      if (targetTags.length === 0) {
        throw new Error(`${targetLabel}.targetTags must contain at least one non-empty string`);
      }
      targets.push({ targetTags });
    }
    if (seenIds.has(item.id)) throw new Error(`${label} has duplicate preset id: ${item.id}`);
    seenIds.add(item.id);
    presets.push({ id: item.id, label: item.label, targets });
  }
  return presets;
}

/** Returns the first preset id, or null when no focus preset is available. */
export function pickDefaultFocusPresetId(focusPresets: FocusPreset[] | undefined): string | null {
  if (!focusPresets || focusPresets.length === 0) return null;
  return focusPresets[0]?.id ?? null;
}

/** Finds a focus preset by stable id. */
export function findFocusPresetById(focusPresets: FocusPreset[] | undefined, id: string): FocusPreset | undefined {
  return focusPresets?.find((preset) => preset.id === id);
}

/** Returns true when every requested focus tag is present on a workspace. */
export function matchesFocusTarget(workspace: FocusMatchableWorkspace, targetTags: string[]): boolean {
  if (targetTags.length === 0) return false;
  return targetTags.every((tag) => workspace.tags.includes(tag));
}

/** Counts workspaces matched by a focus target's tag set. */
export function countMatchingWorkspaces(
  workspaces: FocusMatchableWorkspace[],
  targetTags: string[],
): number {
  return workspaces.filter((workspace) => matchesFocusTarget(workspace, targetTags)).length;
}

/** Emits warnings for a preset's targets that do not match any configured workspace. */
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

/** Initializes the active focus preset once per process/session. */
export function ensureActiveFocusInitialized(focusPresets: FocusPreset[] | undefined): void {
  if (activeFocusInitialized) return;
  activeFocusInitialized = true;
  activeFocusPresetId = pickDefaultFocusPresetId(focusPresets);
}

/** Returns the current active focus preset id, if any. */
export function getActiveFocusPresetId(): string | null {
  return activeFocusPresetId;
}

/** Sets the active focus preset after validating that the id exists. */
export function setActiveFocusPresetId(id: string, focusPresets: FocusPreset[] | undefined): void {
  if (!findFocusPresetById(focusPresets, id)) {
    throw new Error(`Unknown focus preset id: ${id}`);
  }
  activeFocusPresetId = id;
  activeFocusInitialized = true;
}

export type ActiveFocusPresetPosition = {
  preset: FocusPreset;
  index: number;
  total: number;
};

export type FocusCycleResult = ActiveFocusPresetPosition & {
  changed: boolean;
};

/** Returns the current active focus preset and YAML-order position, if any. */
export function getActiveFocusPresetPosition(
  focusPresets: FocusPreset[] | undefined,
): ActiveFocusPresetPosition | null {
  if (!focusPresets || focusPresets.length === 0) return null;
  const activeId = getActiveFocusPresetId();
  if (!activeId) return null;
  const index = focusPresets.findIndex((preset) => preset.id === activeId);
  if (index < 0) return null;
  return { preset: focusPresets[index]!, index, total: focusPresets.length };
}

/** Selects a focus preset by the user-facing label returned from ctx.ui.select. */
export function setActiveFocusPresetByLabel(
  label: string,
  focusPresets: FocusPreset[] | undefined,
): ActiveFocusPresetPosition {
  const presets = focusPresets ?? [];
  const index = presets.findIndex((preset) => preset.label === label);
  if (index < 0) throw new Error(`Unknown focus preset label: ${label}`);
  const preset = presets[index]!;
  setActiveFocusPresetId(preset.id, presets);
  return { preset, index, total: presets.length };
}

/** Cycles the active focus preset forward in YAML order. */
export function cycleActiveFocusPresetForward(focusPresets: FocusPreset[] | undefined): FocusCycleResult | null {
  const presets = focusPresets ?? [];
  if (presets.length === 0) {
    clearActiveFocusPresetId();
    return null;
  }

  ensureActiveFocusInitialized(presets);
  const currentId = getActiveFocusPresetId();
  const currentIndex = currentId ? presets.findIndex((preset) => preset.id === currentId) : -1;
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % presets.length;
  const preset = presets[nextIndex]!;
  const changed = presets.length > 1 && preset.id !== currentId;
  setActiveFocusPresetId(preset.id, presets);
  return { preset, index: nextIndex, total: presets.length, changed };
}

/** Clears the active focus preset for the current process/session. */
export function clearActiveFocusPresetId(): void {
  activeFocusPresetId = null;
  activeFocusInitialized = true;
}

/** Resets in-memory session state (for tests and process restart). */
export function resetActiveFocusSessionState(): void {
  activeFocusPresetId = null;
  activeFocusInitialized = false;
}
