import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("CONTRIBUTING docs match release flow", () => {
  const contributing = readFileSync("CONTRIBUTING.md", "utf8");
  const release = readFileSync("docs/release.md", "utf8");

  it("documents separately authorized release instead of automatic publish on merge", () => {
    assert.doesNotMatch(
      contributing,
      /\bnpm version\b/,
      "CONTRIBUTING.md must not instruct direct npm version releases",
    );
    assert.doesNotMatch(
      contributing,
      /\bgit push\b/,
      "CONTRIBUTING.md must not instruct direct git push releases",
    );
    assert.match(
      contributing,
      /Open a PR/,
      "CONTRIBUTING.md should describe opening a PR before release",
    );
    assert.match(
      contributing,
      /Merge the PR to `main`; this does not create a tag or publish/,
      "CONTRIBUTING.md should state that merging does not release or publish",
    );
  });

  it("points contributors at docs/release.md for the full flow", () => {
    assert.match(
      contributing,
      /\[docs\/release\.md\]\(\.\/docs\/release\.md\)/,
      "CONTRIBUTING.md should link to docs/release.md",
    );
    assert.match(release, /Release \(manual\)/, "docs/release.md should document the manual release gate");
  });

  it("documents npm run check for local validation", () => {
    assert.match(
      contributing,
      /npm run check/,
      "CONTRIBUTING.md should document npm run check before PRs",
    );
  });
});
