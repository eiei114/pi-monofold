import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("README install pin examples", () => {
  const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
  const readme = readFileSync("README.md", "utf8");

  it("matches package.json for git and npm pin examples", () => {
    assert.match(
      readme,
      new RegExp(`pi install git:github\\.com/eiei114/pi-monofold@v${pkgVersion.replaceAll(".", "\\.")}`),
    );
    assert.match(
      readme,
      new RegExp(`pi install npm:pi-monofold@${pkgVersion.replaceAll(".", "\\.")}`),
    );
  });

  it("does not keep stale 0.3.2 pin examples", () => {
    assert.doesNotMatch(readme, /@v0\.3\.2/);
    assert.doesNotMatch(readme, /npm:pi-monofold@0\.3\.2/);
  });
});
