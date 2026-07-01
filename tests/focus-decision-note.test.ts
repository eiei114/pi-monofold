import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  findDecisionNoteWorkspace,
  formatDecisionNoteDestinationLabel,
  parseDecisionNoteDestination,
  resetDecisionNoteWarningState,
  validateDecisionNoteDestinationAgainstWorkspaces,
  warnUnavailableDecisionNoteDestination,
} from "../focus-decision-note.js";

const sampleWorkspaces = [
  {
    targetId: "#0",
    name: "Control",
    tags: ["control", "markdown"],
    capabilities: ["read", "writeDocs"],
  },
  {
    targetId: "#1",
    name: "Project",
    tags: ["project", "pi-monofold"],
    capabilities: ["read", "writeDocs"],
  },
];

describe("parseDecisionNoteDestination", () => {
  it("accepts a valid destination", () => {
    assert.deepEqual(parseDecisionNoteDestination("focusPresets[0]", {
      targetTags: ["control", "markdown"],
      path: "Decisions/ACTIVE.md",
    }), {
      targetTags: ["control", "markdown"],
      path: "Decisions/ACTIVE.md",
    });
  });

  it("rejects unknown keys", () => {
    assert.throws(
      () =>
        parseDecisionNoteDestination("focusPresets[0]", {
          targetTags: ["control"],
          path: "Decisions/ACTIVE.md",
          route: "decision",
        }),
      /unknown key: route/,
    );
  });

  it("rejects absolute paths", () => {
    assert.throws(
      () =>
        parseDecisionNoteDestination("focusPresets[0]", {
          targetTags: ["control"],
          path: "/tmp/note.md",
        }),
      /workspace-internal relative path/,
    );
  });
});

describe("validateDecisionNoteDestinationAgainstWorkspaces", () => {
  it("accepts a unique workspace match with read capability", () => {
    assert.doesNotThrow(() =>
      validateDecisionNoteDestinationAgainstWorkspaces(
        "focusPresets[0]",
        { targetTags: ["control"], path: "Decisions/ACTIVE.md" },
        sampleWorkspaces,
      ),
    );
  });

  it("rejects missing workspace matches", () => {
    assert.throws(
      () =>
        validateDecisionNoteDestinationAgainstWorkspaces(
          "focusPresets[0]",
          { targetTags: ["missing"], path: "Decisions/ACTIVE.md" },
          sampleWorkspaces,
        ),
      /matches no workspace target/,
    );
  });

  it("rejects ambiguous workspace matches", () => {
    const ambiguousWorkspaces = [
      { targetId: "#0", name: "A", tags: ["shared"], capabilities: ["read"] },
      { targetId: "#1", name: "B", tags: ["shared"], capabilities: ["read"] },
    ];
    assert.throws(
      () =>
        validateDecisionNoteDestinationAgainstWorkspaces(
          "focusPresets[0]",
          { targetTags: ["shared"], path: "Decisions/ACTIVE.md" },
          ambiguousWorkspaces,
        ),
      /ambiguous across workspaces/,
    );
  });
});

describe("findDecisionNoteWorkspace", () => {
  it("returns the single matching workspace", () => {
    const workspace = findDecisionNoteWorkspace(sampleWorkspaces, {
      targetTags: ["project", "pi-monofold"],
      path: "Progress/DECISIONS.md",
    });
    assert.equal(workspace?.targetId, "#1");
  });

  it("returns undefined when no unique match exists", () => {
    assert.equal(
      findDecisionNoteWorkspace(sampleWorkspaces, { targetTags: ["missing"], path: "x.md" }),
      undefined,
    );
  });
});

describe("warnUnavailableDecisionNoteDestination", () => {
  beforeEach(() => {
    resetDecisionNoteWarningState();
  });

  it("warns once per activation for missing files", () => {
    const warnings: string[] = [];
    const destination = { targetTags: ["control"], path: "Decisions/ACTIVE.md" };
    warnUnavailableDecisionNoteDestination("control", destination, "#0 Control", "missing-file", (message) =>
      warnings.push(message),
    );
    warnUnavailableDecisionNoteDestination("control", destination, "#0 Control", "missing-file", (message) =>
      warnings.push(message),
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /unavailable/);
  });

  it("warns for missing workspace matches", () => {
    const warnings: string[] = [];
    warnUnavailableDecisionNoteDestination(
      "control",
      { targetTags: ["missing"], path: "Decisions/ACTIVE.md" },
      "",
      "missing-workspace",
      (message) => warnings.push(message),
    );
    assert.match(warnings[0]!, /matches no configured workspace/);
  });
});

describe("formatDecisionNoteDestinationLabel", () => {
  it("formats workspace label and path", () => {
    assert.equal(
      formatDecisionNoteDestinationLabel("#0 Control", { targetTags: ["control"], path: "Decisions/ACTIVE.md" }),
      "#0 Control:Decisions/ACTIVE.md",
    );
  });
});
