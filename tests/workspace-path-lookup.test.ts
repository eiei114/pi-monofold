import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPathLookupWorkspaces,
  findWorkspaceForAbsolutePath,
  isPathInsideWorkspace,
  resolveAbsoluteTargetPath,
} from "../workspace-path-lookup.js";

type LookupWorkspace = {
  id: string;
  resolvedPath: string;
};

describe("workspace path lookup", () => {
  it("prefers the longest matching workspace root", () => {
    const workspaces: LookupWorkspace[] = [
      { id: "parent", resolvedPath: "C:/repo" },
      { id: "child", resolvedPath: "C:/repo/packages/app" },
    ];
    const lookup = buildPathLookupWorkspaces(workspaces);
    const match = findWorkspaceForAbsolutePath(lookup, "C:/repo/packages/app/src/main.ts");
    assert.equal(match?.id, "child");
  });

  it("matches nested paths against parent workspaces", () => {
    const workspaces: LookupWorkspace[] = [{ id: "root", resolvedPath: "C:/repo" }];
    const lookup = buildPathLookupWorkspaces(workspaces);
    const match = findWorkspaceForAbsolutePath(lookup, "C:/repo/docs/readme.md");
    assert.equal(match?.id, "root");
  });

  it("returns undefined for paths outside configured workspaces", () => {
    const workspaces: LookupWorkspace[] = [{ id: "root", resolvedPath: "C:/repo" }];
    const lookup = buildPathLookupWorkspaces(workspaces);
    assert.equal(findWorkspaceForAbsolutePath(lookup, "C:/outside/file.ts"), undefined);
  });

  it("resolves relative targets against the control root", () => {
    const absolute = resolveAbsoluteTargetPath("C:/control", "docs/note.md");
    assert.equal(absolute.replace(/\\/g, "/"), "C:/control/docs/note.md");
  });

  it("reuses pre-sorted lookup order across repeated guard checks", () => {
    const workspaces: LookupWorkspace[] = Array.from({ length: 200 }, (_, index) => ({
      id: `ws-${index}`,
      resolvedPath: `C:/repo/ws-${String(index).padStart(3, "0")}`,
    }));
    workspaces.push({ id: "nested", resolvedPath: "C:/repo/ws-100/nested" });
    const lookup = buildPathLookupWorkspaces(workspaces);
    const target = "C:/repo/ws-100/nested/src/index.ts";

    const iterations = 20_000;
    const cachedStart = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      findWorkspaceForAbsolutePath(lookup, target);
    }
    const cachedMs = performance.now() - cachedStart;

    const uncachedStart = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      buildPathLookupWorkspaces(workspaces).find((workspace) =>
        isPathInsideWorkspace(workspace.resolvedPath, target),
      );
    }
    const uncachedMs = performance.now() - uncachedStart;

    assert.ok(
      cachedMs < uncachedMs * 0.75,
      `expected cached lookup (${cachedMs.toFixed(2)}ms) to beat per-call sort (${uncachedMs.toFixed(2)}ms)`,
    );
  });
});
