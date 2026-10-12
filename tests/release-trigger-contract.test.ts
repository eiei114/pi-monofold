import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertReleaseTriggerContract } from "../scripts/release-trigger-contract.mjs";

const release = readFileSync(".github/workflows/auto-release.yml", "utf8");
const publish = readFileSync(".github/workflows/publish.yml", "utf8");

describe("protected release and publish trigger contract", () => {
  it("does not allow a maintenance merge to tag, release, or publish", () => {
    assert.doesNotThrow(() => assertReleaseTriggerContract(release, publish));
    assert.throws(() => assertReleaseTriggerContract(
      release.replace("  workflow_dispatch:", "  push:\n    branches: [main]\n  workflow_dispatch:"),
      publish,
    ));
    assert.throws(() => assertReleaseTriggerContract(
      release,
      publish.replace("    tags:", "    branches: [main]\n    tags:"),
    ));
  });

  it("keeps release dispatch restricted to main and rejects broad tag triggers", () => {
    assert.throws(() => assertReleaseTriggerContract(
      release.replace(" && github.ref == 'refs/heads/main'", ""),
      publish,
    ));
    assert.throws(() => assertReleaseTriggerContract(
      release,
      publish.replace("'v*.*.*'", "'*'"),
    ));
  });

  it("rejects invalid stable SemVer including leading zeroes", () => {
    const pattern = release.match(/grep -Eq '([^']+)'/)?.[1];
    assert.ok(pattern, "release workflow must validate the version with grep -E");
    const stableSemver = new RegExp(pattern);
    for (const version of ["0.0.0", "0.12.12", "10.20.300"]) assert.match(version, stableSemver);
    for (const version of ["01.2.3", "1.02.3", "1.2.03", "1.2", "1.2.3-beta"]) {
      assert.doesNotMatch(version, stableSemver);
    }
  });
});
