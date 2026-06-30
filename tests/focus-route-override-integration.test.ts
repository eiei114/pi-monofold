import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, beforeEach } from "node:test";
import piMultiWorkspace from "../index.js";
import { getActiveFocusPresetId, resetActiveFocusSessionState, setActiveFocusPresetId } from "../focus-preset.js";

describe("focus defaultRouteOverride", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  async function makeWorkspaceRoot() {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-route-"));
    await mkdir(path.join(root, ".pi"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "docs", "Progress"), { recursive: true });
    await mkdir(path.join(root, "docs", "Notes"), { recursive: true });
    await writeFile(
      path.join(root, ".pi", "monofold.yaml"),
      `version: 1
focusPresets:
  - id: docs
    label: Docs
    defaultRouteOverride: progress
    targets:
      - targetTags: [docs]
workspaces:
  - name: Docs
    path: ./docs
    tags: [docs]
    capabilities: [read, writeDocs]
    routes:
      default: Notes
      progress: Progress
`,
      "utf8",
    );
    return root;
  }

  function loadExtension() {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> | void }>();
    piMultiWorkspace({
      on() {},
      registerTool(options: { name: string; execute: (...args: any[]) => Promise<any> }) {
        tools.set(options.name, options);
      },
      registerCommand(name: string, options: { handler: (args: string, ctx: any) => Promise<void> | void }) {
        commands.set(name, options);
      },
      registerShortcut() {},
      sendMessage() {},
      sendUserMessage() {},
    } as any);
    return { tools, commands };
  }

  it("shows route override in focus status", async () => {
    const root = await makeWorkspaceRoot();
    const { commands } = loadExtension();
    const statuses = new Map<string, string | undefined>();
    const command = commands.get("monofold:focus");
    assert.ok(command);

    await command.handler("", {
      cwd: root,
      hasUI: true,
      ui: {
        select: async () => "Docs",
        notify: () => {},
        setStatus: (id: string, value: string | undefined) => statuses.set(id, value),
      },
    });

    assert.match(statuses.get("monofold-focus") ?? "", /route:progress/);
  });

  it("uses focus defaultRouteOverride for monofold_write when routeType is omitted", async () => {
    const root = await makeWorkspaceRoot();
    const { tools } = loadExtension();
    setActiveFocusPresetId("docs", [
      {
        id: "docs",
        label: "Docs",
        defaultRouteOverride: "progress",
        targets: [{ targetTags: ["docs"] }],
      },
    ]);

    const write = tools.get("monofold_write");
    assert.ok(write);
    const result = await write.execute(
      "1",
      {
        title: "Weekly update",
        body: "Shipped route overrides.",
        targetTags: ["docs"],
      },
      undefined,
      undefined,
      { cwd: root, hasUI: false, ui: { notify() {}, setStatus() {}, select: async () => undefined } },
    );

    assert.match(result.content[0]!.text, /Progress\//);
  });

  it("keeps explicit routeType ahead of focus defaultRouteOverride", async () => {
    const root = await makeWorkspaceRoot();
    const { tools } = loadExtension();
    setActiveFocusPresetId("docs", [
      {
        id: "docs",
        label: "Docs",
        defaultRouteOverride: "progress",
        targets: [{ targetTags: ["docs"] }],
      },
    ]);

    const write = tools.get("monofold_write");
    assert.ok(write);
    const result = await write.execute(
      "1",
      {
        routeType: "default",
        title: "General note",
        body: "Explicit default route.",
        targetTags: ["docs"],
      },
      undefined,
      undefined,
      { cwd: root, hasUI: false, ui: { notify() {}, setStatus() {}, select: async () => undefined } },
    );

    assert.match(result.content[0]!.text, /Notes\//);
    assert.doesNotMatch(result.content[0]!.text, /Progress\//);
  });

  it("includes defaultRouteOverride in monofold_list manifest output", async () => {
    const root = await makeWorkspaceRoot();
    const { tools } = loadExtension();
    setActiveFocusPresetId("docs", [
      {
        id: "docs",
        label: "Docs",
        defaultRouteOverride: "progress",
        targets: [{ targetTags: ["docs"] }],
      },
    ]);

    const list = tools.get("monofold_list");
    assert.ok(list);
    const result = await list.execute("1", {}, undefined, undefined, {
      cwd: root,
      hasUI: false,
      ui: { notify() {}, setStatus() {}, select: async () => undefined },
    });

    assert.match(result.content[0]!.text, /Default write route override: progress/);
    assert.match(result.content[0]!.text, /Focus health: ok/);
    assert.equal(getActiveFocusPresetId(), "docs");
  });

  it("shows no-focus health in monofold_list when no focusPresets exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-no-focus-"));
    await mkdir(path.join(root, ".pi"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(
      path.join(root, ".pi", "monofold.yaml"),
      `version: 1
workspaces:
  - name: Docs
    path: ./docs
    tags: [docs]
    capabilities: [read, writeDocs]
    routes:
      default: .
`,
      "utf8",
    );
    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    assert.ok(list);

    const result = await list.execute("1", {}, undefined, undefined, {
      cwd: root,
      hasUI: false,
      ui: { notify() {}, setStatus() {}, select: async () => undefined },
    });

    assert.match(result.content[0]!.text, /Active Focus: none/);
    assert.match(result.content[0]!.text, /Focus health: no focusPresets configured/);
  });

  it("rejects unresolved focus targets during config validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-warning-"));
    await mkdir(path.join(root, ".pi"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(
      path.join(root, ".pi", "monofold.yaml"),
      `version: 1
focusPresets:
  - id: missing
    label: Missing Target
    targets:
      - targetTags: [production]
workspaces:
  - name: Docs
    path: ./docs
    tags: [docs]
    capabilities: [read, writeDocs]
    routes:
      default: .
`,
      "utf8",
    );
    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    assert.ok(list);

    await assert.rejects(
      () =>
        list.execute("1", {}, undefined, undefined, {
          cwd: root,
          hasUI: false,
          ui: { notify() {}, setStatus() {}, select: async () => undefined },
        }),
      /matches no workspace target in preset "missing"/,
    );
  });
});
