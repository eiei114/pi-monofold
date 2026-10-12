function triggerBlock(content) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "on:");
  if (start < 0) throw new Error("Expected explicit multiline on: trigger mapping");
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith(" ") && !line.startsWith("#")) break;
    if (line.trim() && !line.trimStart().startsWith("#")) block.push(line);
  }
  return block;
}

export function assertReleaseTriggerContract(release, publish) {
  const releaseEvents = triggerBlock(release);
  if (releaseEvents.join("\n") !== "  workflow_dispatch:") {
    throw new Error("Release workflow must be explicitly workflow_dispatch only");
  }
  if (!release.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'")) {
    throw new Error("Manual release must be restricted to workflow_dispatch from main");
  }

  const publishEvents = triggerBlock(publish);
  const eventNames = publishEvents.filter((line) => /^ {2}\S/.test(line)).map((line) => line.trim());
  if (JSON.stringify(eventNames) !== JSON.stringify(["push:", "release:", "workflow_dispatch:"])) {
    throw new Error("Publish may only use version tags, published releases, or explicit dispatch");
  }
  const push = publishEvents.slice(1, publishEvents.findIndex((line) => line === "  release:"));
  if (JSON.stringify(push) !== JSON.stringify(["    tags:", "      - 'v*.*.*'"])) {
    throw new Error("Publish push trigger must contain only version tags, never main branches or paths");
  }
}
