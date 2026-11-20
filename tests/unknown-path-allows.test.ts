import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  clearUnknownPathAllows,
  loadUnknownPathAllows,
  rememberUnknownPathAllow,
  resolveUnknownPathAllowsPath,
} from "../unknown-path-allows.js";
import { resolveAbsoluteTargetPath } from "../workspace-path-lookup.js";

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-allows-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("unknown path allows", () => {
  it("persists remembered paths across reloads", async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "..", "outside", "package.json");

      await rememberUnknownPathAllow(root, target);

      const stored = await loadUnknownPathAllows(root);
      assert.equal(stored.has(path.resolve(target)), true);

      const json = JSON.parse(await readFile(resolveUnknownPathAllowsPath(root), "utf8")) as { version: number; paths: string[] };
      assert.equal(json.version, 1);
      assert.deepEqual(json.paths, [path.resolve(target)]);
    });
  });

  it("clears remembered paths by removing the persisted file", async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "..", "outside", "README.md");

      await rememberUnknownPathAllow(root, target);
      const cleared = await clearUnknownPathAllows(root);

      assert.equal(cleared, 1);
      const stored = await loadUnknownPathAllows(root);
      assert.equal(stored.size, 0);
    });
  });

  it("persists and reloads canonical Windows-style paths consistently across hosts", async () => {
    await withTempRoot(async (root) => {
      const target = "C:/outside/README.md";
      const expected = resolveAbsoluteTargetPath(process.cwd(), target);

      await rememberUnknownPathAllow(root, target);

      const stored = await loadUnknownPathAllows(root);
      assert.equal(stored.has(expected), true);

      const json = JSON.parse(await readFile(resolveUnknownPathAllowsPath(root), "utf8")) as { paths: string[] };
      assert.deepEqual(json.paths, [expected]);
    });
  });

  it("rejects malformed JSON instead of treating it as an empty allowlist", async () => {
    await withTempRoot(async (root) => {
      const filePath = resolveUnknownPathAllowsPath(root);
      const malformedJson = '{"version": 1, "paths": [';
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, malformedJson, "utf8");

      await assert.rejects(loadUnknownPathAllows(root), SyntaxError);
    });
  });

  it("rejects unsupported versions and non-string path entries", async () => {
    const invalidFiles = [
      { contents: JSON.stringify({ version: 2, paths: [] }), error: /requires version: 1/ },
      { contents: JSON.stringify({ version: 1, paths: ["/valid/path", 42] }), error: /requires string\[\] paths/ },
    ];

    for (const { contents, error } of invalidFiles) {
      await withTempRoot(async (root) => {
        const filePath = resolveUnknownPathAllowsPath(root);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, contents, "utf8");

        await assert.rejects(loadUnknownPathAllows(root), error);
      });
    }
  });

  it("does not overwrite malformed persisted data when remembering another path", async () => {
    const malformedFiles = [
      '{"version": 1, "paths": [',
      JSON.stringify({ version: 2, paths: [] }),
      JSON.stringify({ version: 1, paths: ["/valid/path", 42] }),
    ];

    for (const originalContents of malformedFiles) {
      await withTempRoot(async (root) => {
        const filePath = resolveUnknownPathAllowsPath(root);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, originalContents, "utf8");

        await assert.rejects(rememberUnknownPathAllow(root, "/new/path"));
        assert.equal(await readFile(filePath, "utf8"), originalContents);
      });
    }
  });
});
