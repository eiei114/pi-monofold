import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFocusSkillsToSystemPrompt,
  findMissingFocusSkills,
  parseFocusSkills,
  resolveFocusSkills,
  stripSkillsSectionFromSystemPrompt,
  warnMissingFocusSkills,
  resetFocusSkillsWarningState,
  FOCUS_SKILLS_MAX_COUNT,
} from "../focus-skills.js";
import type { Skill } from "@earendil-works/pi-coding-agent";

const sampleSkills: Skill[] = [
  {
    name: "commit",
    description: "Commit helper",
    filePath: "/skills/commit/SKILL.md",
    baseDir: "/skills/commit",
    sourceInfo: { path: "/skills/commit/SKILL.md", source: "user", scope: "user", origin: "top-level" },
    disableModelInvocation: false,
  },
  {
    name: "review",
    description: "Review helper",
    filePath: "/skills/review/SKILL.md",
    baseDir: "/skills/review",
    sourceInfo: { path: "/skills/review/SKILL.md", source: "user", scope: "user", origin: "top-level" },
    disableModelInvocation: false,
  },
];

const skillsBlock = `\n\nThe following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>commit</name>
    <description>Commit helper</description>
    <location>/skills/commit/SKILL.md</location>
  </skill>
</available_skills>`;

describe("parseFocusSkills", () => {
  it("accepts a bounded unique list", () => {
    assert.deepEqual(parseFocusSkills("focusPresets[0]", ["commit", "review"]), ["commit", "review"]);
  });

  it("rejects empty names and invalid characters", () => {
    assert.throws(() => parseFocusSkills("focusPresets[0]", [""]), /empty skill names/);
    assert.throws(() => parseFocusSkills("focusPresets[0]", ["Bad_Name"]), /lowercase letters/);
  });

  it("rejects duplicates and lists above the cap", () => {
    assert.throws(() => parseFocusSkills("focusPresets[0]", ["commit", "commit"]), /duplicate skill name/);
    const tooMany = Array.from({ length: FOCUS_SKILLS_MAX_COUNT + 1 }, (_, i) => `skill-${i}`);
    assert.throws(() => parseFocusSkills("focusPresets[0]", tooMany), /at most 6/);
  });
});

describe("resolveFocusSkills", () => {
  it("returns only declared skills that exist in inventory", () => {
    assert.deepEqual(resolveFocusSkills(sampleSkills, ["commit", "missing"]), [sampleSkills[0]]);
  });

  it("returns empty when focusSkills is undefined", () => {
    assert.deepEqual(resolveFocusSkills(sampleSkills, undefined), []);
  });
});

describe("findMissingFocusSkills", () => {
  it("reports unknown names", () => {
    assert.deepEqual(findMissingFocusSkills(["commit", "missing"], sampleSkills), ["missing"]);
  });
});

describe("applyFocusSkillsToSystemPrompt", () => {
  it("leaves the prompt unchanged when focusSkills is undefined", () => {
    const prompt = `base${skillsBlock}`;
    assert.equal(applyFocusSkillsToSystemPrompt(prompt, sampleSkills, undefined), prompt);
  });

  it("strips default skills and injects only declared skills", () => {
    const prompt = `base${skillsBlock}`;
    const result = applyFocusSkillsToSystemPrompt(prompt, sampleSkills, ["review"]);
    assert.doesNotMatch(result, /<name>commit<\/name>/);
    assert.match(result, /<name>review<\/name>/);
    assert.match(result, /^base/);
  });

  it("removes skills entirely for an explicit empty list", () => {
    const prompt = `base${skillsBlock}`;
    const result = applyFocusSkillsToSystemPrompt(prompt, sampleSkills, []);
    assert.equal(result, "base");
    assert.doesNotMatch(result, /<available_skills>/);
  });

  it("strips the default catalog when every declared name is missing from inventory", () => {
    const prompt = `base${skillsBlock}`;
    const result = applyFocusSkillsToSystemPrompt(prompt, sampleSkills, ["missing-a", "missing-b"]);
    assert.equal(result, "base");
    assert.doesNotMatch(result, /<available_skills>/);
    assert.doesNotMatch(result, /<name>commit<\/name>/);
  });
});

describe("stripSkillsSectionFromSystemPrompt", () => {
  it("removes the available skills block when present", () => {
    assert.equal(stripSkillsSectionFromSystemPrompt(`hello${skillsBlock}`), "hello");
  });
});

describe("warnMissingFocusSkills", () => {
  it("warns once per activation for missing skills", () => {
    resetFocusSkillsWarningState();
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    warnMissingFocusSkills("control", ["missing"], sampleSkills, warn);
    warnMissingFocusSkills("control", ["missing"], sampleSkills, warn);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /missing/);
  });
});
