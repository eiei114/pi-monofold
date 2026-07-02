import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import piMultiWorkspace, {
  FOCUS_CONTEXT_MAX_CHARS_PER_FILE,
  FOCUS_CONTEXT_MAX_TOTAL_CHARS,
} from "../index.js";
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
    await mkdir(path.join(root, "project"), { recursive: true });
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

  it("truncates large decision note content at the per-file cap", async () => {
    const root = await makeWorkspaceRoot();
    // Overwrite the small decision note with a large one exceeding the per-file cap
    const largeContent = "# Large active decisions\n\n" + "A".repeat(FOCUS_CONTEXT_MAX_CHARS_PER_FILE) + "\nEND_MARKER";
    await writeFile(path.join(root, "control", "Decisions", "ACTIVE.md"), largeContent, "utf8");

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
    // The large content should be truncated with the marker
    assert.match(result.systemPrompt, /… \[truncated\]/);
    // The END_MARKER should not appear since content exceeds the per-file cap
    assert.doesNotMatch(result.systemPrompt, /END_MARKER/);
  });

  it("respects the total character cap when decision note plus context files exceed the limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-decision-note-cap-"));
    await mkdir(path.join(root, ".pi"), { recursive: true });
    await mkdir(path.join(root, "control", "Decisions"), { recursive: true });
    // Small decision note
    await writeFile(path.join(root, "control", "Decisions", "ACTIVE.md"), "# Active decisions\n\n- ship it\n", "utf8");
    // Two large context files — after the decision note (≈30 chars) and first file
    // (truncated to 6000 chars), the second should exceed the 12,000 total cap
    const largeContent = "X".repeat(FOCUS_CONTEXT_MAX_CHARS_PER_FILE + 100);
    await writeFile(path.join(root, "control", "f1.md"), largeContent, "utf8");
    await writeFile(path.join(root, "control", "f2.md"), largeContent, "utf8");
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
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read, writeDocs]
    contextFiles: [f1.md, f2.md]
    routes:
      default: Notes
      decision: Decisions
`,
      "utf8",
    );

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
    // Split prompt to isolate Focus Context Injection section
    const injectionSection = result.systemPrompt.split("## Focus Context Injection")[1] ?? "";
    // The decision note should appear in injection
    assert.match(injectionSection, /ship it/);
    // f1.md should appear in injection (it fits within the total cap)
    assert.match(injectionSection, /### #0 Control: f1\.md/);
    // f2.md should be skipped due to total cap — check that no f2.md injection block appears
    const fileBlocks = injectionSection.match(/### #\d+ Control: f\d\.md/g) ?? [];
    assert.equal(fileBlocks.length, 1, "Expected exactly 1 context file block (f1.md)");
    // The total cap notice should appear
    assert.match(injectionSection, new RegExp(`Skipped.*after the ${FOCUS_CONTEXT_MAX_TOTAL_CHARS}-character total cap`));
  });
});
