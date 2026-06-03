import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_PREVIEW_LINES } from "../file-read-preview.js";
import { DEFAULT_MAX_ENTRIES, DEFAULT_MAX_MATCHES } from "../read-caps.js";
import { buildMonofoldTree, readMonofoldFile, runMonofoldSearch } from "../monofold-read-ops.js";

describe("readMonofoldFile", () => {
  it("matches monofold_read safe preview defaults for large files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "monofold-read-ops-"));
    try {
      const filePath = path.join(dir, "large.txt");
      const lines = Array.from({ length: DEFAULT_PREVIEW_LINES + 10 }, (_, index) => `line ${index + 1}`);
      await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");

      const result = await readMonofoldFile(filePath, "large.txt");
      assert.equal(result.details.truncated, true);
      assert.match(result.text, /line 1/);
      assert.doesNotMatch(result.text, /line 30/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns full content when includeContent is true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "monofold-read-ops-"));
    try {
      const filePath = path.join(dir, "full.txt");
      await writeFile(filePath, "alpha\nbeta\n", "utf8");
      const result = await readMonofoldFile(filePath, "full.txt", { includeContent: true });
      assert.equal(result.details.truncated, false);
      assert.match(result.text, /beta/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("buildMonofoldTree", () => {
  it("caps tree output at the default entry limit", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "monofold-read-ops-tree-"));
    try {
      for (let index = 0; index < DEFAULT_MAX_ENTRIES + 5; index += 1) {
        await writeFile(path.join(dir, `entry-${index}.txt`), "x", "utf8");
      }
      const result = await buildMonofoldTree(dir, 0);
      assert.equal(result.returnedEntryCount, DEFAULT_MAX_ENTRIES);
      assert.equal(result.truncated, true);
      assert.match(result.text, /\[truncated: showing/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runMonofoldSearch", () => {
  it("applies the same search caps as monofold_read mode=search", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "monofold-read-ops-search-"));
    try {
      await mkdir(path.join(dir, "src"), { recursive: true });
      await writeFile(path.join(dir, "src", "a.ts"), "needle\n", "utf8");
      const lines = Array.from({ length: DEFAULT_MAX_MATCHES + 5 }, (_, index) => `file.ts:${index}:needle`);
      const runCommand = async () => ({ stdout: lines.join("\n"), stderr: "", exitCode: 0 });
      const result = await runMonofoldSearch(runCommand, dir, "needle");
      assert.equal(result.returnedMatchCount, DEFAULT_MAX_MATCHES);
      assert.equal(result.truncated, true);
      assert.match(result.text, /\[truncated: showing/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
