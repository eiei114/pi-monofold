import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("release docs match CI", () => {
  const release = readFileSync("docs/release.md", "utf8");
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("documents version:check when CI runs it on pull requests", () => {
    assert.match(
      ci,
      /- name: Verify version bump policy[\s\S]*?if:\s*github\.event_name\s*==\s*'pull_request'[\s\S]*?run:\s*npm run version:check/,
      "ci.yml should run npm run version:check on PRs",
    );

    assert.match(
      release,
      /## Pull request validation[\s\S]*?npm run version:check/,
      "docs/release.md must document npm run version:check when ci.yml runs it on PRs",
    );
    assert.match(
      release,
      /## Pull request validation[\s\S]*?check-version-bump\.mjs/,
      "docs/release.md should point contributors at scripts/check-version-bump.mjs in the PR validation section",
    );
  });

  it("documents npm run check for the primary CI validation step", () => {
    assert.match(ci, /npm run check/, "ci.yml should run npm run check");
    assert.match(
      release,
      /npm run check/,
      "docs/release.md must document npm run check as the primary validation command",
    );
  });
});
