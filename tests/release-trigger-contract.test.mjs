import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeRelease, isStableSemver, shouldDispatchPublish } from "../scripts/auto-release.mjs";

const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

function createReleaseHarness() {
  const state = {
    remoteTagExists: false,
    localTagExists: false,
    releaseExists: false,
    publishRuns: [],
    failReleaseCreate: false,
    failPublishDispatch: false,
    publishAttempts: 0,
  };
  const calls = [];
  const execute = (command, args, { allowFailure = false } = {}) => {
    calls.push([command, ...args]);
    if (command === "git" && args[0] === "ls-remote") {
      return state.remoteTagExists
        ? { status: 0, stdout: "tag-sha refs/tags/v0.12.12\n", stderr: "" }
        : { status: 2, stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "tag" && args[1] === "--list") {
      return { status: 0, stdout: state.localTagExists ? "v0.12.12\n" : "", stderr: "" };
    }
    if (command === "git" && args[0] === "tag" && args[1] === "--sort=-version:refname") {
      return { status: 0, stdout: "v0.12.12\nv0.12.11\n", stderr: "" };
    }
    if (command === "git" && args[0] === "tag" && args.length === 2) {
      state.localTagExists = true;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "push") {
      state.remoteTagExists = true;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "rev-parse") {
      return { status: 0, stdout: "tag-sha\n", stderr: "" };
    }
    if (command === "gh" && args[0] === "api" && args[1].includes("/releases/tags/")) {
      return state.releaseExists
        ? { status: 0, stdout: "{}", stderr: "" }
        : { status: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
    }
    if (command === "gh" && args[0] === "release" && args[1] === "create") {
      if (state.failReleaseCreate) {
        state.failReleaseCreate = false;
        throw new Error("simulated release-create failure");
      }
      state.releaseExists = true;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "gh" && args[0] === "api" && args[1].includes("/actions/workflows/publish.yml/runs")) {
      assert.equal(args[args.indexOf("--method") + 1], "GET", "workflow run lookup must not dispatch a POST request");
      return { status: 0, stdout: JSON.stringify({ workflow_runs: state.publishRuns }), stderr: "" };
    }
    if (command === "gh" && args[0] === "workflow" && args[1] === "run") {
      state.publishAttempts += 1;
      if (state.failPublishDispatch) {
        state.failPublishDispatch = false;
        throw new Error("simulated publish-dispatch failure");
      }
      state.publishRuns.push({ event: "workflow_dispatch", head_branch: "v0.12.12", head_sha: "tag-sha", status: "queued", conclusion: null });
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")} (allowFailure=${allowFailure})`);
  };
  return { state, calls, execute };
}

function assertNoMergeTriggeredRelease(release, publish) {
  const releaseTriggers = release.split("permissions:")[0];
  const publishTriggers = publish.split("permissions:")[0];
  assert.match(releaseTriggers, /on:\r?\n\s+workflow_dispatch:/, "release must be manually triggered only");
  assert.doesNotMatch(releaseTriggers, /^\s+push:/m, "a merge must not start release");
  assert.match(release, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publishTriggers, /push:\r?\n\s+tags:/, "publishing must remain version-tag gated");
  assert.doesNotMatch(publishTriggers, /branches:|paths:/, "main branch/package edits must not publish");
  assert.match(publishTriggers, /workflow_dispatch:/, "explicit manual publishing remains available");
  assert.match(publish, /npm publish/);
}

test("merging code cannot directly or indirectly trigger npm publish or release", () => {
  assert.doesNotThrow(() => assertNoMergeTriggeredRelease(releaseWorkflow, publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow.replace("  workflow_dispatch:", "  push:\n    branches: [main]\n  workflow_dispatch:"), publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow, publishWorkflow.replace("    tags:", "    branches: [main]\n    tags:")));
});

test("manual release rejects malformed SemVer without leading zeroes", () => {
  for (const version of ["0.0.0", "1.4.2", "10.20.300"]) assert.equal(isStableSemver(version), true);
  for (const version of ["01.4.2", "1.04.2", "1.4.02", "1.4", "1.4.2-beta"]) {
    assert.equal(isStableSemver(version), false);
  }
});

test("manual release workflow delegates to independently retryable release stages", async () => {
  assert.match(releaseWorkflow, /run: node scripts\/auto-release\.mjs/);

  const { state, calls, execute } = createReleaseHarness();
  state.failPublishDispatch = true;
  assert.throws(() => completeRelease({ version: "0.12.12", repository: "eiei114/pi-monofold", execute }), /simulated publish-dispatch failure/);
  assert.equal(state.remoteTagExists, true);
  assert.equal(state.releaseExists, true);
  assert.equal(state.publishAttempts, 1);

  completeRelease({ version: "0.12.12", repository: "eiei114/pi-monofold", execute });
  assert.equal(state.publishAttempts, 2, "a missing publish dispatch is retried despite the existing tag and release");
  assert.equal(state.publishRuns.length, 1);
  assert.equal(calls.filter((call) => call[0] === "gh" && call[1] === "release" && call[2] === "create").length, 1);

  completeRelease({ version: "0.12.12", repository: "eiei114/pi-monofold", execute });
  assert.equal(state.publishAttempts, 2, "a queued publish run is not dispatched again");
});

test("manual release creates a missing release when the tag already exists", () => {
  const { state, calls, execute } = createReleaseHarness();
  state.remoteTagExists = true;
  state.localTagExists = true;
  state.failReleaseCreate = true;
  assert.throws(() => completeRelease({ version: "0.12.12", repository: "eiei114/pi-monofold", execute }), /simulated release-create failure/);
  assert.equal(state.remoteTagExists, true);
  assert.equal(state.releaseExists, false);

  completeRelease({ version: "0.12.12", repository: "eiei114/pi-monofold", execute });
  assert.equal(state.releaseExists, true);
  assert.equal(state.publishAttempts, 1);
  assert.equal(calls.filter((call) => call[0] === "git" && call[1] === "push").length, 0);
  assert.equal(calls.filter((call) => call[0] === "gh" && call[1] === "release" && call[2] === "create").length, 2);
});

test("only queued, running, or successful publish dispatches satisfy the publish stage", () => {
  const sha = "release-commit";
  const tag = "v0.12.12";
  assert.equal(shouldDispatchPublish([], sha, tag), true);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: tag, head_sha: sha, status: "queued" }], sha, tag), false);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: tag, head_sha: sha, status: "in_progress" }], sha, tag), false);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: tag, head_sha: sha, status: "completed", conclusion: "success" }], sha, tag), false);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: tag, head_sha: sha, status: "completed", conclusion: "failure" }], sha, tag), true);
  assert.equal(shouldDispatchPublish([{ event: "push", head_branch: tag, head_sha: sha, status: "completed", conclusion: "success" }], sha, tag), true);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: "main", head_sha: sha, status: "completed", conclusion: "success" }], sha, tag), true);
  assert.equal(shouldDispatchPublish([{ event: "workflow_dispatch", head_branch: tag, head_sha: "another-commit", status: "completed", conclusion: "success" }], sha, tag), true);
});
