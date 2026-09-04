import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("tsconfig includes every publishable TypeScript module", () => {
  const pkgFiles = JSON.parse(readFileSync("package.json", "utf8")).files as string[];
  const publishedTs = pkgFiles.filter((name) => name.endsWith(".ts")).sort();
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  const include = (tsconfig.include ?? []) as string[];
  const explicitIncludes = new Set(include.filter((entry) => entry.endsWith(".ts")));

  it("lists every package.json files entry ending in .ts", () => {
    for (const file of publishedTs) {
      assert.ok(
        explicitIncludes.has(file),
        `tsconfig.json must include ${file} so npm run typecheck covers all publishable modules`,
      );
    }
  });
});
