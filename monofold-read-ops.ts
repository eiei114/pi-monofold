import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { buildFileReadResponse, type FileReadOptions } from "./file-read-preview.js";
import {
  capSearchOutput,
  capTreeLines,
  resolveSearchCaps,
  resolveTreeCaps,
  type SearchCapResult,
  type TreeCapResult,
} from "./read-caps.js";

export type ShallowTreeBudget = {
  remaining: number;
  truncated: boolean;
};

export type MonofoldFileReadResult = {
  text: string;
  details: ReturnType<typeof buildFileReadResponse>["details"];
};

export type RunCommandFn = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    timeout?: number;
    signal?: AbortSignal;
    allowExitCodes?: Array<number | string>;
  },
) => Promise<{ stdout: string; stderr: string; exitCode: number | string | null | undefined }>;

/** Maximum depth allowed for {@link buildMonofoldTree} and shallow tree walks. */
export const MAX_TREE_DEPTH = 5;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export async function shallowTree(
  root: string,
  depth: number,
  prefix = "",
  budget?: ShallowTreeBudget,
): Promise<string[]> {
  if (depth < 0) return [];
  if (budget && budget.remaining <= 0) {
    budget.truncated = true;
    return [];
  }
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries.filter((e) => e.name !== ".git" && e.name !== "node_modules")) {
    if (budget && budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    const rel = normalizeSlashes(path.join(prefix, entry.name));
    lines.push(entry.isDirectory() ? `${rel}/` : rel);
    if (budget) budget.remaining -= 1;
    if (entry.isDirectory() && depth > 0) {
      lines.push(...(await shallowTree(root, depth - 1, rel, budget)));
    }
  }
  return lines;
}

export async function readMonofoldFile(
  absolutePath: string,
  relativePath: string,
  options: FileReadOptions = {},
): Promise<MonofoldFileReadResult> {
  const [content, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
  const preview = buildFileReadResponse(
    content,
    options,
    { size: fileStat.size, mtime: fileStat.mtime },
    { relativePath },
  );
  return { text: preview.text, details: preview.details };
}

/**
 * Build a bounded directory tree for a workspace root.
 *
 * @param root - Absolute path to the workspace root.
 * @param depth - Requested traversal depth; clamped to [0, {@link MAX_TREE_DEPTH}].
 * @param options - Optional caps such as `maxEntries`.
 */
export async function buildMonofoldTree(
  root: string,
  depth: number,
  options?: { maxEntries?: number },
): Promise<TreeCapResult> {
  const treeDepth = Math.max(0, Math.min(MAX_TREE_DEPTH, depth));
  const treeCaps = resolveTreeCaps({ maxEntries: options?.maxEntries });
  const treeBudget: ShallowTreeBudget = { remaining: treeCaps.maxEntries, truncated: false };
  const rawLines = await shallowTree(root, treeDepth, "", treeBudget);
  return capTreeLines(rawLines, treeCaps, treeBudget.truncated);
}

export async function runMonofoldSearch(
  runCommand: RunCommandFn,
  cwd: string,
  query: string,
  searchPath = ".",
  options?: { signal?: AbortSignal; maxMatches?: number; maxChars?: number },
): Promise<SearchCapResult & { rawOutput: string }> {
  const searchCaps = resolveSearchCaps({ maxMatches: options?.maxMatches, maxChars: options?.maxChars });
  const result = await runCommand(
    "rg",
    ["--line-number", "--hidden", "--glob", "!.git/**", "--glob", "!.github/**", query, searchPath],
    {
      cwd,
      signal: options?.signal,
      timeout: 10000,
      allowExitCodes: [0, 1],
    },
  );
  const rawOutput =
    result.stdout.trim() || (result.exitCode !== 0 && result.exitCode !== 1 ? result.stderr.trim() : "");
  const capped = capSearchOutput(rawOutput, searchCaps);
  return { ...capped, rawOutput };
}
