import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_MATCHES,
  capSearchOutput,
  capTreeLines,
  resolveSearchCaps,
  resolveTreeCaps,
} from "../read-caps.js";

describe("resolveSearchCaps", () => {
  it("uses conservative defaults", () => {
    assert.deepEqual(resolveSearchCaps(), {
      maxMatches: DEFAULT_MAX_MATCHES,
      maxChars: DEFAULT_MAX_CHARS,
    });
  });

  it("rejects non-positive maxMatches", () => {
    assert.throws(() => resolveSearchCaps({ maxMatches: 0 }), /maxMatches must be a positive integer/);
  });
});

describe("resolveTreeCaps", () => {
  it("uses conservative defaults", () => {
    assert.deepEqual(resolveTreeCaps(), { maxEntries: DEFAULT_MAX_ENTRIES });
  });

  it("rejects non-positive maxEntries", () => {
    assert.throws(() => resolveTreeCaps({ maxEntries: -1 }), /maxEntries must be a positive integer/);
  });
});

describe("capSearchOutput", () => {
  it("returns No matches for empty input", () => {
    const result = capSearchOutput("", resolveSearchCaps());
    assert.equal(result.text, "No matches");
    assert.equal(result.matchCount, 0);
    assert.equal(result.truncated, false);
  });

  it("passes through small output unchanged", () => {
    const raw = "src/a.ts:1:foo\nsrc/b.ts:2:bar";
    const result = capSearchOutput(raw, resolveSearchCaps());
    assert.equal(result.text, raw);
    assert.equal(result.matchCount, 2);
    assert.equal(result.returnedMatchCount, 2);
    assert.equal(result.truncated, false);
  });

  it("truncates by maxMatches and appends hint", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `file.ts:${i}:match`);
    const caps = resolveSearchCaps({ maxMatches: 3, maxChars: 10_000 });
    const result = capSearchOutput(lines.join("\n"), caps);
    assert.equal(result.matchCount, 10);
    assert.equal(result.returnedMatchCount, 3);
    assert.equal(result.truncated, true);
    assert.match(result.text, /^file\.ts:0:match\nfile\.ts:1:match\nfile\.ts:2:match/);
    assert.match(result.text, /\[truncated: showing 3 of 10 matches/);
    assert.ok(result.hint);
  });

  it("truncates by maxChars when lines are long", () => {
    const lines = ["a".repeat(100), "b".repeat(100), "c".repeat(100)];
    const caps = resolveSearchCaps({ maxMatches: 50, maxChars: 150 });
    const result = capSearchOutput(lines.join("\n"), caps);
    assert.equal(result.truncated, true);
    assert.ok(result.returnedMatchCount < 3);
  });
});

describe("capTreeLines", () => {
  it("passes through small trees unchanged", () => {
    const lines = ["src/", "src/a.ts", "README.md"];
    const result = capTreeLines(lines, resolveTreeCaps());
    assert.equal(result.text, lines.join("\n"));
    assert.equal(result.entryCount, 3);
    assert.equal(result.truncated, false);
  });

  it("truncates large trees with hint", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `entry-${i}.txt`);
    const caps = resolveTreeCaps({ maxEntries: 5 });
    const result = capTreeLines(lines, caps);
    assert.equal(result.entryCount, 250);
    assert.equal(result.returnedEntryCount, 5);
    assert.equal(result.truncated, true);
    assert.match(result.text, /\[truncated: showing 5 of 250 entries/);
    assert.ok(result.hint);
  });

  it("marks traversal-truncated trees when total count is unknown", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `entry-${i}.txt`);
    const caps = resolveTreeCaps({ maxEntries: 5 });
    const result = capTreeLines(lines, caps, true);
    assert.equal(result.entryCount, 6);
    assert.equal(result.returnedEntryCount, 5);
    assert.equal(result.truncated, true);
    assert.match(result.text, /\[truncated: showing 5 of 6 entries/);
  });
});
