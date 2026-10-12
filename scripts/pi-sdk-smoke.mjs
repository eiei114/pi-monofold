import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import {
  cleanShutdown,
  extensionRegistered,
  featureResponse,
  handledError,
  nativeShellBoundary,
  parseJsonLines,
  REQUIRED_SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const packageJson = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(Object.keys(REQUIRED_SDK_VERSIONS).map((name) => {
  const version = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (packageJson.devDependencies?.[name] !== REQUIRED_SDK_VERSIONS[name] || version !== REQUIRED_SDK_VERSIONS[name]) {
    throw new Error(`Pi smoke requires exact ${name}@${REQUIRED_SDK_VERSIONS[name]} dev/install pins; found ${packageJson.devDependencies?.[name]} / ${version}`);
  }
  return [name, version];
}));

const piPackageRoot = resolve(root, "node_modules/@earendil-works/pi-coding-agent");
const piPackage = readJson(resolve(piPackageRoot, "package.json"));
const piBin = typeof piPackage.bin === "string" ? piPackage.bin : piPackage.bin?.pi;
if (!piBin) throw new Error("Installed Pi coding-agent package does not declare its local pi executable");
const piCli = resolve(piPackageRoot, piBin);

const tempRoot = mkdtempSync(join(tmpdir(), "pi-monofold-sdk-smoke-"));
const agentDir = join(tempRoot, "isolated-agent-settings");
const controlRoot = join(tempRoot, "control");
const workspaceRoot = join(controlRoot, "workspace");
const fixtureText = "Pi Monofold actual RPC smoke fixture\nSecond line verifies the real read feature.\n";
mkdirSync(join(controlRoot, ".pi"), { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
writeFileSync(join(workspaceRoot, "README.md"), fixtureText, "utf8");
const fixedMtime = new Date("2020-01-02T03:04:05.000Z");
utimesSync(join(workspaceRoot, "README.md"), fixedMtime, fixedMtime);
writeFileSync(join(controlRoot, ".pi", "monofold.yaml"), [
  "version: 1",
  "workspaces:",
  "  - name: Smoke Workspace",
  "    path: ./workspace",
  "    tags: [smoke]",
  "    capabilities: [read, writeDocs]",
  "    routes:",
  "      default: Notes",
  "",
].join("\n"), "utf8");
mkdirSync(join(workspaceRoot, "Notes"), { recursive: true });

const env = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_MONOFOLD_RUNTIME: "pi-sdk-smoke",
  PI_OFFLINE: "1",
};
const hostArgs = [
  piCli,
  "--offline",
  "--no-session",
  "--no-builtin-tools",
  "--no-extensions",
  "--no-skills",
  "--no-context-files",
  "--no-prompt-templates",
  "--no-mcp",
  "-e", root,
  "--mode", "rpc",
];
const DEADLINE_MS = 15_000;

function wakeWaiters(state) {
  for (const check of [...state.waiters]) check();
}

function waitFor(state, predicate, deadline) {
  const existing = predicate();
  if (existing) return Promise.resolve(existing);
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const error = new Error("Pi RPC probe deadline exceeded");
    error.code = "PROBE_DEADLINE";
    return Promise.reject(error);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      state.waiters.delete(check);
      callback(value);
    };
    const check = () => {
      const result = predicate();
      if (result) finish(resolvePromise, result);
      else if (state.closed) finish(rejectPromise, new Error("Pi process exited before the expected RPC observation"));
      else if (state.spawnError) finish(rejectPromise, state.spawnError);
      else if (state.stdinError) finish(rejectPromise, state.stdinError);
    };
    const timer = setTimeout(() => {
      const error = new Error("Pi RPC probe deadline exceeded");
      error.code = "PROBE_DEADLINE";
      finish(rejectPromise, error);
    }, remaining);
    state.waiters.add(check);
    check();
  });
}

