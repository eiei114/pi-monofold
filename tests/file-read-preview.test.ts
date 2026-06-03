import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PREVIEW_CHARS,
  DEFAULT_PREVIEW_LINES,
  buildFileReadResponse,
  truncationHint,
} from "../file-read-preview.js";

const stat = { size: 100, mtime: new Date("2026-06-01T12:00:00.000Z") };

describe("buildFileReadResponse", () => {
  it("returns full content for small files within default preview bounds", () => {
    const content = "line one\nline two\n";
    const result = buildFileReadResponse(content, {}, stat, { relativePath: "small.txt" });

    assert.equal(result.details.truncated, false);
    assert.equal(result.details.characterCount, content.length);
    assert.equal(result.details.lineCount, 2);
    assert.match(result.text, /line one/);
    assert.match(result.text, /line two/);
    assert.doesNotMatch(result.text, /\[truncated\]/);
  });

  it("truncates large files by default with metadata and hint", () => {
    const lines = Array.from({ length: DEFAULT_PREVIEW_LINES + 10 }, (_, index) => `line ${index + 1}`);
    const content = `${lines.join("\n")}\n`;
    const result = buildFileReadResponse(content, {}, stat, { relativePath: "large.txt" });

    assert.equal(result.details.truncated, true);
    assert.equal(result.details.previewLineCount, DEFAULT_PREVIEW_LINES);
    assert.ok(result.details.previewCharacterCount <= DEFAULT_PREVIEW_CHARS);
    assert.match(result.text, /line 1\n/);
    assert.match(result.text, /\[truncated\]/);
    assert.match(result.text, new RegExp(truncationHint(result.details).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.text, /line 30/);
  });

  it("returns full content when includeContent is true", () => {
    const lines = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`);
    const content = `${lines.join("\n")}\n`;
    const result = buildFileReadResponse(content, { includeContent: true }, stat, {
      relativePath: "large.txt",
    });

    assert.equal(result.details.truncated, false);
    assert.equal(result.details.includeContent, true);
    assert.match(result.text, /line 50/);
    assert.doesNotMatch(result.text, /\[truncated\]/);
  });

  it("honors maxChars opt-in", () => {
    const content = "abcdefghij";
    const result = buildFileReadResponse(content, { maxChars: 4 }, stat, { relativePath: "chars.txt" });

    assert.equal(result.details.truncated, true);
    assert.equal(result.details.maxChars, 4);
    assert.equal(result.details.previewCharacterCount, 4);
    assert.match(result.text, /abcd/);
    assert.doesNotMatch(result.text, /efgh/);
  });

  it("honors head and tail opt-in", () => {
    const content = "a\nb\nc\nd\ne\n";
    const result = buildFileReadResponse(content, { head: 2, tail: 2 }, stat, {
      relativePath: "head-tail.txt",
    });

    assert.equal(result.details.truncated, true);
    assert.match(result.text, /\na\n/);
    assert.match(result.text, /omitted/);
    assert.match(result.text, /\nd\n/);
    assert.match(result.text, /\ne/);
    assert.doesNotMatch(result.text, /\nc\n/);
  });
});
