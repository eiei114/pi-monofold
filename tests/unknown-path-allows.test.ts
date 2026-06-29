import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  clearUnknownPathAllows,
  loadUnknownPathAllows,
  rememberUnknownPathAllow,
  resolveUnknownPathAllowsPath,
} from "../unknown-path-allows.js";

describe("unknown path allows", () => {
  it("persists remembered paths across reloads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-allows-"));
    const target = path.join(root, "..", "outside", "package.json");

    await rememberUnknownPathAllow(root, target);

    const stored = await loadUnknownPathAllows(root);
    assert.equal(stored.has(path.resolve(target)), true);

    const json = JSON.parse(await readFile(resolveUnknownPathAllowsPath(root), "utf8")) as { version: number; paths: string[] };
    assert.equal(json.version, 1);
    assert.deepEqual(json.paths, [path.resolve(target)]);
  });

  it("clears remembered paths by removing the persisted file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-monofold-allows-"));
    const target = path.join(root, "..", "outside", "README.md");

    await rememberUnknownPathAllow(root, target);
    const cleared = await clearUnknownPathAllows(root);

    assert.equal(cleared, 1);
    const stored = await loadUnknownPathAllows(root);
    assert.equal(stored.size, 0);
  });
});
