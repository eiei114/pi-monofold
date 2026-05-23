import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

type CapabilityTag = "read" | "writeDocs" | "editCode" | "runCommands" | "gitCommit" | "gitPush";
type RouteType = "default" | "prd" | "design" | "progress" | "issue" | "research" | "decision";

type RouteConfig = {
  path: string;
  filenameTemplate?: string;
  metadata?: Record<string, unknown>;
};

type WorkspaceConfig = {
  name?: string;
  path: string;
  tags: string[];
  capabilities: CapabilityTag[];
  contextFiles?: string[];
  routes?: Partial<Record<RouteType, string | RouteConfig>>;
};

type MultiWorkspaceConfig = {
  version: 1;
  defaults?: {
    contextFiles?: string[];
    filenameTemplate?: string;
    metadata?: Record<string, unknown>;
  };
  workspaces: WorkspaceConfig[];
};

type ResolvedWorkspace = WorkspaceConfig & {
  index: number;
  resolvedPath: string;
  normalizedRoutes: Partial<Record<RouteType, RouteConfig>>;
  effectiveContextFiles: string[];
};

type LoadedConfig = {
  configPath: string;
  root: string;
  raw: MultiWorkspaceConfig;
  workspaces: ResolvedWorkspace[];
};

type TargetInput = {
  targetTags?: string[];
  workspaceName?: string;
  workspaceIndex?: number;
  requireCapabilities?: CapabilityTag[];
};

type ParsedCommandArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | string | null | undefined;
};

const CONFIG_RELATIVE_PATH = path.join(".pi", "monofold.yml");
const ROUTE_TYPES: RouteType[] = ["default", "prd", "design", "progress", "issue", "research", "decision"];
const CAPABILITIES: CapabilityTag[] = ["read", "writeDocs", "editCode", "runCommands", "gitCommit", "gitPush"];
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".rs",
  ".go",
  ".py",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".css",
  ".scss",
  ".html",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertWorkspaceInternalRelative(label: string, value: string): void {
  if (path.isAbsolute(value) || normalizeSlashes(value).split("/").includes("..")) {
    throw new Error(`${label} must be a workspace-internal relative path: ${value}`);
  }
}

function asStringArray(label: string, value: unknown, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function asCapabilityArray(value: unknown): CapabilityTag[] {
  const items = asStringArray("capabilities", value);
  for (const item of items) {
    if (!CAPABILITIES.includes(item as CapabilityTag)) {
      throw new Error(`Unknown capability: ${item}`);
    }
  }
  return items as CapabilityTag[];
}

function normalizeRoute(routeType: string, value: unknown): RouteConfig {
  if (!ROUTE_TYPES.includes(routeType as RouteType)) {
    throw new Error(`Unknown route type: ${routeType}`);
  }
  if (typeof value === "string") {
    assertWorkspaceInternalRelative(`routes.${routeType}`, value);
    return { path: value };
  }
  if (!isRecord(value) || typeof value.path !== "string") {
    throw new Error(`routes.${routeType} must be a string path or object with path`);
  }
  assertWorkspaceInternalRelative(`routes.${routeType}.path`, value.path);
  if (value.filenameTemplate !== undefined && typeof value.filenameTemplate !== "string") {
    throw new Error(`routes.${routeType}.filenameTemplate must be a string`);
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    throw new Error(`routes.${routeType}.metadata must be an object`);
  }
  return {
    path: value.path,
    filenameTemplate: value.filenameTemplate,
    metadata: value.metadata as Record<string, unknown> | undefined,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number; signal?: AbortSignal; allowExitCodes?: Array<number | string> } = {},
): Promise<CommandResult> {
  const allowExitCodes = new Set<number | string>(options.allowExitCodes ?? [0]);
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 10000,
        signal: options.signal,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, stdout, stderr) => {
        const exitCode = typeof error === "object" && error && "code" in error ? (error as { code?: number | string }).code : 0;
        const result = { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode };
        if (!error || allowExitCodes.has(exitCode ?? 0)) {
          resolve(result);
          return;
        }
        reject(new Error(`${command} ${args.join(" ")} failed (${String(exitCode)}): ${result.stderr || result.stdout}`));
      },
    );
  });
}

