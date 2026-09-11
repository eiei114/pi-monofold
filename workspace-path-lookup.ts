import path from "node:path";
import { normalizeGuardPath } from "./path-normalize.js";

type PathImpl = Pick<typeof path, "isAbsolute" | "relative" | "resolve" | "sep">;

/** Detects Windows drive-letter (`C:/...`) or UNC (`\\...`) syntax on any host. */
function isWindowsStylePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/** Selects the path implementation matching the given path syntax. */
function selectPathImpl(...values: string[]): PathImpl {
  return values.some(isWindowsStylePath) ? path.win32 : path;
}

/** Returns true when `child` is inside or equal to `parent`. */
export function isPathInsideWorkspace(parent: string, child: string): boolean {
  const impl = selectPathImpl(parent, child);
  const normalizedParent = normalizeGuardPath(parent, impl);
  const normalizedChild = normalizeGuardPath(child, impl);
  const relative = impl.relative(normalizedParent, normalizedChild);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${impl.sep}`) && !impl.isAbsolute(relative))
  );
}

/** Pre-sorts workspaces once so path guards prefer the longest matching root. */
export function buildPathLookupWorkspaces<T extends { resolvedPath: string }>(workspaces: T[]): T[] {
  return [...workspaces].sort((a, b) => b.resolvedPath.length - a.resolvedPath.length);
}

export function resolveAbsoluteTargetPath(root: string, targetPath: string): string {
  const impl = selectPathImpl(root, targetPath);
  return normalizeGuardPath(impl.isAbsolute(targetPath) ? targetPath : impl.resolve(root, targetPath), impl);
}

export function findWorkspaceForAbsolutePath<T extends { resolvedPath: string }>(
  pathLookupWorkspaces: readonly T[],
  absolutePath: string,
): T | undefined {
  const impl = selectPathImpl(absolutePath, ...pathLookupWorkspaces.map((workspace) => workspace.resolvedPath));
  const absolute = normalizeGuardPath(absolutePath, impl);
  return pathLookupWorkspaces.find((workspace) => isPathInsideWorkspace(workspace.resolvedPath, absolute));
}
