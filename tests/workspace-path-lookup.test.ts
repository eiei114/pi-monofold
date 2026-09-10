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

  it("treats dot-dot-prefixed names as workspace children", () => {
    assert.equal(isPathInsideWorkspace("/repo", "/repo/..cache"), true);
    assert.equal(isPathInsideWorkspace("/repo", "/repo/../outside"), false);
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
    const inputOrder = workspaces.map((workspace) => workspace.id);
    const lookup = buildPathLookupWorkspaces(workspaces);

    // Deterministic caching invariant: one pre-sort, longest root first.
    assert.notEqual(lookup, workspaces);
    assert.deepEqual(
      workspaces.map((workspace) => workspace.id),
      inputOrder,
    );
    for (let index = 1; index < lookup.length; index += 1) {
      assert.ok(lookup[index - 1].resolvedPath.length >= lookup[index].resolvedPath.length);
    }
    assert.equal(lookup[0].id, "nested");

    const target = "C:/repo/ws-100/nested/src/index.ts";
    for (let index = 0; index < 100; index += 1) {
      assert.equal(findWorkspaceForAbsolutePath(lookup, target)?.id, "nested");
    }
  });
});