async function loadConfig(cwd: string): Promise<LoadedConfig> {
  const configPath = path.join(cwd, CONFIG_RELATIVE_PATH);
  const text = await readFile(configPath, "utf8");
  const parsed = YAML.parse(text, { uniqueKeys: true }) as unknown;
  if (!isRecord(parsed)) throw new Error("monofold config must be a YAML object");
  if (parsed.version !== 1) throw new Error("monofold config requires version: 1");
  if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) {
    throw new Error("monofold config requires non-empty workspaces array");
  }

  const defaults = isRecord(parsed.defaults) ? parsed.defaults : undefined;
  const defaultContextFiles = defaults ? asStringArray("defaults.contextFiles", defaults.contextFiles, false) : [];
  const defaultFilenameTemplate = typeof defaults?.filenameTemplate === "string" ? defaults.filenameTemplate : undefined;
  const defaultMetadata = isRecord(defaults?.metadata) ? (defaults.metadata as Record<string, unknown>) : undefined;

  const workspaces = parsed.workspaces.map((item, index): ResolvedWorkspace => {
    if (!isRecord(item)) throw new Error(`workspaces[${index}] must be an object`);
    if (item.name !== undefined && typeof item.name !== "string") throw new Error(`workspaces[${index}].name must be string`);
    if (typeof item.path !== "string") throw new Error(`workspaces[${index}].path is required`);
    const tags = asStringArray(`workspaces[${index}].tags`, item.tags);
    const capabilities = asCapabilityArray(item.capabilities);
    const contextFiles = asStringArray(`workspaces[${index}].contextFiles`, item.contextFiles, false);
    for (const contextFile of [...defaultContextFiles, ...contextFiles]) {
      assertWorkspaceInternalRelative(`workspaces[${index}].contextFiles`, contextFile);
    }

    const routes: Partial<Record<RouteType, string | RouteConfig>> | undefined = isRecord(item.routes)
      ? (item.routes as Partial<Record<RouteType, string | RouteConfig>>)
      : undefined;
    if (capabilities.includes("writeDocs") && !routes) {
      throw new Error(`workspaces[${index}] has writeDocs but no routes`);
    }

    const normalizedRoutes: Partial<Record<RouteType, RouteConfig>> = {};
    if (routes) {
      for (const [routeType, routeValue] of Object.entries(routes)) {
        normalizedRoutes[routeType as RouteType] = normalizeRoute(routeType, routeValue);
      }
    }

    const resolvedPath = path.resolve(cwd, item.path);
    return {
      name: item.name as string | undefined,
      path: item.path,
      tags,
      capabilities,
      contextFiles,
      routes,
      index,
      resolvedPath,
      normalizedRoutes,
      effectiveContextFiles: [...defaultContextFiles, ...contextFiles],
    };
  });

  return {
    configPath,
    root: cwd,
    raw: {
      version: 1,
      defaults: {
        contextFiles: defaultContextFiles,
        filenameTemplate: defaultFilenameTemplate,
        metadata: defaultMetadata,
      },
      workspaces,
    },
    workspaces,
  };
}

function matchesTarget(workspace: ResolvedWorkspace, target: TargetInput): boolean {
  if (target.workspaceIndex !== undefined && workspace.index !== target.workspaceIndex) return false;
  if (target.workspaceName && workspace.name !== target.workspaceName) return false;
  if (target.targetTags?.length && !target.targetTags.every((tag) => workspace.tags.includes(tag))) return false;
  if (target.requireCapabilities?.length) {
    if (!target.requireCapabilities.every((cap) => workspace.capabilities.includes(cap))) return false;
  }
  return true;
}

function splitCommandArgs(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    tokens.push(token.replace(/\\(["\\])/g, "$1"));
  }
  return tokens;
}

function parseCommandArgs(input: string): ParsedCommandArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const tokens = splitCommandArgs(input);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--") || token === "--") {
      positional.push(token);
      continue;
    }
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }
    const next = tokens[index + 1];
    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      index += 1;
    } else {
      flags[raw] = true;
    }
  }
  return { positional, flags };
}

function stringFlag(flags: Record<string, string | boolean>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = flags[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function commandTarget(flags: Record<string, string | boolean>, requireCapabilities?: CapabilityTag[]): TargetInput {
  const workspace = stringFlag(flags, "workspace", "w");
  const tags = stringFlag(flags, "tags", "tag")
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const workspaceIndex = workspace?.startsWith("#") ? Number.parseInt(workspace.slice(1), 10) : undefined;
  return {
    ...(workspace && workspaceIndex === undefined ? { workspaceName: workspace } : {}),
    ...(workspaceIndex !== undefined && Number.isFinite(workspaceIndex) ? { workspaceIndex } : {}),
    ...(tags?.length ? { targetTags: tags } : {}),
    requireCapabilities,
  };
}

function metadataFlag(flags: Record<string, string | boolean>): Record<string, string> {
  const raw = stringFlag(flags, "meta", "metadata");
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const equalsIndex = item.indexOf("=");
        if (equalsIndex < 0) return [item, ""];
        return [item.slice(0, equalsIndex).trim(), item.slice(equalsIndex + 1).trim()];
      })
      .filter(([key]) => key),
  );
}

function commaListFlag(flags: Record<string, string | boolean>, ...names: string[]): string[] {
  const raw = stringFlag(flags, ...names);
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function routesFlag(flags: Record<string, string | boolean>): WorkspaceConfig["routes"] | undefined {
  const raw = stringFlag(flags, "routes", "route");
  if (!raw) return undefined;
  if (!raw.includes("=")) return { default: raw };
  const routes: Partial<Record<RouteType, string>> = {};
  for (const item of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    const equalsIndex = item.indexOf("=");
    if (equalsIndex < 0) throw new Error(`Route entry must be routeType=path: ${item}`);
    const routeType = item.slice(0, equalsIndex).trim() as RouteType;
    const routePath = item.slice(equalsIndex + 1).trim();
    if (!ROUTE_TYPES.includes(routeType)) throw new Error(`Unknown route type: ${routeType}`);
    if (!routePath) throw new Error(`Route path is empty for ${routeType}`);
    routes[routeType] = routePath;
  }
  return routes;
}

function buildWorkspaceFromAddArgs(args: string): WorkspaceConfig {
  const parsed = parseCommandArgs(args);
  const workspacePath = stringFlag(parsed.flags, "path", "p") ?? parsed.positional[0];
  if (!workspacePath) throw new Error("workspace path is required");
  const capabilities = commaListFlag(parsed.flags, "capabilities", "caps", "cap");
  if (capabilities.length === 0) throw new Error("--capabilities is required");
  const workspaceBlock: WorkspaceConfig = {
    ...(stringFlag(parsed.flags, "name", "n") ? { name: stringFlag(parsed.flags, "name", "n") } : {}),
    path: workspacePath,
    tags: commaListFlag(parsed.flags, "tags", "tag"),
    capabilities: asCapabilityArray(capabilities),
    contextFiles: commaListFlag(parsed.flags, "context", "contexts", "contextFiles"),
    ...(routesFlag(parsed.flags) ? { routes: routesFlag(parsed.flags) } : {}),
  };
  if (workspaceBlock.tags.length === 0) throw new Error("--tags is required");
  if (workspaceBlock.contextFiles?.length === 0) delete workspaceBlock.contextFiles;
  if (workspaceBlock.capabilities.includes("writeDocs") && !workspaceBlock.routes) {
    throw new Error("workspaces with writeDocs require --route or --routes");
  }
  return workspaceBlock;
}

async function addWorkspaceToConfig(configPath: string, workspaceBlock: WorkspaceConfig): Promise<void> {
  const exists = await pathExists(configPath);
  const parsed = exists ? (YAML.parse(await readFile(configPath, "utf8"), { uniqueKeys: true }) as unknown) : { version: 1, workspaces: [] };
  if (!isRecord(parsed)) throw new Error("monofold config must be a YAML object");
  if (parsed.version === undefined) parsed.version = 1;
  if (parsed.version !== 1) throw new Error("monofold config requires version: 1");
  const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
  parsed.workspaces = workspaces;
  if (workspaces.some((item: unknown) => isRecord(item) && item.path === workspaceBlock.path)) {
    throw new Error(`workspace path already exists: ${workspaceBlock.path}`);
  }
  workspaces.push(workspaceBlock);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, YAML.stringify(parsed).trimEnd() + "\n", "utf8");
}

