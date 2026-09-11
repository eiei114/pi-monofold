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

type WorkspaceMatchCase = {
  label: string;
  workspaces: LookupWorkspace[];
  target: string;
  expectedId: string | undefined;
};

type PathInsideCase = {
  label: string;
  parent: string;
  child: string;
  expected: boolean;
};

const workspaceMatchCases: WorkspaceMatchCase[] = [
  {
    label: "prefers the longest matching workspace root",
    workspaces: [
      { id: "parent", resolvedPath: "C:/repo" },
      { id: "child", resolvedPath: "C:/repo/packages/app" },
    ],
    target: "C:/repo/packages/app/src/main.ts",
    expectedId: "child",
  },
  {
    label: "matches nested paths against parent workspaces",
    workspaces: [{ id: "root", resolvedPath: "C:/repo" }],
    target: "C:/repo/docs/readme.md",
    expectedId: "root",
  },
  {
    label: "returns undefined for paths outside configured workspaces",
    workspaces: [{ id: "root", resolvedPath: "C:/repo" }],
    target: "C:/outside/file.ts",
    expectedId: undefined,
  },
  {
    label: "matches posix workspace roots on linux hosts",
    workspaces: [
      { id: "parent", resolvedPath: "/repo" },
      { id: "child", resolvedPath: "/repo/packages/app" },
    ],
    target: "/repo/packages/app/src/main.ts",
    expectedId: "child",
  },
  {
    label: "matches windows-style roots even when host path impl is posix",
    workspaces: [{ id: "win-root", resolvedPath: "D:/work/monorepo" }],
    target: "D:/work/monorepo/apps/web/page.tsx",
    expectedId: "win-root",
  },
];

const pathInsideCases: PathInsideCase[] = [
  {
    label: "treats dot-dot-prefixed cache dirs as workspace children",
    parent: "/repo",
    child: "/repo/..cache",
    expected: true,
  },
  {
    label: "rejects traversal that escapes the workspace root",
    parent: "/repo",
    child: "/repo/../outside",
    expected: false,
  },
  {
    label: "accepts exact workspace root matches",
    parent: "/repo",
    child: "/repo",
    expected: true,
  },
  {
    label: "accepts nested posix children",
    parent: "/repo",
    child: "/repo/docs/readme.md",
    expected: true,
  },
  {
    label: "accepts nested windows children",
    parent: "C:/repo",
    child: "C:/repo/packages/app/main.ts",
    expected: true,
  },
  {
    label: "rejects sibling windows paths",
    parent: "C:/repo/a",
    child: "C:/repo/b/file.ts",
    expected: false,
  },
];

describe("workspace path lookup", () => {
  for (const testCase of workspaceMatchCases) {
    it(testCase.label, () => {
      const lookup = buildPathLookupWorkspaces(testCase.workspaces);
      const match = findWorkspaceForAbsolutePath(lookup, testCase.target);
      assert.equal(match?.id, testCase.expectedId);
    });
  }

  for (const testCase of pathInsideCases) {
    it(testCase.label, () => {
      assert.equal(isPathInsideWorkspace(testCase.parent, testCase.child), testCase.expected);
    });
  }

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
