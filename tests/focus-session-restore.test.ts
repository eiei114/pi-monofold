import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import piMultiWorkspace from "../index.js";
import {
  applyActiveFocusSession,
  getActiveFocusInitSource,
  getActiveFocusPresetId,
  resetActiveFocusSessionState,
} from "../focus-preset.js";
import { resolveFocusSessionStatePath, saveFocusSessionState } from "../focus-session-state.js";

type SessionStartHandler = (event: unknown, ctx: any) => Promise<void>;

function loadSessionStart() {
  const handlers = new Map<string, Function[]>();
  piMultiWorkspace({
    on(name: string, handler: Function) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool() {},
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  const handler = handlers.get("session_start")?.[0] as SessionStartHandler | undefined;
  assert.ok(handler);
  return handler;
}

async function makeWorkspaceRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-restore-"));
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await mkdir(path.join(root, "control"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(
    path.join(root, ".pi", "monofold.yaml"),
    `version: 1
focusPresets:
  - id: control
    label: Control
    targets:
      - targetTags: [control]
  - id: docs
    label: Docs
    targets:
      - targetTags: [docs]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read]
  - name: Docs
    path: ./docs
    tags: [docs]
    capabilities: [read]
`,
    "utf8",
  );
  return root;
}

describe("cross-session focus restore", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  it("restores a valid saved focus preset on session start", async () => {
    const root = await makeWorkspaceRoot();
    await saveFocusSessionState(root, "docs");

    const notifications: string[] = [];
    const statuses = new Map<string, string | undefined>();
    await loadSessionStart()({}, {
      cwd: root,
      hasUI: true,
      ui: {
        notify: (message: string) => notifications.push(message),
        setStatus: (id: string, value: string | undefined) => statuses.set(id, value),
      },
    });

    assert.equal(getActiveFocusPresetId(), "docs");
    assert.equal(getActiveFocusInitSource(), "restored");
    assert.equal(statuses.get("monofold-focus"), "focus: Docs (2/2) [restored] ctrl+shift+m / shift+ctrl+f");
    assert.ok(notifications.some((message) => message.includes("Restored Active Focus: Docs")));
  });

  it("falls back to default when the saved preset was deleted", async () => {
    const root = await makeWorkspaceRoot();
    await saveFocusSessionState(root, "removed");

    applyActiveFocusSession(
      [
        { id: "control", label: "Control", targets: [{ targetTags: ["control"] }] },
        { id: "docs", label: "Docs", targets: [{ targetTags: ["docs"] }] },
      ],
      { kind: "loaded", activeFocusPresetId: "removed" },
    );

    assert.equal(getActiveFocusPresetId(), "control");
    assert.equal(getActiveFocusInitSource(), "stale");
  });

  it("falls back safely for malformed saved state", async () => {
    applyActiveFocusSession(
      [
        { id: "control", label: "Control", targets: [{ targetTags: ["control"] }] },
        { id: "docs", label: "Docs", targets: [{ targetTags: ["docs"] }] },
      ],
      { kind: "malformed", error: "bad json" },
    );

    assert.equal(getActiveFocusPresetId(), "control");
    assert.equal(getActiveFocusInitSource(), "malformed");
  });

  it("restores a cleared active focus selection", async () => {
    const root = await makeWorkspaceRoot();
    await saveFocusSessionState(root, null);

    await loadSessionStart()({}, {
      cwd: root,
      hasUI: true,
      ui: {
        notify: () => {},
        setStatus: () => {},
      },
    });

    assert.equal(getActiveFocusPresetId(), null);
    assert.equal(getActiveFocusInitSource(), "cleared");
  });

  it("warns when session state file is malformed", async () => {
    const root = await makeWorkspaceRoot();
    await writeFile(resolveFocusSessionStatePath(root), "{ not-json", "utf8");

    const notifications: string[] = [];
    await loadSessionStart()({}, {
      cwd: root,
      hasUI: true,
      ui: {
        notify: (message: string) => notifications.push(message),
        setStatus: () => {},
      },
    });

    assert.equal(getActiveFocusPresetId(), "control");
    assert.equal(getActiveFocusInitSource(), "malformed");
    assert.ok(notifications.some((message) => message.includes("malformed focus session state")));
  });
});
