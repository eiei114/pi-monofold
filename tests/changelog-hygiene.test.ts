import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function parseReleasedVersions(changelog: string): string[] {
  const versions: string[] = [];
  for (const m of changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)) {
    versions.push(m[1]);
  }
  return versions;
}

function extractUnreleasedSection(changelog: string): string {
  const match = changelog.match(/^## Unreleased\s*\n([\s\S]*?)(?=^## \[)/m);
  return match ? match[1].trim() : "";
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function bumpTargetPattern(version: string): RegExp {
  const escaped = version.replaceAll(".", "\\.");
  return new RegExp(`Bump package version to\\s+${escaped}`);
}

describe("CHANGELOG hygiene", () => {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
  const released = parseReleasedVersions(changelog);
  const unreleased = extractUnreleasedSection(changelog);

  it("does not leave planned version bumps in Unreleased once that version shipped", () => {
    for (const version of released) {
      assert.doesNotMatch(
        unreleased,
        bumpTargetPattern(version),
        `Unreleased still mentions bump to already-released ${version}`,
      );
    }
  });

  it("does not plan a version bump in Unreleased that is already at or below package.json", () => {
    const bumps = [...unreleased.matchAll(/Bump package version to\s+(\d+\.\d+\.\d+)/g)];
    for (const [, target] of bumps) {
      assert.ok(
        compareSemver(target, pkgVersion) > 0,
        `Unreleased plans bump to ${target} but package is already ${pkgVersion}`,
      );
    }
  });

  it("lists released versions without duplicate sections", () => {
    const seen = new Set<string>();
    for (const version of released) {
      assert.ok(!seen.has(version), `duplicate changelog section for ${version}`);
      seen.add(version);
    }
  });
});
