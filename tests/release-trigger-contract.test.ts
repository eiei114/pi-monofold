import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertReleaseTriggerContract } from "../scripts/release-trigger-contract.mjs";
import { assertTagMatchesHead, isStableSemver } from "../scripts/auto-release.mjs";

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
    for (const version of ["0.0.0", "0.12.12", "10.20.300"]) assert.equal(isStableSemver(version), true);
    for (const version of ["01.2.3", "1.02.3", "1.2.03", "1.2", "1.2.3-beta"]) {
      assert.equal(isStableSemver(version), false);
    }
  });
});

describe("release tag must match the commit under review", () => {
  const head = "a".repeat(40);
  const make = (tagSha: string, status = 0) => (_cmd: string, _args: string[], _opts?: unknown) => ({
    status, stdout: tagSha ? `${tagSha}
` : "", stderr: "",
  });

  it("accepts a tag that points at HEAD", () => {
    assert.equal(assertTagMatchesHead(make(head) as never, "v1.2.3", head), head);
  });

  it("fails closed when the existing tag points at a different commit", () => {
    assert.throws(() => assertTagMatchesHead(make("b".repeat(40)) as never, "v1.2.3", head),
      /refusing to release a different commit/);
  });

  it("fails closed when the tag cannot be resolved or HEAD is unknown", () => {
    assert.throws(() => assertTagMatchesHead(make("", 1) as never, "v1.2.3", head), /Unable to resolve commit/);
    assert.throws(() => assertTagMatchesHead(make(head) as never, "v1.2.3", ""), /HEAD commit is required/);
  });
});
