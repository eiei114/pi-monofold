import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import piMultiWorkspace from "../index.js";
import { resetActiveFocusSessionState, setActiveFocusPresetId } from "../focus-preset.js";

describe("focus decisionNoteDestination", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  async function makeWorkspaceRoot(options: { includeNote?: boolean } = {}) {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-decision-note-"));
    await mkdir(path.join(root, ".pi"), { recursive: true });
    await mkdir(path.join(root, "control", "Decisions"), { recursive: true });
    if (options.includeNote !== false) {
      await writeFile(path.join(root, "control", "Decisions", "ACTIVE.md"), "# Active decisions\n\n- ship it\n", "utf8");
    }
    await writeFile(
      path.join(root, ".pi", "monofold.yaml"),
      `version: 1
focusPresets:
  - id: control
    label: Control
    decisionNoteDestination:
      targetTags: [control]
      path: Decisions/ACTIVE.md
    targets:
      - targetTags: [control]
  - id: project
    label: Project
    targets:
      - targetTags: [project]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read, writeDocs]
    routes:
      default: Notes
      decision: Decisions
  - name: Project
    path: ./project
    tags: [project]
    capabilities: [read]
`,
      "utf8",
    );
    if (options.includeNote !== false) {
      await mkdir(path.join(root, "project"), { recursive: true });
    } else {
      await mkdir(path.join(root, "project"), { recursive: true });
    }
    return root;
  }

  function loadBeforeAgentStart() {
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
    const handler = handlers.get("before_agent_start")?.[0] as
      | ((event: { systemPrompt: string }, ctx: any) => Promise<{ systemPrompt: string } | undefined>)
      | undefined;
    assert.ok(handler);
    return handler;
  }

  it("injects configured decision note content when the file exists", async () => {
    const root = await makeWorkspaceRoot();
    setActiveFocusPresetId("control", [
      {
        id: "control",
        label: "Control",
        decisionNoteDestination: { targetTags: ["control"], path: "Decisions/ACTIVE.md" },
        targets: [{ targetTags: ["control"] }],
      },
    ]);

    const result = await loadBeforeAgentStart()(
      { systemPrompt: "base" },
      {
        cwd: root,
        hasUI: true,
        ui: { notify: () => {} },
      },
    );

    assert.ok(result);
    assert.match(result.systemPrompt, /Decision note destination: #0 Control/);
    assert.match(result.systemPrompt, /ship it/);
  });

  it("warns when the configured decision note file is missing", async () => {
    const root = await makeWorkspaceRoot({ includeNote: false });
    const warnings: string[] = [];
    setActiveFocusPresetId("control", [
      {
        id: "control",
        label: "Control",
        decisionNoteDestination: { targetTags: ["control"], path: "Decisions/ACTIVE.md" },
        targets: [{ targetTags: ["control"] }],
      },
    ]);

    await loadBeforeAgentStart()(
      { systemPrompt: "base" },
      {
        cwd: root,
        hasUI: true,
        ui: { notify: (message: string) => warnings.push(message) },
      },
    );

    assert.equal(warnings.some((message) => /unavailable/.test(message)), true);
  });

  it("does nothing when decisionNoteDestination is omitted", async () => {
    const root = await makeWorkspaceRoot();
    setActiveFocusPresetId("project", [
      {
        id: "project",
        label: "Project",
        targets: [{ targetTags: ["project"] }],
      },
    ]);

    const result = await loadBeforeAgentStart()(
      { systemPrompt: "base" },
      {
        cwd: root,
        hasUI: true,
        ui: { notify: () => {} },
      },
    );

    assert.ok(result);
    assert.doesNotMatch(result.systemPrompt, /Decision note destination:/);
  });
});
