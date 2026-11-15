import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { normalizeGuardPath } from "../path-normalize.js";

describe("normalizeGuardPath", () => {
  it("repairs MSYS-style C:/c/Users paths on Windows", () => {
    const input = "C:\\c\\Users\\Keisu\\Projects\\OSS\\pi-weighted-model-router";
    const expected = path.resolve("C:/Users/Keisu/Projects/OSS/pi-weighted-model-router");
    assert.equal(normalizeGuardPath(input), expected);
  });

  it("preserves Windows paths with a real c directory on another drive", () => {
    const input = "D:/c/projects/app";
    assert.equal(normalizeGuardPath(input), path.resolve(input));
  });

  it("repairs MSYS-style paths when the repeated directory matches the drive", () => {
    const input = "D:/d/Users/x";
    const expected = path.resolve("D:/Users/x");
    assert.equal(normalizeGuardPath(input), expected);
  });

  it("repairs /c/Users unix-style MSYS paths", () => {
    const input = "/c/Users/Keisu/Projects/OSS/pi-weighted-model-router";
    const expected = path.resolve("C:/Users/Keisu/Projects/OSS/pi-weighted-model-router");
    assert.equal(normalizeGuardPath(input), expected);
  });

  it("leaves canonical Windows paths unchanged", () => {
    const input = "C:/Users/Keisu/Projects/OSS/pi-weighted-model-router";
    const expected = path.resolve(input);
    assert.equal(normalizeGuardPath(input), expected);
  });

  it("trims surrounding whitespace", () => {
    const input = "  C:/Users/Keisu/Projects/OSS/pi-weighted-model-router  ";
    const expected = path.resolve("C:/Users/Keisu/Projects/OSS/pi-weighted-model-router");
    assert.equal(normalizeGuardPath(input), expected);
  });
});
