import path from "node:path";

/** Converts MSYS/Git-Bash style paths into canonical absolute Windows paths. */
function repairMsysPath(value: string): string {
  let normalized = value.replace(/\\/g, "/");

  const unixDrive = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
  if (unixDrive) {
    normalized = `${unixDrive[1].toUpperCase()}:/${unixDrive[2]}`;
  }

  const mixedDrive = normalized.match(/^([a-zA-Z]):\/?([a-zA-Z])\/(.*)$/);
  if (mixedDrive && mixedDrive[1].toLowerCase() === mixedDrive[2].toLowerCase()) {
    normalized = `${mixedDrive[1].toUpperCase()}:/${mixedDrive[3]}`;
  }

  return normalized;
}

/** Normalizes local paths before workspace guard comparisons. */
export function normalizeGuardPath(input: string, impl: Pick<typeof path, "resolve"> = path): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return impl.resolve(repairMsysPath(trimmed));
}
