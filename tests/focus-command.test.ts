import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, beforeEach } from "node:test";
import piMultiWorkspace from "../index.js";
import { getActiveFocusPresetId, resetActiveFocusSessionState } from "../focus-preset.js";

describe("monofold focus command and shortcut", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  async function makeWorkspaceRoot() {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-"));
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

  function loadExtension() {
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> | void }>();
    const shortcuts = new Map<string, { description?: string; handler: (ctx: any) => Promise<void> | void }>();
    const messages: unknown[] = [];
    piMultiWorkspace({
      on() {},
      registerTool() {},
      registerCommand(name: string, options: { handler: (args: string, ctx: any) => Promise<void> | void }) {
        commands.set(name, options);
      },
      registerShortcut(key: string, options: { description?: string; handler: (ctx: any) => Promise<void> | void }) {
        shortcuts.set(key, options);
      },
      sendMessage(message: unknown) {
        messages.push(message);
      },
      sendUserMessage() {},
    } as any);
    return { commands, shortcuts, messages };
  }

  it("selects a focus preset by label through /monofold:focus", async () => {
    const root = await makeWorkspaceRoot();
    const { commands } = loadExtension();
    const notifications: string[] = [];
    const statuses = new Map<string, string | undefined>();
    const command = commands.get("monofold:focus");
    assert.ok(command);

    await command.handler("", {
      cwd: root,
      hasUI: true,
      ui: {
        select: async (_title: string, labels: string[]) => {
          assert.deepEqual(labels, ["Control", "Docs"]);
          return "Docs";
        },
        notify: (message: string) => notifications.push(message),
        setStatus: (id: string, value: string | undefined) => statuses.set(id, value),
      },
    });

    assert.equal(getActiveFocusPresetId(), "docs");
    assert.equal(statuses.get("monofold-focus"), "focus: Docs (2/2) ctrl+shift+m");
    assert.ok(notifications.some((message) => message.includes("Active Focus set to Docs")));
  });

  it("registers only the forward focus shortcut", () => {
    const { shortcuts } = loadExtension();
    assert.ok(shortcuts.has("ctrl+shift+m"));
    assert.match(shortcuts.get("ctrl+shift+m")?.description ?? "", /app\.monofold\.focus\.cycleForward/);
    assert.equal(shortcuts.has("shift+ctrl+f"), false);
  });
});
