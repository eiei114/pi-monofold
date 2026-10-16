export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const REQUIRED_SDK_VERSIONS = Object.freeze({
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
});

export function parseJsonLines(output) {
  const records = [];
  const invalidLines = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && typeof record === "object" && !Array.isArray(record)) records.push(record);
      else invalidLines.push(line);
    } catch {
      invalidLines.push(line);
    }
  }
  return { records, invalidLines };
}

function responseFor(records, id, command) {
  return records.find((record) => record.type === "response" && record.id === id && record.command === command);
}

function customOutputFor(records) {
  return records
    .filter((record) => record.type === "message_end" && record.message?.role === "custom")
    .map((record) => record.message)
    .find((message) => message.customType === "monofold-output");
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed ?? null), passed: passed === true };
}

export function extensionRegistered(records, id) {
  const response = responseFor(records, id, "get_commands");
  const commands = response?.data?.commands;
  const registered = response?.success === true && Array.isArray(commands)
    && commands.some((command) => command.name === "monofold:list" && command.source === "extension");
  return assertion(
    "extension_registered",
    "Actual Pi RPC get_commands lists monofold:list as a registered extension command",
    response ?? null,
    registered,
  );
}

export function featureResponse(records, id) {
  const response = responseFor(records, id, "prompt");
  const output = customOutputFor(records);
  const content = typeof output?.content === "string" ? output.content : "";
  const passed = response?.success === true && response.data?.disposition === "handled"
    && output?.customType === "monofold-output"
    && content.includes("Pi Monofold actual RPC smoke fixture")
    && output.details?.error === undefined;
  return assertion(
    "feature_response",
    "Actual Pi handles /monofold:read and returns the fixture README in a monofold-output message",
    { response: response ?? null, output: output ?? null },
    passed,
  );
}

export function handledError(records, id) {
  const response = responseFor(records, id, "prompt");
  const output = customOutputFor(records);
  const passed = response?.success === true && response.data?.disposition === "handled"
    && output?.customType === "monofold-output"
    && output.details?.error === "file mode requires path"
    && typeof output.content === "string" && output.content.includes("Error: file mode requires path");
  return assertion(
    "handled_error",
    "Actual Pi handles malformed /monofold:read input and returns its explicit missing-path error",
    { response: response ?? null, output: output ?? null },
    passed,
  );
}

export function cleanShutdown(exitCode, exited, signal, hasRuntimeErrors) {
  return assertion(
    "clean_shutdown",
    "The second actual Pi host exits naturally with code 0, no signal, and no unhandled or shutdown errors",
    { exit_code: exitCode, exited, signal, hasRuntimeErrors },
    exited === true && exitCode === 0 && signal === null && hasRuntimeErrors === false,
  );
}

export function nativeShellBoundary(exitCode, exited, output, expectedVersion) {
  return assertion(
    "native_shell_boundary",
    "The native host shell launches the locally pinned Pi CLI and prints exactly its 1.2.0 version",
    { exit_code: exitCode, exited, output: output.trim(), expectedVersion },
    exited === true && exitCode === 0 && output.trim() === expectedVersion,
  );
}
