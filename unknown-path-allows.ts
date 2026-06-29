import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeGuardPath } from "./path-normalize.js";

export const UNKNOWN_PATH_ALLOWS_RELATIVE_PATH = path.join(".pi", "monofold-unknown-path-allows.json");

type UnknownPathAllowsFile = {
  version: 1;
  paths: string[];
};

function assertAllowsFile(value: unknown): asserts value is UnknownPathAllowsFile {
  if (typeof value !== "object" || value === null) throw new Error("unknown path allows file must be an object");
  if (!("version" in value) || (value as { version?: unknown }).version !== 1) {
    throw new Error("unknown path allows file requires version: 1");
  }
  if (!("paths" in value) || !Array.isArray((value as { paths?: unknown }).paths) || !(value as { paths: unknown[] }).paths.every((item) => typeof item === "string")) {
    throw new Error("unknown path allows file requires string[] paths");
  }
}

export function resolveUnknownPathAllowsPath(root: string): string {
  return path.join(normalizeGuardPath(root), UNKNOWN_PATH_ALLOWS_RELATIVE_PATH);
}

export async function loadUnknownPathAllows(root: string): Promise<Set<string>> {
  const filePath = resolveUnknownPathAllowsPath(root);
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    assertAllowsFile(parsed);
    return new Set(parsed.paths.map((item) => normalizeGuardPath(item)));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") return new Set<string>();
    throw error;
  }
}

async function saveUnknownPathAllows(root: string, paths: Set<string>): Promise<void> {
  const filePath = resolveUnknownPathAllowsPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload: UnknownPathAllowsFile = {
    version: 1,
    paths: [...paths].map((item) => normalizeGuardPath(item)).sort(),
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function rememberUnknownPathAllow(root: string, targetPath: string): Promise<void> {
  const paths = await loadUnknownPathAllows(root);
  paths.add(normalizeGuardPath(targetPath));
  await saveUnknownPathAllows(root, paths);
}

export async function clearUnknownPathAllows(root: string): Promise<number> {
  const filePath = resolveUnknownPathAllowsPath(root);
  const paths = await loadUnknownPathAllows(root);
  try {
    await rm(filePath, { force: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "ENOENT") throw error;
  }
  return paths.size;
}
