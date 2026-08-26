import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("CONTRIBUTING docs match release flow", () => {
  const contributing = readFileSync("CONTRIBUTING.md", "utf8");
  const release = readFileSync("docs/release.md", "utf8");

  it("documents PR-based release instead of direct npm version push", () => {
    assert.doesNotMatch(
      contributing,
      /npm version patch/,
      "CONTRIBUTING.md must not instruct npm version patch; releases go through PR merge",
    );
    assert.match(
      contributing,
      /Open a PR/,
      "CONTRIBUTING.md should describe opening a PR before release",
    );
    assert.match(
      contributing,
      /Merge to `main`/,
      "CONTRIBUTING.md should describe merging to main for automated release",
    );
  });

  it("points contributors at docs/release.md for the full flow", () => {
    assert.match(
      contributing,
      /\[docs\/release\.md\]\(\.\/docs\/release\.md\)/,
      "CONTRIBUTING.md should link to docs/release.md",
    );
    assert.match(
      release,
      /Auto Release/,
      "docs/release.md should document Auto Release for cross-check",
    );
  });

  it("documents npm run check for local validation", () => {
    assert.match(
      contributing,
      /npm run check/,
      "CONTRIBUTING.md should document npm run check before PRs",
    );
  });
});
