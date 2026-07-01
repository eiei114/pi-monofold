import { assertKnownKeys, asStringArray, isRecord, uniqueStrings } from "./validation.js";

type TagMatchableWorkspace = {
  tags: string[];
};

export type FocusDecisionNoteDestination = {
  targetTags: string[];
  path: string;
};

export type FocusDecisionNoteValidationWorkspace = TagMatchableWorkspace & {
  targetId: string;
  name?: string;
  capabilities: readonly string[];
};

const DECISION_NOTE_DESTINATION_KEYS = new Set(["targetTags", "path"]);

/** Parses and validates an optional decisionNoteDestination from preset config. */
export function parseDecisionNoteDestination(itemLabel: string, value: unknown): FocusDecisionNoteDestination | undefined {
  if (value === undefined) return undefined;
  const destLabel = `${itemLabel}.decisionNoteDestination`;
  if (!isRecord(value)) throw new Error(`${destLabel} must be an object`);
  assertKnownKeys(destLabel, value, DECISION_NOTE_DESTINATION_KEYS);
  const targetTags = uniqueStrings(asStringArray(`${destLabel}.targetTags`, value.targetTags));
  if (targetTags.length === 0) {
    throw new Error(`${destLabel}.targetTags must contain at least one non-empty string`);
  }
  if (typeof value.path !== "string" || value.path.trim() === "") {
    throw new Error(`${destLabel}.path must be a non-empty string`);
  }
  assertWorkspaceInternalRelative(`${destLabel}.path`, value.path.trim());
  return { targetTags, path: value.path.trim() };
}

function assertWorkspaceInternalRelative(label: string, value: string): void {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`${label} must be a workspace-internal relative path: ${value}`);
  }
}

/** Formats a decision-note destination for manifest and status output. */
export function formatDecisionNoteDestinationLabel(
  workspaceLabel: string,
  destination: FocusDecisionNoteDestination,
): string {
  return `${workspaceLabel}:${destination.path}`;
}

function matchesTargetTags(workspace: TagMatchableWorkspace, targetTags: string[]): boolean {
  if (targetTags.length === 0) return false;
  return targetTags.every((tag) => workspace.tags.includes(tag));
}

/** Validates a preset decision-note destination against configured workspaces. */
export function validateDecisionNoteDestinationAgainstWorkspaces(
  presetLabel: string,
  destination: FocusDecisionNoteDestination,
  workspaces: FocusDecisionNoteValidationWorkspace[],
): void {
  const destLabel = `${presetLabel}.decisionNoteDestination`;
  const matches = workspaces.filter((workspace) => matchesTargetTags(workspace, destination.targetTags));
  if (matches.length === 0) {
    throw new Error(
      `${destLabel}.targetTags [${destination.targetTags.join(", ")}] matches no workspace target`,
    );
  }
  if (matches.length > 1) {
    const labels = matches
      .map((workspace) => (workspace.name ? `${workspace.targetId} (${workspace.name})` : workspace.targetId))
      .join(", ");
    throw new Error(
      `${destLabel}.targetTags [${destination.targetTags.join(", ")}] is ambiguous across workspaces: ${labels}`,
    );
  }
  const workspace = matches[0]!;
  if (!workspace.capabilities.includes("read")) {
    throw new Error(
      `${destLabel} requires read on ${workspace.targetId}, but matched capabilities [${workspace.capabilities.join(", ")}]`,
    );
  }
}

/** Finds the single workspace that matches a decision-note destination, if any. */
export function findDecisionNoteWorkspace<T extends FocusDecisionNoteValidationWorkspace>(
  workspaces: T[],
  destination: FocusDecisionNoteDestination,
): T | undefined {
  const matches = workspaces.filter((workspace) => matchesTargetTags(workspace, destination.targetTags));
  return matches.length === 1 ? matches[0] : undefined;
}

let warnedDecisionNoteKey: string | null = null;

/** Clears per-activation decision-note warning deduplication (for tests and focus changes). */
export function resetDecisionNoteWarningState(): void {
  warnedDecisionNoteKey = null;
}

/** Emits one actionable warning per focus activation for unavailable decision-note destinations. */
export function warnUnavailableDecisionNoteDestination(
  presetId: string,
  destination: FocusDecisionNoteDestination,
  workspaceLabel: string,
  reason: "missing-workspace" | "missing-file",
  warn: (message: string) => void,
): void {
  const key = `${presetId}:${reason}:${destination.targetTags.join(",")}:${destination.path}`;
  if (warnedDecisionNoteKey === key) return;
  warnedDecisionNoteKey = key;
  if (reason === "missing-workspace") {
    warn(
      `Focus preset "${presetId}" decisionNoteDestination [${destination.targetTags.join(", ")}] → ${destination.path} matches no configured workspace. Fix targetTags or add the workspace, then reload Pi.`,
    );
    return;
  }
  warn(
    `Focus preset "${presetId}" decisionNoteDestination ${workspaceLabel}:${destination.path} is unavailable. Create the file or fix the path, then reload Pi.`,
  );
}