function runRpc(commands) {
  const child = spawn(process.execPath, hostArgs, {
    cwd: controlRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const state = {
    child,
    stdout: "",
    stderr: "",
    pendingLine: "",
    records: [],
    invalidLines: [],
    waiters: new Set(),
    closed: null,
    spawnError: null,
    stdinError: null,
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
    state.pendingLine += chunk;
    let newline;
    while ((newline = state.pendingLine.indexOf("\n")) >= 0) {
      let line = state.pendingLine.slice(0, newline);
      state.pendingLine = state.pendingLine.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      const parsed = parseJsonLines(line);
      state.records.push(...parsed.records);
      state.invalidLines.push(...parsed.invalidLines);
      wakeWaiters(state);
    }
  });
  child.stderr.on("data", (chunk) => { state.stderr += chunk; });
  child.stdin.on("error", (error) => { state.stdinError = error; wakeWaiters(state); });
  child.on("error", (error) => { state.spawnError = error; wakeWaiters(state); });
  child.on("close", (code, signal) => {
    if (state.pendingLine.trim()) state.invalidLines.push(state.pendingLine);
    state.pendingLine = "";
    state.closed = { code, signal };
    wakeWaiters(state);
  });

  const deadline = Date.now() + DEADLINE_MS;
  let timedOut = false;
  let probeError = null;
  return (async () => {
    try {
      for (const command of commands) {
        if (state.closed) throw new Error("Pi process exited before the next RPC command");
        await new Promise((resolvePromise, rejectPromise) => {
          child.stdin.write(`${JSON.stringify(command)}\n`, (error) => error ? rejectPromise(error) : resolvePromise());
        });
        await waitFor(state, () => state.records.find((record) => record.type === "response"
          && record.id === command.id && record.command === command.type), deadline);
        if (command.type === "prompt") {
          await waitFor(state, () => state.records.find((record) => record.type === "message_end"
            && record.message?.role === "custom" && record.message.customType === "monofold-output"), deadline);
        }
      }
      child.stdin.end();
      await waitFor(state, () => state.closed, deadline);
    } catch (error) {
      probeError = error;
      timedOut = error.code === "PROBE_DEADLINE";
      if (!state.closed) {
        child.kill("SIGTERM");
        const cleanupDeadline = Date.now() + 1000;
        try {
          await waitFor(state, () => state.closed, cleanupDeadline);
        } catch {
          // The probe remains failed; request hard termination of this owned child.
          child.kill("SIGKILL");
        }
      }
    }

    const stdout = state.stdout;
    const stderr = state.stderr;
    const fullOutput = `${stdout}${stderr}`;
    const runtimeErrorPattern = /UnhandledPromiseRejection|uncaught exception|shutdown error|Error during shutdown/i;
    const extensionErrorCount = state.records.filter((record) => record.type === "extension_error").length;
    const unhandledErrorCount = extensionErrorCount + (fullOutput.match(runtimeErrorPattern) ?? []).length;
    const extensionLoadErrorPattern = /Failed to load extension|Error loading extension|Could not load extension/i;
    const extensionLoadErrorCount = (fullOutput.match(extensionLoadErrorPattern) ?? []).length;
    return {
      stdout,
      stderr,
      records: state.records,
      invalidLines: state.invalidLines,
      exitCode: state.closed?.code ?? null,
      signal: state.closed?.signal ?? null,
      exited: state.closed !== null,
      timedOut,
      spawnError: state.spawnError ? `${state.spawnError.code ?? "error"}: ${state.spawnError.message}` : null,
      probeError: probeError ? `${probeError.code ?? "error"}: ${probeError.message}` : null,
      unhandledErrorCount,
      extensionLoadErrorCount,
      hasRuntimeErrors: unhandledErrorCount > 0 || extensionLoadErrorCount > 0 || state.invalidLines.length > 0,
    };
  })();
}

function isRegistered(probe, id) {
  return extensionRegistered(probe.records, id).passed;
}

function caseRecord(name, probe, assertions) {
  const passed = probe.exited && probe.exitCode === 0 && probe.signal === null && !probe.timedOut
    && !probe.hasRuntimeErrors && assertions.every((item) => item.passed);
  const normalizeEvidence = (text) => {
    let normalized = text;
    for (const [path, replacement] of [[tempRoot, "<smoke-root>"], [root, "<repo-root>"]]) {
      normalized = normalized
        .replaceAll(path, replacement)
        .replaceAll(JSON.stringify(path).slice(1, -1), replacement);
    }
    return normalized
      .replace(/("id"\s*:\s*")[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}("?)/gi, "$1<runtime-id>$2")
      .replace(/("timestamp"\s*:\s*)\d+/g, "$1\"<runtime-timestamp>\"");
  };
  const normalizedAssertions = assertions.map((item) => ({ ...item, observed: normalizeEvidence(item.observed) }));
  const evidence = JSON.stringify({
    artifact: `docs/verification/pi-sdk-smoke.json#cases.${name}.evidence`,
    paths_normalized: true,
    exit_code: probe.exitCode,
    exited: probe.exited,
    signal: probe.signal,
    timed_out: probe.timedOut,
    spawn_error: probe.spawnError,
    probe_error: probe.probeError,
    stdout: normalizeEvidence(probe.stdout),
    stderr: normalizeEvidence(probe.stderr),
  });
  return {
    name,
    command: "npm run smoke:pi",
    exit_code: probe.exitCode ?? -1,
    passed,
    evidence,
    assertions: normalizedAssertions,
  };
}

function requestCommands(id) {
  return { id, type: "get_commands" };
}

function requestPrompt(id, message) {
  return { id, type: "prompt", message };
}

function runHostShell() {
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    const command = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
    return spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: controlRoot, env, encoding: "utf8", timeout: DEADLINE_MS, maxBuffer: 1024 * 1024, windowsHide: true,
    });
  }
  return spawnSync("/bin/sh", ["-c", '"$1" "$2" --no-extensions --version', "pi-sdk-smoke", process.execPath, piCli], {
    cwd: controlRoot, env, encoding: "utf8", timeout: DEADLINE_MS, maxBuffer: 1024 * 1024, windowsHide: true,
  });
}

