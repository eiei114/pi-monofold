import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import piMonofold from "../index.js";
import { rememberUnknownPathAllow } from "../unknown-path-allows.js";

type ToolCallHandler = (event: { toolName: string; input: Record<string, unknown> }, ctx: any) => Promise<unknown>;

function loadExtension() {
  const handlers = new Map<string, ToolCallHandler>();
  piMonofold({
    on(event: string, handler: ToolCallHandler) {
      handlers.set(event, handler);
    },
    registerTool() {},
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  const toolCall = handlers.get("tool_call");
  assert.ok(toolCall, "extension should register a tool_call guard");
  return toolCall;
}

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-unknown-guard-"));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "Notes"), { recursive: true });
  await writeFile(path.join(workspace, "README.md"), "workspace readme\n", "utf8");
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await writeFile(
    path.join(root, ".pi", "monofold.yaml"),
    `version: 1
workspaces:
  - name: Workspace
    path: ./workspace
    tags: [workspace]
    capabilities: [read]
`,
    "utf8",
  );
  return root;
}

function ctx(cwd: string, hasUI: boolean, select?: (title: string, labels: string[]) => string | undefined) {
  return {
    cwd,
    hasUI,
    ui: { notify() {}, setStatus() {}, confirm: async () => false, select },
  };
}

describe("Unknown Path guard and remembered allows", () => {
  it("blocks a no-UI call outside every workspace when no remembered allow matches", async () => {
    const root = await makeRoot();
    const outsidePath = path.join(root, "outside", "notes.md");
    const toolCall = loadExtension();

    const result = (await toolCall(
      { toolName: "read", input: { path: outsidePath } },
      ctx(root, false),
    )) as { block?: boolean; reason?: string } | undefined;

    assert.equal(result?.block, true, "no-UI call outside a workspace must be blocked");
    assert.match(result?.reason ?? "", /Unknown Path requires confirmation/);
  });

  it("lets the same no-UI call proceed once the path is remembered", async () => {
    const root = await makeRoot();
    const outsidePath = path.join(root, "outside", "notes.md");
    await rememberUnknownPathAllow(root, outsidePath);
    const toolCall = loadExtension();

    const result = await toolCall(
      { toolName: "read", input: { path: outsidePath } },
      ctx(root, false),
    );

    assert.equal(result, undefined, "a remembered allow must not require UI confirmation");
  });

  it("still blocks a no-UI bash call outside every workspace when no remembered allow matches", async () => {
    const root = await makeRoot();
    const toolCall = loadExtension();

    const result = (await toolCall(
      { toolName: "bash", input: { command: "cd ../outside && ls" } },
      ctx(root, false),
    )) as { block?: boolean; reason?: string } | undefined;

    assert.equal(result?.block, true, "no-UI bash call outside a workspace must be blocked");
  });

  it("blocks when the UI prompt is answered with No or dismissed", async () => {
    const root = await makeRoot();
    const outsidePath = path.join(root, "outside", "notes.md");
    const toolCall = loadExtension();

    const noAnswer = (await toolCall(
      { toolName: "read", input: { path: outsidePath } },
      ctx(root, true, () => "No"),
    )) as { block?: boolean } | undefined;
    assert.equal(noAnswer?.block, true);

    const dismissed = (await toolCall(
      { toolName: "read", input: { path: outsidePath } },
      ctx(root, true, () => undefined),
    )) as { block?: boolean } | undefined;
    assert.equal(dismissed?.block, true);
  });
});

describe("docs/usage.md qualifies the no-UI Unknown Path block", () => {
  it("asserts the qualifier in the introduction, the bullet list and the Guard table", async () => {
    const usage = (await readFile("docs/usage.md", "utf8")).replace(/\r\n/g, "\n");
    const index = (await readFile("index.ts", "utf8")).replace(/\r\n/g, "\n");

    assert.match(
      index,
      /const storedAllows = await loadUnknownPathAllows\(loaded\.root\);\n  if \(storedAllows\.has\(normalized\)\) return undefined;\n  if \(!ctx\.hasUI\)/,
      "guard must consult remembered allows before the no-UI block",
    );

    assert.match(
      usage,
      /^When a guarded call targets a path outside every configured workspace and no remembered allow matches, Monofold asks in the UI:/m,
      "introduction must state the remembered-allow precondition for the prompt",
    );
    assert.match(
      usage,
      /^\- `No` or closing the prompt blocks the call\.$/m,
      "bullet list must keep the No/incomplete-prompt block",
    );
    assert.match(
      usage,
      /^\- Running without UI blocks the call only when no remembered allow matches;/m,
      "bullet list must qualify the no-UI block",
    );
    assert.match(
      usage,
      /^\| Unknown path \| Confirm in UI; block without UI only when no remembered allow matches \|$/m,
      "Guard table row must qualify the no-UI block",
    );

    assert.doesNotMatch(
      usage,
      /^\| Unknown path \| Confirm in UI; block without UI \|$/m,
      "Guard table must not keep the unqualified no-UI block claim",
    );
    assert.doesNotMatch(
      usage,
      /`No`, closing the prompt, or running without UI blocks the call\./,
      "docs must not keep the unqualified no-UI block sentence",
    );
  });
});
