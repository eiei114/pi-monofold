import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cleanShutdown,
  extensionRegistered,
  featureResponse,
  handledError,
  nativeShellBoundary,
  parseJsonLines,
  REQUIRED_SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const registration = {
  type: "response",
  id: "commands",
  command: "get_commands",
  success: true,
  data: { commands: [{ name: "monofold:list", source: "extension" }] },
};
const handledPrompt = (id: string) => ({
  type: "response",
  id,
  command: "prompt",
  success: true,
  data: { disposition: "handled" },
});
const happyMessage = {
  type: "message_end",
  message: {
    role: "custom",
    customType: "monofold-output",
    content: "## monofold:read\n\nPi Monofold actual RPC smoke fixture",
    details: {},
  },
};
const errorMessage = {
  type: "message_end",
  message: {
    role: "custom",
    customType: "monofold-output",
    content: "Error: file mode requires path",
    details: { error: "file mode requires path" },
  },
};
const report = JSON.parse(readFileSync("docs/verification/pi-sdk-smoke.json", "utf8")) as {
  schema_version: number;
  verification_contract: string;
  sdk_versions: Record<string, string>;
  unhandled_errors: number;
  extension_load_errors: number;
  cases: Array<{
    name: string;
    command: string;
    exit_code: number;
    passed: boolean;
    evidence: string;
    assertions: Array<{ id: string; expected: string; observed: string; passed: boolean }>;
  }>;
};

describe("Pi SDK behavior-v2 smoke assertions", () => {
  it("declares the frozen SDK and behavior contract", () => {
    assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
    assert.deepEqual(REQUIRED_SDK_VERSIONS, {
      "@earendil-works/pi-agent-core": "1.1.0",
      "@earendil-works/pi-ai": "1.1.0",
      "@earendil-works/pi-coding-agent": "1.1.0",
      "@earendil-works/pi-tui": "1.1.0",
    });
  });

  it("accepts actual RPC registration and rejects missing or non-extension command records", () => {
    assert.equal(extensionRegistered([registration], "commands").passed, true);
    assert.equal(extensionRegistered([], "commands").passed, false);
    assert.equal(extensionRegistered([{ ...registration, success: false }], "commands").passed, false);
    assert.equal(extensionRegistered([{
      ...registration,
      data: { commands: [{ name: "monofold:list", source: "prompt" }] },
    }], "commands").passed, false);
  });

  it("requires both a handled RPC command and the actual feature output", () => {
    assert.equal(featureResponse([handledPrompt("happy"), happyMessage], "happy").passed, true);
    for (const missing of [[], [handledPrompt("happy")], [happyMessage]]) {
      assert.equal(featureResponse(missing, "happy").passed, false);
    }
    assert.equal(featureResponse([
      { ...handledPrompt("happy"), data: { disposition: "queued" } },
      happyMessage,
    ], "happy").passed, false);
  });

  it("requires a handled negative response and the explicit extension error details", () => {
    assert.equal(handledError([handledPrompt("error"), errorMessage], "error").passed, true);
    for (const missing of [[], [handledPrompt("error")], [errorMessage]]) {
      assert.equal(handledError(missing, "error").passed, false);
    }
    assert.equal(handledError([
      handledPrompt("error"),
      { ...errorMessage, message: { ...errorMessage.message, details: { error: "other" } } },
    ], "error").passed, false);
  });

  it("requires actual natural exit and rejects error/shutdown-only evidence", () => {
    assert.equal(cleanShutdown(0, true, null, false).passed, true);
    assert.equal(cleanShutdown(null, false, null, false).passed, false);
    assert.equal(cleanShutdown(0, true, null, true).passed, false);
    assert.equal(cleanShutdown(1, true, null, false).passed, false);
  });

  it("requires the native shell to return the exact SDK version, not a substring", () => {
    assert.equal(nativeShellBoundary(0, true, "1.1.0\r\n", "1.1.0").passed, true);
    for (const output of ["", "11.1.0", "1.1.0 with warning", "1.0.0"]) {
      assert.equal(nativeShellBoundary(0, true, output, "1.1.0").passed, false);
    }
    assert.equal(nativeShellBoundary(null, false, "1.1.0", "1.1.0").passed, false);
  });

  it("parses only JSON object records and reports malformed RPC output", () => {
    const parsed = parseJsonLines(`not-json\r\n${JSON.stringify(registration)}\nnull\n`);
    assert.deepEqual(parsed.records, [registration]);
    assert.deepEqual(parsed.invalidLines, ["not-json", "null"]);
  });

  it("keeps the committed behavior-v2 evidence complete and tied to actual command output", () => {
    assert.equal(report.schema_version, 1);
    assert.equal(report.verification_contract, VERIFICATION_CONTRACT);
    assert.deepEqual(report.sdk_versions, REQUIRED_SDK_VERSIONS);
    assert.equal(report.unhandled_errors, 0);
    assert.equal(report.extension_load_errors, 0);
    assert.deepEqual(report.cases.map((item) => item.name), [
      "extension_load", "happy_path", "error_path", "reload_cleanup", "host_shell",
    ]);
    const requiredIds = [
      ["extension_registered"],
      ["feature_response"],
      ["handled_error"],
      ["reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown"],
      ["native_shell_boundary"],
    ];
    for (const [index, item] of report.cases.entries()) {
      assert.equal(item.command, "npm run smoke:pi");
      assert.equal(item.exit_code, 0);
      assert.equal(item.passed, true);
      assert.ok(item.evidence);
      const evidence = JSON.parse(item.evidence) as { artifact: string; stdout: string; stderr: string; paths_normalized: boolean };
      assert.equal(evidence.artifact, `docs/verification/pi-sdk-smoke.json#cases.${item.name}.evidence`);
      assert.equal(evidence.paths_normalized, true);
      assert.equal(typeof evidence.stdout, "string");
      assert.equal(typeof evidence.stderr, "string");
      assert.doesNotMatch(`${evidence.stdout}${evidence.stderr}${item.assertions.map((a) => a.observed).join(" ")}`, /C:\\Users\\|AppData\\Local\\Temp\\/);
      assert.deepEqual(item.assertions.map((assertion) => assertion.id), requiredIds[index]);
      assert.ok(item.assertions.every((assertion) => assertion.passed && assertion.expected && assertion.observed));
    }
  });
});
