import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import piMultiWorkspace from "../index.js";
import {
  biasMatchesTowardActiveFocus,
  clearActiveFocusPresetId,
  ensureActiveFocusInitialized,
  isTagBasedTargetInference,
  parseFocusPresets,
  resetActiveFocusSessionState,
  setActiveFocusPresetId,
} from "../focus-preset.js";

const sharedTagConfig = `version: 1
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
    tags: [control, shared]
    capabilities: [read, writeDocs, git]
    routes:
      default: .
  - name: Docs
    path: ./docs
    tags: [docs, shared]
    capabilities: [read, writeDocs, git]
    routes:
      default: .
  - name: Other
    path: ./other
    tags: [shared]
    capabilities: [read, writeDocs, git]
    routes:
      default: .
`;

const sharedTagPresets = parseFocusPresets([
  { id: "control", label: "Control", targets: [{ targetTags: ["control"] }] },
  { id: "docs", label: "Docs", targets: [{ targetTags: ["docs"] }] },
]);

async function makeRoot(config = sharedTagConfig) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-bias-"));
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await writeFile(path.join(root, ".pi", "monofold.yaml"), config, "utf8");
  for (const workspace of ["control", "docs", "other"]) {
    await mkdir(path.join(root, workspace), { recursive: true });
    await writeFile(path.join(root, workspace, "note.txt"), `${workspace} content`, "utf8");
  }
  return root;
}

