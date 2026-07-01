import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeGuardPath } from "./path-normalize.js";

export const FOCUS_SESSION_STATE_RELATIVE_PATH = path.join(".pi", "monofold-focus-session.json");

export type FocusSessionStateFile = {
  version: 1;
  activeFocusPresetId: string | null;
};

export type FocusSessionLoadResult =
  | { kind: "missing" }
  | { kind: "malformed"; error: string }
  | { kind: "loaded"; activeFocusPresetId: string | null };

function assertFocusSessionStateFile(value: unknown): asserts value is FocusSessionStateFile {
  if (typeof value !== "object" || value === null) throw new Error("focus session state file must be an object");
  if (!("version" in value) || (value as { version?: unknown }).version !== 1) {
    throw new Error("focus session state file requires version: 1");
  }
  const activeFocusPresetId = (value as { activeFocusPresetId?: unknown }).activeFocusPresetId;
  if (activeFocusPresetId !== null && typeof activeFocusPresetId !== "string") {
    throw new Error("focus session state file requires string|null activeFocusPresetId");
  }
  if (typeof activeFocusPresetId === "string" && activeFocusPresetId.trim() === "") {
    throw new Error("focus session state file activeFocusPresetId must be non-empty when set");
  }
}

export function resolveFocusSessionStatePath(root: string): string {
  return path.join(normalizeGuardPath(root), FOCUS_SESSION_STATE_RELATIVE_PATH);
}

export async function loadFocusSessionState(root: string): Promise<FocusSessionLoadResult> {
  const filePath = resolveFocusSessionStatePath(root);
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    assertFocusSessionStateFile(parsed);
    return { kind: "loaded", activeFocusPresetId: parsed.activeFocusPresetId };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") return { kind: "missing" };
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "malformed", error: message };
  }
}

export async function saveFocusSessionState(root: string, activeFocusPresetId: string | null): Promise<void> {
  const filePath = resolveFocusSessionStatePath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload: FocusSessionStateFile = {
    version: 1,
    activeFocusPresetId,
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