try {
  const loadProbe = await runRpc([requestCommands("commands-load")]);
  const happyProbe = await runRpc([
    requestCommands("commands-happy"),
    requestPrompt("happy", "/monofold:read file README.md"),
  ]);
  const errorProbe = await runRpc([
    requestCommands("commands-error"),
    requestPrompt("error", "/monofold:read file"),
  ]);
  // A fresh second Pi process proves re-registration, feature handling, and actual disposal.
  const reloadProbe = await runRpc([
    requestCommands("commands-reload"),
    requestPrompt("reload", "/monofold:read file README.md"),
  ]);
  const shellResult = runHostShell();
  const shellOutput = `${shellResult.stdout ?? ""}${shellResult.stderr ?? ""}`;
  const shellExited = shellResult.status !== null;
  const shellExitCode = shellResult.status;

  const probes = [loadProbe, happyProbe, errorProbe, reloadProbe];
  const loadAssertion = extensionRegistered(loadProbe.records, "commands-load");
  const featureAssertion = featureResponse(happyProbe.records, "happy");
  const errorAssertion = handledError(errorProbe.records, "error");
  const reloadAssertions = [
    {
      ...extensionRegistered(reloadProbe.records, "commands-reload"),
      id: "reloaded_extension_registered",
      expected: "The second isolated Pi process reports monofold:list as a registered extension command",
    },
    {
      ...featureResponse(reloadProbe.records, "reload"),
      id: "reloaded_feature_response",
      expected: "The second isolated Pi process handles /monofold:read and returns the fixture README",
    },
    cleanShutdown(
      reloadProbe.exitCode,
      reloadProbe.exited,
      reloadProbe.signal,
      reloadProbe.hasRuntimeErrors,
    ),
  ];
  const shellAssertion = nativeShellBoundary(
    shellExitCode,
    shellExited,
    shellOutput,
    sdkVersions["@earendil-works/pi-coding-agent"],
  );

  const cases = [
    caseRecord("extension_load", loadProbe, [loadAssertion]),
    caseRecord("happy_path", happyProbe, [featureAssertion]),
    caseRecord("error_path", errorProbe, [errorAssertion]),
    caseRecord("reload_cleanup", reloadProbe, reloadAssertions),
    caseRecord("host_shell", {
      stdout: shellResult.stdout ?? "",
      stderr: shellResult.stderr ?? "",
      exitCode: shellExitCode,
      signal: shellResult.signal ?? null,
      exited: shellExited,
      timedOut: shellResult.error?.code === "ETIMEDOUT",
      spawnError: shellResult.error ? `${shellResult.error.code ?? "error"}: ${shellResult.error.message}` : null,
      hasRuntimeErrors: false,
    }, [shellAssertion]),
  ];
  const extension_load_errors = probes.filter((probe, index) => {
    const commandId = ["commands-load", "commands-happy", "commands-error", "commands-reload"][index];
    return probe.extensionLoadErrorCount > 0 || !isRegistered(probe, commandId);
  }).length;
  const unhandled_errors = probes.reduce((total, probe) => total + probe.unhandledErrorCount, 0);
  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; real Pi RPC extension commands only, with isolated offline settings",
    unhandled_errors,
    extension_load_errors,
    cases,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    verification_contract: VERIFICATION_CONTRACT,
    platform: process.platform,
    cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
  }));
  if (cases.some((item) => !item.passed) || unhandled_errors !== 0 || extension_load_errors !== 0) process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