function sendCommandOutput(pi: ExtensionAPI, title: string, text: string, details?: Record<string, unknown>) {
  pi.sendMessage({
    customType: "monofold-output",
    content: `## ${title}\n\n${text}`,
    display: true,
    details: details ?? {},
  });
}

function sendCommandError(pi: ExtensionAPI, command: string, error: unknown, usage: string) {
  const message = error instanceof Error ? error.message : String(error);
  sendCommandOutput(pi, command, `Error: ${message}\n\nUsage:\n${usage}`, { error: message });
}

async function resolveWorkspace(ctx: ExtensionContext, loaded: LoadedConfig, target: TargetInput): Promise<ResolvedWorkspace> {
  const matches = loaded.workspaces.filter((workspace) => matchesTarget(workspace, target));
  if (matches.length === 0) throw new Error(`No workspace matches target: ${JSON.stringify(target)}`);
  if (matches.length === 1) return matches[0];
  if (!ctx.hasUI) {
    throw new Error(`Multiple workspaces match target in non-interactive mode: ${matches.map(formatWorkspaceLabel).join(", ")}`);
  }
  const labels = matches.map(formatWorkspaceLabel);
  const choice = await ctx.ui.select("Select workspace", labels);
  if (!choice) throw new Error("Workspace selection cancelled");
  return matches[labels.indexOf(choice)];
}

function formatWorkspaceLabel(workspace: ResolvedWorkspace): string {
  const displayName = workspace.name ? `${workspace.name} ` : "";
  return `#${workspace.index} ${displayName}[${workspace.tags.join(", ")}] ${workspace.path}`;
}

function relativePath(workspace: ResolvedWorkspace, inputPath: string): string {
  assertWorkspaceInternalRelative("path", inputPath);
  return path.join(workspace.resolvedPath, inputPath);
}

async function gitSummary(workspace: ResolvedWorkspace): Promise<{ isGit: boolean; status?: string }> {
  if (!(await pathExists(path.join(workspace.resolvedPath, ".git")))) return { isGit: false };
  const result = await runCommand("git", ["-C", workspace.resolvedPath, "status", "--short"], { timeout: 5000 });
  return { isGit: true, status: result.stdout.trim() || "clean" };
}

async function buildManifest(loaded: LoadedConfig): Promise<string> {
  const lines = ["Pi Monofold Manifest:"];
  for (const workspace of loaded.workspaces) {
    const git = await gitSummary(workspace).catch((error) => ({ isGit: false, status: `git status error: ${String(error)}` }));
    lines.push(
      `- ${formatWorkspaceLabel(workspace)}\n` +
        `  capabilities: ${workspace.capabilities.join(", ")}\n` +
        `  routes: ${Object.keys(workspace.normalizedRoutes).join(", ") || "none"}\n` +
        `  contextFiles: ${workspace.effectiveContextFiles.join(", ") || "none"}\n` +
        `  git: ${git.isGit ? git.status : "not a git repository"}`,
    );
  }
  lines.push("Use monofold_* tools for cross-workspace operations. Do not guess output paths when a route exists.");
  return lines.join("\n");
}

async function shallowTree(root: string, depth: number, prefix = ""): Promise<string[]> {
  if (depth < 0) return [];
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries.filter((e) => !e.name.startsWith(".git") && e.name !== "node_modules").slice(0, 200)) {
    const rel = normalizeSlashes(path.join(prefix, entry.name));
    lines.push(entry.isDirectory() ? `${rel}/` : rel);
    if (entry.isDirectory() && depth > 0) {
      lines.push(...(await shallowTree(root, depth - 1, rel)));
    }
  }
  return lines;
}

function slugify(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "note";
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(date|datetime|title|slug|routeType|workspaceName|workspaceTags)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function renderMetadata(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string") return renderTemplate(value, vars);
  if (Array.isArray(value)) return value.map((item) => renderMetadata(item, vars));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderMetadata(item, vars)]));
  }
  return value;
}

function frontmatter(metadata: Record<string, unknown>): string {
  if (Object.keys(metadata).length === 0) return "";
  return `---\n${YAML.stringify(metadata).trim()}\n---\n\n`;
}