function loadTools() {
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  piMultiWorkspace({
    on() {},
    registerTool(options: { name: string; execute: (...args: any[]) => Promise<any> }) {
      tools.set(options.name, options);
    },
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  return tools;
}

function makeCtx(root: string, options: { hasUI?: boolean; select?: (labels: string[]) => Promise<string | undefined> } = {}) {
  const selections: string[][] = [];
  return {
    cwd: root,
    hasUI: options.hasUI ?? true,
    ui: {
      select: async (_title: string, labels: string[]) => {
        selections.push(labels);
        if (options.select) return options.select(labels);
        return labels[0];
      },
      notify() {},
      confirm: async () => true,
      setStatus() {},
    },
    selections,
  };
}

describe("isTagBasedTargetInference", () => {
  it("detects tag-only target resolution", () => {
    assert.equal(isTagBasedTargetInference({ targetTags: ["shared"] }), true);
    assert.equal(isTagBasedTargetInference({ targetTags: ["shared"], targetId: "#0" }), false);
    assert.equal(isTagBasedTargetInference({ targetTags: ["shared"], targetName: "Control" }), false);
    assert.equal(isTagBasedTargetInference({ targetTags: ["shared"], workspaceIndex: 0 }), false);
    assert.equal(isTagBasedTargetInference({ targetId: "#0" }), false);
  });
});

describe("biasMatchesTowardActiveFocus", () => {
  it("keeps a single match unchanged", () => {
    const matches = [{ targetId: "#0" }];
    assert.deepEqual(biasMatchesTowardActiveFocus(matches, new Set(["#0", "#1"])), matches);
  });

  it("narrows to in-focus candidates when present", () => {
    const matches = [{ targetId: "#0" }, { targetId: "#1" }, { targetId: "#2" }];
    assert.deepEqual(
      biasMatchesTowardActiveFocus(matches, new Set(["#1"])),
      [{ targetId: "#1" }],
    );
  });

  it("returns all matches when no in-focus candidate exists", () => {
    const matches = [{ targetId: "#0" }, { targetId: "#2" }];
    assert.deepEqual(biasMatchesTowardActiveFocus(matches, new Set(["#9"])), matches);
  });
});

describe("active focus inference bias in monofold tools", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  it("prefers the in-focus workspace for ambiguous tag queries without prompting", async () => {
    const root = await makeRoot();
    const tools = loadTools();
    setActiveFocusPresetId("control", sharedTagPresets);
    const ctx = makeCtx(root, { hasUI: false });

    const read = tools.get("monofold_read");
    assert.ok(read);
    const result = await read.execute(
      "1",
      { mode: "file", path: "note.txt", targetTags: ["shared"] },
      undefined,
      undefined,
      ctx,
    );

    assert.match(result.content[0]!.text, /control content/);
    assert.equal(ctx.selections.length, 0);
  });

  it("ignores non-active matches when an active match exists", async () => {
    const root = await makeRoot();
    const tools = loadTools();
    setActiveFocusPresetId("docs", sharedTagPresets);
    const ctx = makeCtx(root, { hasUI: false });

    const read = tools.get("monofold_read");
    assert.ok(read);
    const result = await read.execute(
      "1",
      { mode: "file", path: "note.txt", targetTags: ["shared"] },
      undefined,
      undefined,
      ctx,
    );

    assert.match(result.content[0]!.text, /docs content/);
    assert.doesNotMatch(result.content[0]!.text, /control content/);
  });

  it("falls back to workspace selection when multiple in-focus ties remain", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: bundle
    label: Bundle
    targets:
      - targetTags: [alpha]
      - targetTags: [beta]
workspaces:
  - name: Alpha
    path: ./alpha
    tags: [alpha, shared]
    capabilities: [read]
  - name: Beta
    path: ./beta
    tags: [beta, shared]
    capabilities: [read]
`);
    await mkdir(path.join(root, "alpha"), { recursive: true });
    await mkdir(path.join(root, "beta"), { recursive: true });
    await writeFile(path.join(root, "alpha", "note.txt"), "alpha", "utf8");
    await writeFile(path.join(root, "beta", "note.txt"), "beta", "utf8");

    const bundlePresets = parseFocusPresets([
      {
        id: "bundle",
        label: "Bundle",
        targets: [{ targetTags: ["alpha"] }, { targetTags: ["beta"] }],
      },
    ]);
    const tools = loadTools();
    setActiveFocusPresetId("bundle", bundlePresets);
    const ctx = makeCtx(root, {
      select: async (labels) => {
        assert.equal(labels.length, 2);
        return labels.find((label) => label.includes("Beta"));
      },
    });

    const read = tools.get("monofold_read");
    assert.ok(read);
    const result = await read.execute(
      "1",
      { mode: "file", path: "note.txt", targetTags: ["shared"] },
      undefined,
      undefined,
      ctx,
    );

    assert.match(result.content[0]!.text, /beta/);
    assert.equal(ctx.selections.length, 1);
  });

  it("does not bias when an explicit target selector is provided", async () => {
    const root = await makeRoot();
    const tools = loadTools();
    setActiveFocusPresetId("control", sharedTagPresets);
    const ctx = makeCtx(root, { hasUI: false });

    const read = tools.get("monofold_read");
    assert.ok(read);
    const result = await read.execute(
      "1",
      { mode: "file", path: "note.txt", targetTags: ["shared"], targetId: "#1" },
      undefined,
      undefined,
      ctx,
    );

    assert.match(result.content[0]!.text, /docs content/);
  });

  it("does not bias ambiguous tag queries when active focus is cleared", async () => {
    const root = await makeRoot();
    const tools = loadTools();
    ensureActiveFocusInitialized(sharedTagPresets);
    clearActiveFocusPresetId();
    const ctx = makeCtx(root, {
      select: async (labels) => {
        assert.equal(labels.length, 3);
        return labels.find((label) => label.includes("Other"));
      },
    });

    const write = tools.get("monofold_write");
    assert.ok(write);
    const result = await write.execute(
      "1",
      {
        routeType: "default",
        title: "Bias Off",
        body: "body",
        targetTags: ["shared"],
      },
      undefined,
      undefined,
      ctx,
    );

    assert.match(result.content[0]!.text, /#2 Other/);
    assert.equal(ctx.selections.length, 1);
  });

  it("applies the same bias in monofold_git target resolution", async () => {
    const root = await makeRoot();
    const tools = loadTools();
    setActiveFocusPresetId("control", sharedTagPresets);
    const ctx = makeCtx(root, { hasUI: false });

    const git = tools.get("monofold_git");
    assert.ok(git);
    await assert.rejects(
      () =>
        git.execute(
          "1",
          { action: "status", targetTags: ["shared"] },
          undefined,
          undefined,
          ctx,
        ),
      /Not a Git Workspace: #0 Control/,
    );
    assert.equal(ctx.selections.length, 0);
  });
});
