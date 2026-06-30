import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import type { Skill } from "@earendil-works/pi-coding-agent";
import piMultiWorkspace from "../index.js";
import { resetActiveFocusSessionState } from "../focus-preset.js";

type BeforeAgentStartHandler = (
  event: { systemPrompt: string; systemPromptOptions?: { skills?: Skill[] } },
  ctx: { cwd: string; hasUI: boolean; ui: { notify: (message: string) => void } },
) => Promise<{ systemPrompt: string } | undefined>;

const sampleSkills: Skill[] = [
  {
    name: "commit",
    description: "Commit helper",
    filePath: "/skills/commit/SKILL.md",
    baseDir: "/skills/commit",
    sourceInfo: { path: "/skills/commit/SKILL.md", source: "user", scope: "user", origin: "top-level" },
    disableModelInvocation: false,
  },
];

function loadExtension() {
  const handlers = new Map<string, Function[]>();
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  piMultiWorkspace({
    on(name: string, handler: Function) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(options: { name: string; execute: (...args: any[]) => Promise<any> }) {
      tools.set(options.name, options);
    },
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    sendUserMessage() {},
  } as any);
  const handler = handlers.get("before_agent_start")?.[0] as BeforeAgentStartHandler | undefined;
  assert.ok(handler);
  return { handler, tools };
}

function loadBeforeAgentStart() {
  return loadExtension().handler;
}

async function makeRoot(config: string) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-monofold-focus-skills-"));
  await mkdir(path.join(root, ".pi"), { recursive: true });
  await writeFile(path.join(root, ".pi", "monofold.yaml"), config, "utf8");
  return root;
}

describe("focus skills auto-load integration", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  it("does not filter skills when focusSkills is omitted", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: .
    tags: [control]
    capabilities: [read]
`);
    const handler = loadBeforeAgentStart();
    const result = await handler(
      {
        systemPrompt: "base prompt with skills",
        systemPromptOptions: { skills: sampleSkills },
      },
      { cwd: root, hasUI: true, ui: { notify: () => {} } },
    );
    assert.ok(result);
    assert.equal(result.systemPrompt.startsWith("base prompt with skills"), true);
  });

  it("injects only declared focus skills for the active preset", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control
    focusSkills: [commit]
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: .
    tags: [control]
    capabilities: [read]
`);
    const handler = loadBeforeAgentStart();
    const skillsBlock = `\n\nThe following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>other</name>
    <description>Other</description>
    <location>/skills/other/SKILL.md</location>
  </skill>
</available_skills>`;
    const result = await handler(
      {
        systemPrompt: `base${skillsBlock}`,
        systemPromptOptions: { skills: sampleSkills },
      },
      { cwd: root, hasUI: true, ui: { notify: () => {} } },
    );
    assert.ok(result);
    assert.match(result.systemPrompt, /<name>commit<\/name>/);
    assert.doesNotMatch(result.systemPrompt, /<name>other<\/name>/);
    assert.match(result.systemPrompt, /## Pi Monofold/);
  });

  it("warns when a declared focus skill is missing from inventory", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control
    focusSkills: [missing-skill]
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: .
    tags: [control]
    capabilities: [read]
`);
    const notifications: string[] = [];
    const handler = loadBeforeAgentStart();
    await handler(
      {
        systemPrompt: "base",
        systemPromptOptions: { skills: sampleSkills },
      },
      { cwd: root, hasUI: true, ui: { notify: (message) => notifications.push(message) } },
    );
    assert.equal(notifications.length, 1);
    assert.match(notifications[0], /missing-skill/);
  });

  it("includes declared focusSkills in monofold_list manifest output", async () => {
    const root = await makeRoot(`version: 1
focusPresets:
  - id: control
    label: Control
    focusSkills: [commit]
    targets:
      - targetTags: [control]
workspaces:
  - name: Control
    path: .
    tags: [control]
    capabilities: [read]
`);
    const { tools } = loadExtension();
    const list = tools.get("monofold_list");
    assert.ok(list);
    const result = await list.execute("1", {}, undefined, undefined, {
      cwd: root,
      hasUI: false,
      ui: { notify() {}, setStatus() {}, select: async () => undefined },
    });
    assert.match(result.content[0]!.text, /Focus skills: commit \(prompt filtered to declared names\)/);
    assert.match(result.content[0]!.text, /Focus health: ok/);
  });
});
