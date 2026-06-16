import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import piMultiWorkspace, {
  FOCUS_CONTEXT_MAX_FILES,
  FOCUS_CONTEXT_MAX_CHARS_PER_FILE,
  FOCUS_CONTEXT_MAX_TOTAL_CHARS,
} from "../index.js";
import { clearActiveFocusPresetId, resetActiveFocusSessionState } from "../focus-preset.js";

type BeforeAgentStartHandler = (event: { systemPrompt: string }, ctx: any) => Promise<{ systemPrompt: string } | undefined>;

function loadBeforeAgentStart() {
  const handlers = new Map<string, Function[]>();
  piMultiWorkspace({
    on(name: string, handler: Function) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool() {},
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  const handler = handlers.get("before_agent_start")?.[0] as BeforeAgentStartHandler | undefined;
  assert.ok(handler);
  return handler;
}

async function makeRoot(config: string) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-context-"));
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await writeFile(path.join(root, ".pi", "monofold.yaml"), config, "utf8");
  return root;
}

async function runBeforeAgentStart(root: string) {
  const notifications: string[] = [];
  const result = await loadBeforeAgentStart()(
    { systemPrompt: "base prompt" },
    {
      cwd: root,
      hasUI: true,
      ui: {
        notify: (message: string) => notifications.push(message),
      },
    },
  );
  assert.ok(result);
  return { prompt: result.systemPrompt, notifications };
}

describe("focus context injection and manifest recomposition", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  it("injects active focus context files and collapses non-active manifest entries", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control Focus
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read]
    contextFiles: [AGENTS.md]
  - name: Docs
    path: ./docs
    tags: [docs]
    capabilities: [read]
    contextFiles: [DOCS.md]
`);
    await mkdir(path.join(root, "control"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "control", "AGENTS.md"), "control guidance", "utf8");
    await writeFile(path.join(root, "docs", "DOCS.md"), "docs guidance", "utf8");

    const { prompt } = await runBeforeAgentStart(root);

    assert.match(prompt, /## Focus Context Injection/);
    assert.match(prompt, /Active Focus: Control Focus \(control\)/);
    assert.match(prompt, /### #0 Control: AGENTS\.md/);
    assert.match(prompt, /control guidance/);
    assert.doesNotMatch(prompt, /docs guidance/);
    assert.match(prompt, /#0 Control \[control\] \.\/control \(active\)/);
    assert.match(prompt, /Non-active Workspace Targets \(collapsed\):\n- #1 Docs \[docs\] \.\/docs/);
    assert.ok(prompt.indexOf("(active)") < prompt.indexOf("Non-active Workspace Targets"));
  });

  it("keeps the full manifest and skips injection when active focus is cleared", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control Focus
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read]
    contextFiles: [AGENTS.md]
`);
    await mkdir(path.join(root, "control"), { recursive: true });
    await writeFile(path.join(root, "control", "AGENTS.md"), "control guidance", "utf8");
    clearActiveFocusPresetId();

    const { prompt } = await runBeforeAgentStart(root);

    assert.doesNotMatch(prompt, /## Focus Context Injection/);
    assert.doesNotMatch(prompt, /\(active\)/);
    assert.match(prompt, /contextFiles: AGENTS\.md/);
  });

  it("enforces per-file truncation and total injection cap with one notification", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control Focus
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read]
    contextFiles: [a.md, b.md, c.md]
`);
    await mkdir(path.join(root, "control"), { recursive: true });
    await writeFile(path.join(root, "control", "a.md"), "A".repeat(FOCUS_CONTEXT_MAX_CHARS_PER_FILE + 100), "utf8");
    await writeFile(path.join(root, "control", "b.md"), "B".repeat(FOCUS_CONTEXT_MAX_CHARS_PER_FILE + 100), "utf8");
    await writeFile(path.join(root, "control", "c.md"), "third-file-should-not-appear", "utf8");

    const { prompt, notifications } = await runBeforeAgentStart(root);

    assert.equal((prompt.match(/… \[truncated\]/g) ?? []).length, 2);
    assert.match(prompt, new RegExp(`Skipped 1 context file\\(s\\) after the ${FOCUS_CONTEXT_MAX_TOTAL_CHARS}-character total cap`));
    assert.doesNotMatch(prompt, /third-file-should-not-appear/);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]!, /total cap/);
  });

  it("skips files beyond the provisional file-count cap", async () => {
    const contextFiles = Array.from({ length: FOCUS_CONTEXT_MAX_FILES + 1 }, (_, index) => `f${index + 1}.md`);
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control Focus
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: ./control
    tags: [control]
    capabilities: [read]
    contextFiles: [${contextFiles.join(", ")}]
`);
    await mkdir(path.join(root, "control"), { recursive: true });
    for (const file of contextFiles) {
      await writeFile(path.join(root, "control", file), `content for ${file}`, "utf8");
    }

    const { prompt } = await runBeforeAgentStart(root);

    assert.equal((prompt.match(/^### /gm) ?? []).length, FOCUS_CONTEXT_MAX_FILES);
    assert.match(prompt, new RegExp(`Skipped 1 context file\\(s\\) after the ${FOCUS_CONTEXT_MAX_FILES}-file cap`));
    assert.doesNotMatch(prompt, new RegExp(`content for f${FOCUS_CONTEXT_MAX_FILES + 1}\\.md`));
  });
});
