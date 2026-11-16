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

describe("docs/usage.md matches the Unknown Path allow contract", () => {
  const usage = readFileSync("docs/usage.md", "utf8");
  const index = readFileSync("index.ts", "utf8");
  const allows = readFileSync("unknown-path-allows.ts", "utf8");

  it("lists the clear command in the commands table", () => {
    assert.match(
      usage,
      /^\| `\/monofold:clear-unknown-path-allows` \|/m,
      "docs/usage.md should list /monofold:clear-unknown-path-allows in the commands table",
    );
  });

  it("registers the documented command name in index.ts", () => {
    assert.match(index, /registerCommand\("monofold:clear-unknown-path-allows"/);
    assert.match(usage, /\/monofold:clear-unknown-path-allows/);
  });

  it("documents the persisted file path and shape used by the implementation", () => {
    assert.match(allows, /path\.join\("\.pi", "monofold-unknown-path-allows\.json"\)/);
    assert.match(usage, /\.pi\/monofold-unknown-path-allows\.json/);
    assert.match(allows, /version: 1;/);
    assert.match(usage, /"version": 1/);
    assert.match(usage, /"paths": \[/);
  });

  it("documents every confirmation choice offered by the guard", () => {
    for (const choice of [
      "Yes (remember across sessions)",
      "Yes (just this once)",
      "No",
    ]) {
      assert.equal(
        index.includes(`"${choice}"`),
        true,
        `index.ts should still offer ${choice}`,
      );
      assert.equal(
        usage.includes(choice),
        true,
        `docs/usage.md should document ${choice}`,
      );
    }
  });
});
