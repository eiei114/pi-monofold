import path from "node:path";
import { normalizeGuardPath } from "./path-normalize.js";

/** Returns true when `child` is inside or equal to `parent`. */
export function isPathInsideWorkspace(parent: string, child: string): boolean {
  const normalizedParent = normalizeGuardPath(parent);
  const normalizedChild = normalizeGuardPath(child);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Pre-sorts workspaces once so path guards prefer the longest matching root. */
export function buildPathLookupWorkspaces<T extends { resolvedPath: string }>(workspaces: T[]): T[] {
  return [...workspaces].sort((a, b) => b.resolvedPath.length - a.resolvedPath.length);
}

export function resolveAbsoluteTargetPath(root: string, targetPath: string): string {
  return normalizeGuardPath(path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath));
}

export function findWorkspaceForAbsolutePath<T extends { resolvedPath: string }>(
  pathLookupWorkspaces: readonly T[],
  absolutePath: string,
): T | undefined {
  const absolute = normalizeGuardPath(absolutePath);
  return pathLookupWorkspaces.find((workspace) => isPathInsideWorkspace(workspace.resolvedPath, absolute));
}
