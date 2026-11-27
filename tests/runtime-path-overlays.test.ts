import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import piMonofold from "../index.js";

type ToolEntry = { execute: (...args: any[]) => Promise<any> };

const runtimeEnvKeys = ["PI_MONOFOLD_RUNTIME", "MONOFOLD_RUNTIME"] as const;
let originalRuntimeEnv: (string | undefined)[];

beforeEach(() => {
  originalRuntimeEnv = runtimeEnvKeys.map((key) => process.env[key]);
});

afterEach(() => {
  runtimeEnvKeys.forEach((key, index) => {
    const value = originalRuntimeEnv[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manifestRuntimePathRegex(absolutePath: string, source: "overlay" | "base"): RegExp {
  const normalized = absolutePath.replace(/\\/g, "/");
  return new RegExp(`runtimePath: ${escapeRegex(normalized)} \\(${source}\\)`);
}

describe("runtime path overlays", () => {
  for (const { title, primary, expectedRuntime } of [
    { title: "uses MONOFOLD_RUNTIME when PI_MONOFOLD_RUNTIME is unset", primary: undefined, expectedRuntime: "alias-runtime" },
    { title: "prefers PI_MONOFOLD_RUNTIME when both variables are set", primary: " Primary Runtime ", expectedRuntime: "primary-runtime" },
  ]) {
    it(title, async (t) => {
      if (primary === undefined) delete process.env.PI_MONOFOLD_RUNTIME;
      else process.env.PI_MONOFOLD_RUNTIME = primary;
      process.env.MONOFOLD_RUNTIME = " Alias Runtime ";

      const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-runtime-env-"));
      t.after(() => rm(root, { recursive: true, force: true }));
      const baseRoot = path.join(root, "base");
      const primaryRoot = path.join(root, "primary-overlay");
      const aliasRoot = path.join(root, "alias-overlay");
      for (const dir of [baseRoot, primaryRoot, aliasRoot]) await mkdir(dir);
      await writeConfig(
        root,
        `version: 1
workspaces:
  - name: Runtime Env Fixture
    path: ./base
    pathOverlays:
      primary-runtime: ${JSON.stringify(primaryRoot.replace(/\\/g, "/"))}
      alias-runtime: ${JSON.stringify(aliasRoot.replace(/\\/g, "/"))}
    tags: [runtime-fixture]
    capabilities: [read]
`,
      );

      const list = loadExtension().tools.get("monofold_list");
      assert.ok(list);
      const result = await list.execute("1", {}, undefined, undefined, ctx(root));
      const expectedRoot = expectedRuntime === "alias-runtime" ? aliasRoot : primaryRoot;
      assert.equal(result.details.workspaces.length, 1);
      assert.equal(path.normalize(result.details.workspaces[0].runtimeResolvedPath), expectedRoot);
      assert.equal(result.details.workspaces[0].runtimePathSource, "overlay");
      assert.ok(result.content[0]!.text.split("\n").includes(`Active runtime: ${expectedRuntime} [env]`));
    });
  }

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
    assert.match(manifest, manifestRuntimePathRegex(overlayRoot, "overlay"));

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
    assert.match(manifest, manifestRuntimePathRegex(baseRoot, "base"));

    const readResult = await read.execute(
      "1",
      { mode: "file", path: "README.md", targetTags: ["development", "pi-monofold"] },
      undefined,
      undefined,
      ctx(root),
    );
    assert.match(readResult.content[0]!.text, /README from base-dev/);
  });

  it("does not fail validation when inactive overlay paths are missing on this machine", async () => {
    process.env.PI_MONOFOLD_RUNTIME = "win-keisu";
    const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-inactive-overlay-"));
    const baseRoot = await makeWorkspace(root, "base-dev");
    await writeConfig(
      root,
      `version: 1
workspaces:
  - name: Dev Repo
    path: ./base-dev
    pathOverlays:
      mac-missing-only: /Users/nobody/this/path/does/not/exist/on/windows
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
    assert.match(manifest, /Active runtime: win-keisu \[env\]/);
    assert.match(manifest, manifestRuntimePathRegex(baseRoot, "base"));

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
