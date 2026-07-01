import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  FOCUS_SESSION_STATE_RELATIVE_PATH,
  loadFocusSessionState,
  resolveFocusSessionStatePath,
  saveFocusSessionState,
} from "../focus-session-state.js";

describe("focus session state", () => {
  it("persists the active focus preset id across reloads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-focus-session-"));

    await saveFocusSessionState(root, "docs");

    const loaded = await loadFocusSessionState(root);
    assert.deepEqual(loaded, { kind: "loaded", activeFocusPresetId: "docs" });

    const json = JSON.parse(await readFile(resolveFocusSessionStatePath(root), "utf8")) as {
      version: number;
      activeFocusPresetId: string;
    };
    assert.equal(json.version, 1);
    assert.equal(json.activeFocusPresetId, "docs");
    assert.equal(FOCUS_SESSION_STATE_RELATIVE_PATH, path.join(".pi", "monofold-focus-session.json"));
  });

  it("persists a cleared active focus selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-focus-session-"));

    await saveFocusSessionState(root, null);

    const loaded = await loadFocusSessionState(root);
    assert.deepEqual(loaded, { kind: "loaded", activeFocusPresetId: null });
  });

  it("returns missing when no session state file exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-focus-session-"));
    const loaded = await loadFocusSessionState(root);
    assert.deepEqual(loaded, { kind: "missing" });
  });

  it("returns malformed for invalid session state files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-focus-session-"));
    const filePath = resolveFocusSessionStatePath(root);
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(path.dirname(filePath), { recursive: true }).then(() =>
        writeFile(filePath, "{ not-json", "utf8"),
      ),
    );

    const loaded = await loadFocusSessionState(root);
    assert.equal(loaded.kind, "malformed");
    if (loaded.kind === "malformed") {
      assert.match(loaded.error, /JSON|Unexpected token/i);
    }
  });
});
