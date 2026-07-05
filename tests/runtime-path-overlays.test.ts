import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import piMonofold from "../index.js";

type ToolEntry = { execute: (...args: any[]) => Promise<any> };

const ORIGINAL_RUNTIME = process.env.PI_MONOFOLD_RUNTIME;

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.PI_MONOFOLD_RUNTIME;
  else process.env.PI_MONOFOLD_RUNTIME = ORIGINAL_RUNTIME;
});

function loadExtension() {
  const tools = new Map<string, ToolEntry>();
  piMonofold({
    on() {},
    registerTool(options: { name: string; execute: (...args: any[]) => Promise<any> }) {
      tools.set(options.name, options);
    },
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  return { tools };
}

async function makeWorkspace(root: string, name: string) {
  const workspaceRoot = path.join(root, name);
  await mkdir(path.join(workspaceRoot, "Notes"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "Progress"), { recursive: true });
  await writeFile(path.join(workspaceRoot, "README.md"), `README from ${name}\n`, "utf8");
  execFileSync("git", ["init"], { cwd: workspaceRoot, stdio: "ignore" });
  return workspaceRoot;
}

async function writeConfig(root: string, body: string) {
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await writeFile(path.join(root, ".pi", "monofold.yaml"), body, "utf8");
}

function ctx(cwd: string) {
  return {
    cwd,
    hasUI: false,
    ui: { notify() {}, setStatus() {}, select: async () => undefined },
  };
}

describe("runtime path overlays", () => {
  it("uses the active runtime overlay for list, read, write, and git", async () => {
    process.env.PI_MONOFOLD_RUNTIME = "mac-eiei114";
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-overlay-"));
    const overlayRoot = await makeWorkspace(root, "overlay-dev");
    await writeConfig(
      root,
      `version: 1
workspaces:
  - name: Dev Repo
    path: C:/Users/Keisu/Projects/OSS/pi-monofold
    pathOverlays:
      mac-eiei114: ${overlayRoot}
    tags: [development, pi-monofold]
    capabilities: [read, writeDocs, runCommands, git]
    contextFiles: [README.md]
    routes:
      default: Notes
      progress: Progress
`,
    );

    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    const read = tools.get("monofold_read");
    const write = tools.get("monofold_write");
    const git = tools.get("monofold_git");
    assert.ok(list && read && write && git);

    const listResult = await list.execute("1", {}, undefined, undefined, ctx(root));
    const manifest = listResult.content[0]!.text;
    assert.match(manifest, /Active runtime: mac-eiei114 \[env\]/);
    assert.match(manifest, new RegExp(`runtimePath: ${overlayRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(overlay\\)`));

    const readResult = await read.execute(
      "1",
      { mode: "file", path: "README.md", targetTags: ["development", "pi-monofold"] },
      undefined,
      undefined,
      ctx(root),
    );
    assert.match(readResult.content[0]!.text, /README from overlay-dev/);

    const gitResult = await git.execute(
      "1",
      { action: "status", targetTags: ["development", "pi-monofold"] },
      undefined,
      undefined,
      ctx(root),
    );
    assert.match(gitResult.content[0]!.text, /README\.md/);

    const writeResult = await write.execute(
      "1",
      {
        targetTags: ["development", "pi-monofold"],
        title: "Overlay note",
        body: "runtime overlay write",
      },
      undefined,
      undefined,
      ctx(root),
    );
    assert.match(writeResult.content[0]!.text, /Notes\//);
    const noteFiles = await readdir(path.join(overlayRoot, "Notes"));
    assert.equal(noteFiles.length, 1);
    assert.match(await readFile(path.join(overlayRoot, "Notes", noteFiles[0]!), "utf8"), /runtime overlay write/);
  });

  it("falls back to the base path when no overlay matches the active runtime", async () => {
    process.env.PI_MONOFOLD_RUNTIME = "linux-other";
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-base-"));
    const baseRoot = await makeWorkspace(root, "base-dev");
    await writeConfig(
      root,
      `version: 1
workspaces:
  - name: Dev Repo
    path: ./base-dev
    pathOverlays:
      win-keisu: C:/Users/Keisu/Projects/OSS/pi-monofold
    tags: [development, pi-monofold]
    capabilities: [read]
    contextFiles: [README.md]
`,
    );

    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    const read = tools.get("monofold_read");
    assert.ok(list && read);

    const listResult = await list.execute("1", {}, undefined, undefined, ctx(root));
    const manifest = listResult.content[0]!.text;
    assert.match(manifest, /Active runtime: linux-other \[env\]/);
    assert.match(manifest, new RegExp(`runtimePath: ${baseRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(base\\)`));

    const readResult = await read.execute(
      "1",
      { mode: "file", path: "README.md", targetTags: ["development", "pi-monofold"] },
      undefined,
      undefined,
      ctx(root),
    );
    assert.match(readResult.content[0]!.text, /README from base-dev/);
  });

  it("rejects non-absolute overlay paths", async () => {
    process.env.PI_MONOFOLD_RUNTIME = "mac-eiei114";
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-invalid-overlay-"));
    await makeWorkspace(root, "base-dev");
    await writeConfig(
      root,
      `version: 1
workspaces:
  - name: Dev Repo
    path: ./base-dev
    pathOverlays:
      mac-eiei114: ./relative-dev
    tags: [development, pi-monofold]
    capabilities: [read]
`,
    );

    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    assert.ok(list);

    await assert.rejects(
      () => list.execute("1", {}, undefined, undefined, ctx(root)),
      /pathOverlays\.mac-eiei114 must be an absolute path/,
    );
  });
});
