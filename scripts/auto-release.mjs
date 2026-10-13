import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  const output = {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
  if (output.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited ${output.status}: ${output.stderr.trim()}`);
  }
  return output;
}

function runRequired(execute, command, args) {
  const result = execute(command, args);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result;
}

export function isStableSemver(version) {
  return STABLE_SEMVER.test(version);
}

export function shouldDispatchPublish(runs, tagSha, tag) {
  if (!Array.isArray(runs)) throw new Error("Publish workflow runs must be an array");
  return !runs.some((workflowRun) => workflowRun.event === "workflow_dispatch"
    && workflowRun.head_branch === tag
    && workflowRun.head_sha === tagSha
    && (workflowRun.status === "queued"
      || workflowRun.status === "in_progress"
      || (workflowRun.status === "completed" && workflowRun.conclusion === "success")));
}

export function completeRelease({ version, repository, execute = run, log = () => {} }) {
  if (!isStableSemver(version)) {
    throw new Error(`Repository version is not a stable SemVer; refusing release: ${version}`);
  }
  if (!repository) throw new Error("GITHUB_REPOSITORY is required to complete a release");

  const tag = `v${version}`;
  const remoteTag = execute("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], { allowFailure: true });
  if (remoteTag.status === 2) {
    const localTag = runRequired(execute, "git", ["tag", "--list", tag]).stdout.trim();
    if (!localTag) runRequired(execute, "git", ["tag", tag]);
    runRequired(execute, "git", ["push", "origin", tag]);
    log(`Pushed missing tag ${tag}.`);
  } else if (remoteTag.status === 0) {
    log(`Tag ${tag} already exists; checking remaining release stages.`);
  } else {
    throw new Error(`Unable to check remote tag ${tag}: ${remoteTag.stderr.trim()}`);
  }

  const release = execute("gh", ["api", `repos/${repository}/releases/tags/${tag}`], { allowFailure: true });
  if (release.status === 0) {
    log(`Release ${tag} already exists.`);
  } else if (/HTTP 404\b/i.test(release.stderr)) {
    const previousTag = runRequired(execute, "git", ["tag", "--sort=-version:refname"])
      .stdout.split(/\r?\n/).map((item) => item.trim()).filter((item) => item && item !== tag)[0];
    const notes = previousTag
      ? `Released ${tag}.\n\n**Full Changelog**: https://github.com/${repository}/compare/${previousTag}...${tag}`
      : `Released ${tag}.`;
    runRequired(execute, "gh", ["release", "create", tag, "--title", tag, "--notes", notes]);
    log(`Created release ${tag}.`);
  } else {
    throw new Error(`Unable to check release ${tag}: ${release.stderr.trim()}`);
  }

  const tagSha = runRequired(execute, "git", ["rev-parse", "--verify", `${tag}^{commit}`]).stdout.trim();
  if (!tagSha) throw new Error(`Unable to resolve commit for ${tag}`);
  const response = runRequired(execute, "gh", [
    "api",
    `repos/${repository}/actions/workflows/publish.yml/runs`,
    "--method", "GET",
    "-f", "event=workflow_dispatch",
    "-f", `branch=${tag}`,
    "-f", `head_sha=${tagSha}`,
    "-f", "per_page=100",
  ]);
  let workflowRuns;
  try {
    workflowRuns = JSON.parse(response.stdout).workflow_runs;
  } catch (error) {
    throw new Error(`Unable to parse publish workflow run response: ${error.message}`);
  }
  if (!Array.isArray(workflowRuns)) throw new Error("Publish workflow run response did not contain workflow_runs");

  if (shouldDispatchPublish(workflowRuns, tagSha, tag)) {
    runRequired(execute, "gh", ["workflow", "run", "publish.yml", "--ref", tag, "-f", `ref=${tag}`]);
    log(`Dispatched publish workflow for ${tag}.`);
  } else {
    log(`Publish workflow for ${tag} is already queued, running, or successful.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    completeRelease({
      version: packageJson.version,
      repository: process.env.GITHUB_REPOSITORY,
      log: console.log,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
