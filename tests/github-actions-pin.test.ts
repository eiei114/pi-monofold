import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const PINNED_ACTION_RE = /^uses: actions\/(checkout|setup-node)@[0-9a-f]{40}(?:\s+#\s+v[\d.]+)?$/;

describe("GitHub Actions workflow pins", () => {
  const workflowDir = ".github/workflows";

  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith(".yml"))) {
    it(`pins checkout and setup-node in ${file}`, () => {
      const lines = readFileSync(join(workflowDir, file), "utf8").split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("uses: actions/checkout@") && !trimmed.startsWith("uses: actions/setup-node@")) {
          continue;
        }

        assert.match(
          trimmed,
          PINNED_ACTION_RE,
          `${file} must pin ${trimmed} to a commit SHA (see ci.yml for the canonical pins)`,
        );
      }
    });
  }
});