function classifyPath(targetPath: string): "docs" | "code" | "unknown" {
  const ext = path.extname(targetPath).toLowerCase();
  if (DOC_EXTENSIONS.has(ext)) return "docs";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "unknown";
}

function findWorkspaceForPath(loaded: LoadedConfig, targetPath: string): ResolvedWorkspace | undefined {
  const absolute = path.resolve(loaded.root, targetPath);
  return loaded.workspaces.find((workspace) => isInside(workspace.resolvedPath, absolute));
}

async function confirm(ctx: ExtensionContext, title: string, body: string): Promise<boolean> {
  if (!ctx.hasUI) return false;
  return ctx.ui.confirm(title, body);
}

async function maybeBlockUnknown(ctx: ExtensionContext, loaded: LoadedConfig, targetPath: string, action: string) {
  const workspace = findWorkspaceForPath(loaded, targetPath);
  if (workspace) return undefined;
  const ok = await confirm(ctx, "Unknown Path", `${action} targets an unknown path:\n${targetPath}\nAllow this operation?`);
  if (!ok) return { block: true, reason: `Unknown Path requires confirmation: ${targetPath}` };
  return undefined;
}

async function guardPathOperation(ctx: ExtensionContext, loaded: LoadedConfig, targetPath: string, action: "read" | "write" | "edit") {
  const workspace = findWorkspaceForPath(loaded, targetPath);
  if (!workspace) return maybeBlockUnknown(ctx, loaded, targetPath, action);
  if (action === "read") {
    if (!workspace.capabilities.includes("read")) return { block: true, reason: `Workspace lacks read capability: ${formatWorkspaceLabel(workspace)}` };
    return undefined;
  }
  const kind = classifyPath(targetPath);
  if (kind === "docs" && workspace.capabilities.includes("writeDocs")) return undefined;
  if (kind === "code" && workspace.capabilities.includes("editCode")) return undefined;
  if (kind === "unknown") {
    const ok = await confirm(
      ctx,
      "Unclassified file write",
      `${action} targets an unclassified file in ${formatWorkspaceLabel(workspace)}:\n${targetPath}\nAllow?`,
    );
    if (ok) return undefined;
  }
  return { block: true, reason: `Workspace lacks capability for ${kind} ${action}: ${formatWorkspaceLabel(workspace)}` };
}

function bashLooksDangerous(command: string): string | undefined {
  const normalized = command.toLowerCase();
  if (/rm\s+(-[^\n;]*r[^\n;]*f|-rf|-fr)/.test(normalized)) return "rm -rf";
  if (/git\s+reset\s+--hard/.test(normalized)) return "git reset --hard";
  if (/git\s+clean\b/.test(normalized)) return "git clean";
  if (/chmod\s+-r/.test(normalized)) return "chmod -R";
  return undefined;
}

function bashContainsGitCommitOrPush(command: string): boolean {
  return /(^|[;&|]\s*)git\s+(commit|push)\b/i.test(command);
}

