import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function extractPackageContentsTree(readme: string): string {
  const match = readme.match(/## Package contents\s+```text\n([\s\S]*?)```/);
  assert.ok(match, "README must include a Package contents tree");
  return match[1];
}

describe("README package contents tree", () => {
  const readme = readFileSync("README.md", "utf8");
  const tree = extractPackageContentsTree(readme);
  const pkgFiles = JSON.parse(readFileSync("package.json", "utf8")).files as string[];
  const testFiles = readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"))
    .sort();

  it("lists every published TypeScript module from package.json files", () => {
    for (const file of pkgFiles.filter((name) => name.endsWith(".ts"))) {
      assert.match(tree, new RegExp(file.replaceAll(".", "\\.")), `missing ${file}`);
    }
  });

  it("lists every test file under tests/", () => {
    for (const file of testFiles) {
      assert.match(tree, new RegExp(file.replaceAll(".", "\\.")), `missing tests/${file}`);
    }
  });

  it("documents the CI version bump guard script", () => {
    assert.match(
      tree,
      /├── scripts\/\n│   └── check-version-bump\.mjs\b/,
    );
  });

  it("does not keep the stale single-test layout", () => {
    const listedTests = [...tree.matchAll(/(?:├──|└──) ([\w-]+\.test\.ts)/g)].map((m) => m[1]);
    assert.ok(listedTests.length > 1, "expected multiple test files in the tree");
    assert.ok(
      listedTests.includes("readme-version-pin.test.ts"),
      "expected newer regression tests to appear in the tree",
    );
  });
});
