import path from "node:path";

/** Converts MSYS/Git-Bash style paths into canonical absolute Windows paths. */
function repairMsysPath(value: string): string {
  let normalized = value.replace(/\\/g, "/");

  const unixDrive = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
  if (unixDrive) {
    normalized = `${unixDrive[1].toUpperCase()}:/${unixDrive[2]}`;
  }

  const mixedDrive = normalized.match(/^([a-zA-Z]):\/?(?:c|C)\/(.*)$/);
  if (mixedDrive) {
    normalized = `${mixedDrive[1].toUpperCase()}:/${mixedDrive[2]}`;
  }

  return normalized;
}

/** Normalizes local paths before workspace guard comparisons. */
export function normalizeGuardPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return path.resolve(repairMsysPath(trimmed));
}