function inferBashCwd(ctx: ExtensionContext, command: string): string {
  const match = command.match(/(?:^|[;&|]\s*)cd\s+([^;&|\n]+)/);
  if (!match) return ctx.cwd;
  const raw = match[1].trim().replace(/^['"]|['"]$/g, "");
  return path.resolve(ctx.cwd, raw);
}

export default function piMultiWorkspace(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (_event, ctx) => {
    try {
      const loaded = await loadConfig(ctx.cwd);
      const manifest = await buildManifest(loaded);
      return {
        systemPrompt:
          _event.systemPrompt +
          `

## Pi Monofold

${manifest}
`,
      };
    } catch {
      return undefined;
    }
  });

  pi.registerTool({
    name: "monofold_list",
    label: "Workspace List",
    description: "List configured Pi Monofold workspaces with tags, capabilities, routes, context files, and git status.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const loaded = await loadConfig(ctx.cwd);
      const manifest = await buildManifest(loaded);
      return { content: [{ type: "text", text: manifest }], details: { workspaces: loaded.workspaces } };
    },
  });

  pi.registerTool({
    name: "monofold_read",
    label: "Workspace Read",
    description: "Read, search, or list files inside a configured Workspace. Requires read capability.",
    parameters: Type.Object({
      mode: Type.String({ description: "file, search, or tree" }),
      path: Type.Optional(Type.String({ description: "Workspace-relative path for file/tree" })),
      query: Type.Optional(Type.String({ description: "Search query for mode=search" })),
      depth: Type.Optional(Type.Number({ description: "Tree depth, default 1" })),
      targetTags: Type.Optional(Type.Array(Type.String())),
      workspaceName: Type.Optional(Type.String()),
      requireCapabilities: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, {
        targetTags: params.targetTags,
        workspaceName: params.workspaceName,
        requireCapabilities: ["read"],
      });
      if (!workspace.capabilities.includes("read")) throw new Error(`Workspace lacks read capability: ${formatWorkspaceLabel(workspace)}`);
      if (params.mode === "file") {
        if (!params.path) throw new Error("monofold_read mode=file requires path");
        const filePath = relativePath(workspace, params.path);
        const text = await readFile(filePath, "utf8");
        return { content: [{ type: "text", text }], details: { workspace: formatWorkspaceLabel(workspace), path: params.path } };
      }
      if (params.mode === "tree") {
        const root = params.path ? relativePath(workspace, params.path) : workspace.resolvedPath;
        const lines = await shallowTree(root, Math.max(0, Math.min(5, params.depth ?? 1)));
        return { content: [{ type: "text", text: lines.join("\n") }], details: { workspace: formatWorkspaceLabel(workspace), path: params.path ?? "." } };
      }
      if (params.mode === "search") {
        if (!params.query) throw new Error("monofold_read mode=search requires query");
        const result = await runCommand("rg", ["--line-number", "--hidden", "--glob", "!.git/**", params.query, params.path ?? "."], {
          cwd: workspace.resolvedPath,
          signal,
          timeout: 10000,
          allowExitCodes: [0, 1],
        });
        const output = result.stdout.trim() || result.stderr.trim() || "No matches";
        return { content: [{ type: "text", text: output }], details: { workspace: formatWorkspaceLabel(workspace), query: params.query } };
      }
      throw new Error(`Unknown monofold_read mode: ${params.mode}`);
    },
  });

  pi.registerTool({
    name: "monofold_write",
    label: "Workspace Write",
    description: "Write a Markdown document to a routed Workspace destination using routeType, title, body, filename, and metadata.",
    parameters: Type.Object({
      routeType: Type.String({ description: "default, prd, design, progress, issue, research, or decision" }),
      title: Type.String(),
      body: Type.String(),
      filename: Type.Optional(Type.String()),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
      targetTags: Type.Optional(Type.Array(Type.String())),
      workspaceName: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const routeType = params.routeType as RouteType;
      if (!ROUTE_TYPES.includes(routeType)) throw new Error(`Unknown routeType: ${params.routeType}`);
      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, {
        targetTags: params.targetTags,
        workspaceName: params.workspaceName,
        requireCapabilities: ["writeDocs"],
      });
      const route = workspace.normalizedRoutes[routeType] ?? workspace.normalizedRoutes.default;
      if (!route) throw new Error(`Workspace has no route for ${routeType} and no default route`);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const vars = {
        date,
        datetime: now.toISOString(),
        title: params.title,
        slug: slugify(params.title),
        routeType,
        workspaceName: workspace.name ?? "",
        workspaceTags: workspace.tags.join(","),
      };
      const defaultTemplate = loaded.raw.defaults?.filenameTemplate ?? "{{date}}-{{slug}}.md";
      const filename = params.filename ?? renderTemplate(route.filenameTemplate ?? defaultTemplate, vars);
      assertWorkspaceInternalRelative("filename", filename);
      const dir = relativePath(workspace, route.path);
      const outputPath = path.join(dir, filename);
      const defaultMetadata = loaded.raw.defaults?.metadata ?? {};
      const routeMetadata = route.metadata ?? {};
      const metadata = renderMetadata({ ...defaultMetadata, ...routeMetadata, ...(params.metadata ?? {}) }, vars) as Record<string, unknown>;
      const text = `${frontmatter(metadata)}# ${params.title}\n\n${params.body.trim()}\n`;
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, text, "utf8");
      const rel = normalizeSlashes(path.relative(workspace.resolvedPath, outputPath));
      return { content: [{ type: "text", text: `Wrote ${formatWorkspaceLabel(workspace)}:${rel}` }], details: { workspace, path: rel } };
    },
  });

  pi.registerTool({
    name: "monofold_git",
    label: "Workspace Git",
    description: "Run guarded git status, commit, or push for one configured Git Workspace.",
    parameters: Type.Object({
      action: Type.String({ description: "status, commit, or push" }),
      message: Type.Optional(Type.String()),
      targetTags: Type.Optional(Type.Array(Type.String())),
      workspaceName: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const required: CapabilityTag[] = params.action === "push" ? ["gitPush"] : params.action === "commit" ? ["gitCommit"] : [];
      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, {
        targetTags: params.targetTags,
        workspaceName: params.workspaceName,
        requireCapabilities: required,
      });
      if (!(await pathExists(path.join(workspace.resolvedPath, ".git")))) throw new Error(`Not a Git Workspace: ${formatWorkspaceLabel(workspace)}`);
      if (params.action === "status") {
        const result = await runCommand("git", ["-C", workspace.resolvedPath, "status", "--short", "--branch"], { signal, timeout: 10000 });
        return { content: [{ type: "text", text: result.stdout || "clean" }], details: { workspace } };
      }
      if (params.action === "commit") {
        const message = params.message ?? `Update ${workspace.name ?? (workspace.tags.join("-") || "workspace")}`;
        const status = await runCommand("git", ["-C", workspace.resolvedPath, "status", "--short"], { signal, timeout: 10000 });
        const diffstat = await runCommand("git", ["-C", workspace.resolvedPath, "diff", "--stat"], { signal, timeout: 10000 });
        const ok = await confirm(ctx, "Workspace Commit", `${formatWorkspaceLabel(workspace)}\n\nStatus:\n${status.stdout || "clean"}\n\nDiffstat:\n${diffstat.stdout || "none"}\n\nCommit message:\n${message}\n\nStage all and commit?`);
        if (!ok) return { content: [{ type: "text", text: "Commit cancelled" }], details: { cancelled: true } };
        await runCommand("git", ["-C", workspace.resolvedPath, "add", "-A"], { signal, timeout: 10000 });
        const commit = await runCommand("git", ["-C", workspace.resolvedPath, "commit", "-m", message], { signal, timeout: 30000 });
        return { content: [{ type: "text", text: commit.stdout || commit.stderr }], details: { workspace, message } };
      }
      if (params.action === "push") {
        const branch = await runCommand("git", ["-C", workspace.resolvedPath, "branch", "--show-current"], { signal, timeout: 10000 });
        const remote = await runCommand("git", ["-C", workspace.resolvedPath, "remote", "-v"], { signal, timeout: 10000 });
        const log = await runCommand("git", ["-C", workspace.resolvedPath, "log", "--oneline", "@{u}..HEAD"], {
          signal,
          timeout: 10000,
          allowExitCodes: [0, 128],
        });
        const ok = await confirm(ctx, "Confirmed Push", `${formatWorkspaceLabel(workspace)}\n\nBranch: ${branch.stdout.trim()}\n\nRemote:\n${remote.stdout}\n\nCommits to push:\n${log.stdout || "none/unknown upstream"}\n\nPush now?`);
        if (!ok) return { content: [{ type: "text", text: "Push cancelled" }], details: { cancelled: true } };
        const push = await runCommand("git", ["-C", workspace.resolvedPath, "push"], { signal, timeout: 60000 });
        return { content: [{ type: "text", text: push.stdout || push.stderr }], details: { workspace } };
      }
      throw new Error(`Unknown monofold_git action: ${params.action}`);
    },
  });

  const listCommand = async (_args: string, ctx: ExtensionCommandContext) => {
    try {
      const loaded = await loadConfig(ctx.cwd);
      const manifest = await buildManifest(loaded);
      sendCommandOutput(pi, "monofold:list", manifest, { workspaces: loaded.workspaces });
    } catch (error) {
      sendCommandError(pi, "monofold:list", error, "/monofold:list");
    }
  };

  const readUsage = [
    "/monofold:tree [path] [--workspace \"Name\"|--workspace #0] [--depth 2]",
    "/monofold:read file <path> [--workspace \"Name\"|--workspace #0]",
    "/monofold:search <query> [--workspace \"Name\"|--workspace #0]",
    "Aliases: /monofold_read tree|file|search ...",
  ].join("\n");

  const readCommand = async (args: string, ctx: ExtensionCommandContext) => {
    try {
      const parsed = parseCommandArgs(args);
      const mode = parsed.positional[0] ?? "tree";
      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, commandTarget(parsed.flags, ["read"]));
      if (!workspace.capabilities.includes("read")) throw new Error(`Workspace lacks read capability: ${formatWorkspaceLabel(workspace)}`);

      if (mode === "file" || mode === "read") {
        const inputPath = stringFlag(parsed.flags, "path", "p") ?? parsed.positional.slice(1).join(" ");
        if (!inputPath) throw new Error("file mode requires path");
        const filePath = relativePath(workspace, inputPath);
        const text = await readFile(filePath, "utf8");
        sendCommandOutput(pi, `monofold:read ${formatWorkspaceLabel(workspace)}:${inputPath}`, text, { workspace, path: inputPath });
        return;
      }

      if (mode === "tree" || mode === "ls") {
        const inputPath = stringFlag(parsed.flags, "path", "p") ?? parsed.positional.slice(1).join(" ");
        const depth = Number.parseInt(stringFlag(parsed.flags, "depth", "d") ?? "1", 10);
        const root = inputPath ? relativePath(workspace, inputPath) : workspace.resolvedPath;
        const lines = await shallowTree(root, Math.max(0, Math.min(5, Number.isFinite(depth) ? depth : 1)));
        sendCommandOutput(pi, `monofold:tree ${formatWorkspaceLabel(workspace)}:${inputPath || "."}`, lines.join("\n"), {
          workspace,
          path: inputPath || ".",
        });
        return;
      }

      if (mode === "search" || mode === "grep") {
        const query = stringFlag(parsed.flags, "query", "q") ?? parsed.positional.slice(1).join(" ");
        if (!query) throw new Error("search mode requires query");
        const result = await runCommand("rg", ["--line-number", "--hidden", "--glob", "!.git/**", query, "."], {
          cwd: workspace.resolvedPath,
          timeout: 10000,
          allowExitCodes: [0, 1],
        });
        const output = result.stdout.trim() || result.stderr.trim() || "No matches";
        sendCommandOutput(pi, `monofold:search ${formatWorkspaceLabel(workspace)}:${query}`, output, { workspace, query });
        return;
      }

      throw new Error(`Unknown read mode: ${mode}`);
    } catch (error) {
      sendCommandError(pi, "monofold:read", error, readUsage);
    }
  };

  const writeUsage = [
    "/monofold:write --route progress --title \"Title\" --body \"Markdown body\" [--workspace \"Name\"|--workspace #0]",
    "Optional: --filename file.md --meta key=value,other=value",
    "Alias: /monofold_write ...",
  ].join("\n");

  const writeCommand = async (args: string, ctx: ExtensionCommandContext) => {
    try {
      const parsed = parseCommandArgs(args);
      const routeType = (stringFlag(parsed.flags, "route", "r") ?? parsed.positional[0] ?? "default") as RouteType;
      if (!ROUTE_TYPES.includes(routeType)) throw new Error(`Unknown routeType: ${routeType}`);
      const title = stringFlag(parsed.flags, "title", "t");
      const body = stringFlag(parsed.flags, "body", "b");
      if (!title) throw new Error("--title is required");
      if (!body) throw new Error("--body is required");

      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, commandTarget(parsed.flags, ["writeDocs"]));
      const route = workspace.normalizedRoutes[routeType] ?? workspace.normalizedRoutes.default;
      if (!route) throw new Error(`Workspace has no route for ${routeType} and no default route`);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const vars = {
        date,
        datetime: now.toISOString(),
        title,
        slug: slugify(title),
        routeType,
        workspaceName: workspace.name ?? "",
        workspaceTags: workspace.tags.join(","),
      };
      const defaultTemplate = loaded.raw.defaults?.filenameTemplate ?? "{{date}}-{{slug}}.md";
      const filename = stringFlag(parsed.flags, "filename", "file", "f") ?? renderTemplate(route.filenameTemplate ?? defaultTemplate, vars);
      assertWorkspaceInternalRelative("filename", filename);
      const dir = relativePath(workspace, route.path);
      const outputPath = path.join(dir, filename);
      const metadata = renderMetadata(
        { ...(loaded.raw.defaults?.metadata ?? {}), ...(route.metadata ?? {}), ...metadataFlag(parsed.flags) },
        vars,
      ) as Record<string, unknown>;
      const text = `${frontmatter(metadata)}# ${title}\n\n${body.trim()}\n`;
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, text, "utf8");
      const rel = normalizeSlashes(path.relative(workspace.resolvedPath, outputPath));
      sendCommandOutput(pi, "monofold:write", `Wrote ${formatWorkspaceLabel(workspace)}:${rel}`, { workspace, path: rel });
    } catch (error) {
      sendCommandError(pi, "monofold:write", error, writeUsage);
    }
  };

  const gitUsage = "/monofold:git status|commit|push [--workspace \"Name\"|--workspace #0] [--message \"Commit message\"]\nAlias: /monofold_git ...";

  const gitCommand = async (args: string, ctx: ExtensionCommandContext) => {
    try {
      const parsed = parseCommandArgs(args);
      const action = parsed.positional[0] ?? "status";
      const required: CapabilityTag[] = action === "push" ? ["gitPush"] : action === "commit" ? ["gitCommit"] : [];
      const loaded = await loadConfig(ctx.cwd);
      const workspace = await resolveWorkspace(ctx, loaded, commandTarget(parsed.flags, required));
      if (!(await pathExists(path.join(workspace.resolvedPath, ".git")))) throw new Error(`Not a Git Workspace: ${formatWorkspaceLabel(workspace)}`);

      if (action === "status") {
        const result = await runCommand("git", ["-C", workspace.resolvedPath, "status", "--short", "--branch"], { timeout: 10000 });
        sendCommandOutput(pi, `monofold:git status ${formatWorkspaceLabel(workspace)}`, result.stdout || "clean", { workspace });
        return;
      }

      if (action === "commit") {
        const parsedMessage = stringFlag(parsed.flags, "message", "m") ?? parsed.positional.slice(1).join(" ");
        const message = parsedMessage || `Update ${workspace.name ?? (workspace.tags.join("-") || "workspace")}`;
        const status = await runCommand("git", ["-C", workspace.resolvedPath, "status", "--short"], { timeout: 10000 });
        const diffstat = await runCommand("git", ["-C", workspace.resolvedPath, "diff", "--stat"], { timeout: 10000 });
        const ok = await confirm(ctx, "Workspace Commit", `${formatWorkspaceLabel(workspace)}\n\nStatus:\n${status.stdout || "clean"}\n\nDiffstat:\n${diffstat.stdout || "none"}\n\nCommit message:\n${message}\n\nStage all and commit?`);
        if (!ok) {
          sendCommandOutput(pi, "monofold:git commit", "Commit cancelled", { cancelled: true });
          return;
        }
        await runCommand("git", ["-C", workspace.resolvedPath, "add", "-A"], { timeout: 10000 });
        const commit = await runCommand("git", ["-C", workspace.resolvedPath, "commit", "-m", message], { timeout: 30000 });
        sendCommandOutput(pi, `monofold:git commit ${formatWorkspaceLabel(workspace)}`, commit.stdout || commit.stderr, { workspace, message });
        return;
      }

      if (action === "push") {
        const branch = await runCommand("git", ["-C", workspace.resolvedPath, "branch", "--show-current"], { timeout: 10000 });
        const remote = await runCommand("git", ["-C", workspace.resolvedPath, "remote", "-v"], { timeout: 10000 });
        const log = await runCommand("git", ["-C", workspace.resolvedPath, "log", "--oneline", "@{u}..HEAD"], {
          timeout: 10000,
          allowExitCodes: [0, 128],
        });
        const ok = await confirm(ctx, "Confirmed Push", `${formatWorkspaceLabel(workspace)}\n\nBranch: ${branch.stdout.trim()}\n\nRemote:\n${remote.stdout}\n\nCommits to push:\n${log.stdout || "none/unknown upstream"}\n\nPush now?`);
        if (!ok) {
          sendCommandOutput(pi, "monofold:git push", "Push cancelled", { cancelled: true });
          return;
        }
        const push = await runCommand("git", ["-C", workspace.resolvedPath, "push"], { timeout: 60000 });
        sendCommandOutput(pi, `monofold:git push ${formatWorkspaceLabel(workspace)}`, push.stdout || push.stderr, { workspace });
        return;
      }

      throw new Error(`Unknown git action: ${action}`);
    } catch (error) {
      sendCommandError(pi, "monofold:git", error, gitUsage);
    }
  };

  const addUsage = [
    "/monofold:add <path> --name \"Name\" --tags tag1,tag2 --capabilities read,editCode,runCommands,gitCommit",
    "Optional: --context README.md,AGENTS.md",
    "Docs workspace: --capabilities read,writeDocs,gitCommit --route Notes",
    "Multi-route docs: --routes default=Notes,progress=Progress,research=Research",
    "Alias: /monofold_add ...",
  ].join("\n");

  const addCommand = async (args: string, ctx: ExtensionCommandContext) => {
    try {
      const workspaceBlock = buildWorkspaceFromAddArgs(args);
      const configPath = path.join(ctx.cwd, CONFIG_RELATIVE_PATH);
      await addWorkspaceToConfig(configPath, workspaceBlock);
      const loaded = await loadConfig(ctx.cwd);
      sendCommandOutput(pi, "monofold:add", `Added workspace:\n${YAML.stringify(workspaceBlock).trim()}\n\n${await buildManifest(loaded)}`, {
        workspace: workspaceBlock,
      });
    } catch (error) {
      sendCommandError(pi, "monofold:add", error, addUsage);
    }
  };

  pi.registerCommand("monofold:list", { description: "List configured Pi Monofold workspaces", handler: listCommand });
  pi.registerCommand("monofold_list", { description: "Alias for /monofold:list", handler: listCommand });
  pi.registerCommand("monofold:tree", { description: "Show a tree for a configured workspace", handler: readCommand });
  pi.registerCommand("monofold:read", { description: "Read, tree, or search a configured workspace", handler: readCommand });
  pi.registerCommand("monofold_read", { description: "Alias for /monofold:read", handler: readCommand });
  pi.registerCommand("monofold:search", { description: "Search a configured workspace", handler: (args, ctx) => readCommand(`search ${args}`, ctx) });
  pi.registerCommand("monofold:write", { description: "Write a routed Markdown document", handler: writeCommand });
  pi.registerCommand("monofold_write", { description: "Alias for /monofold:write", handler: writeCommand });
  pi.registerCommand("monofold:git", { description: "Run guarded workspace git status, commit, or push", handler: gitCommand });
  pi.registerCommand("monofold_git", { description: "Alias for /monofold:git", handler: gitCommand });
  pi.registerCommand("monofold:add", { description: "Add a workspace to .pi/monofold.yml", handler: addCommand });
  pi.registerCommand("monofold_add", { description: "Alias for /monofold:add", handler: addCommand });

  const initCommand = async (_args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("monofold:init requires interactive UI", "error");
        return;
      }
      const configPath = path.join(ctx.cwd, CONFIG_RELATIVE_PATH);
      const exists = await pathExists(configPath);
      if (exists) {
        const ok = await ctx.ui.confirm("Existing config", `${CONFIG_RELATIVE_PATH} exists. Append a new workspace?`);
        if (!ok) return;
      }
      const workspacePath = await ctx.ui.input("Workspace path", "../business");
      if (!workspacePath) return;
      const name = await ctx.ui.input("Optional workspace name", "");
      const tagsInput = await ctx.ui.input("Tags comma-separated", "business,markdown");
      if (!tagsInput) return;
      const capsInput = await ctx.ui.input("Capabilities comma-separated", "read,writeDocs,gitCommit");
      if (!capsInput) return;
      const capabilities = capsInput.split(",").map((s) => s.trim()).filter(Boolean);
      const routePath = capabilities.includes("writeDocs") ? await ctx.ui.input("Default document route", "Notes") : undefined;
      const workspaceBlock: WorkspaceConfig = {
        ...(name?.trim() ? { name: name.trim() } : {}),
        path: workspacePath.trim(),
        tags: tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
        capabilities: capabilities as CapabilityTag[],
        ...(routePath ? { routes: { default: routePath.trim() } } : {}),
      };
      const current = exists ? await readFile(configPath, "utf8") : "version: 1\n\nworkspaces:\n";
      const addition = YAML.stringify([workspaceBlock])
        .split("\n")
        .filter(Boolean)
        .map((line) => `  ${line}`)
        .join("\n");
      const next = exists ? `${current.trimEnd()}\n${addition}\n` : `version: 1\n\nworkspaces:\n${addition}\n`;
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, next, "utf8");
      ctx.ui.notify(`Updated ${CONFIG_RELATIVE_PATH}`, "info");
  };

  pi.registerCommand("monofold:init", {
    description: "Create or update .pi/monofold.yml with an interactive wizard",
    handler: initCommand,
  });
  pi.registerCommand("monofold_init", {
    description: "Alias for /monofold:init",
    handler: initCommand,
  });

  pi.registerTool({
    name: "monofold_init",
    label: "Workspace Init",
    description: "Queue the interactive /monofold:init command to create or update .pi/monofold.yml.",
    parameters: Type.Object({}),
    async execute() {
      pi.sendUserMessage("/monofold:init", { deliverAs: "followUp" });
      return { content: [{ type: "text", text: "Queued /monofold:init" }], details: {} };
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    let loaded: LoadedConfig;
    try {
      loaded = await loadConfig(ctx.cwd);
    } catch {
      return undefined;
    }

    if ((event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") && typeof event.input.path === "string") {
      return guardPathOperation(ctx, loaded, event.input.path, event.toolName as "read" | "write" | "edit");
    }

    if ((event.toolName === "grep" || event.toolName === "find") && typeof event.input.path === "string") {
      return guardPathOperation(ctx, loaded, event.input.path, "read");
    }

    if (event.toolName === "bash" && typeof event.input.command === "string") {
      const command = event.input.command;
      if (bashContainsGitCommitOrPush(command)) {
        return { block: true, reason: "Use monofold_git for git commit/push so confirmation flow is enforced." };
      }
      const danger = bashLooksDangerous(command);
      if (danger) {
        const ok = await confirm(ctx, "Dangerous command", `Command contains ${danger}:\n${command}\nAllow?`);
        if (!ok) return { block: true, reason: `Dangerous command requires confirmation: ${danger}` };
      }
      const cwd = inferBashCwd(ctx, command);
      const workspace = findWorkspaceForPath(loaded, cwd);
      if (!workspace) return maybeBlockUnknown(ctx, loaded, cwd, "bash");
      if (!workspace.capabilities.includes("runCommands")) {
        return { block: true, reason: `Workspace lacks runCommands capability: ${formatWorkspaceLabel(workspace)}` };
      }
    }

    return undefined;
  });
}

