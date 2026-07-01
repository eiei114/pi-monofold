import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearActiveFocusPresetId,
  countMatchingWorkspaces,
  cycleActiveFocusPresetBackward,
  cycleActiveFocusPresetForward,
  ensureActiveFocusInitialized,
  getActiveFocusPresetId,
  parseFocusPresets,
  pickDefaultFocusPresetId,
  resetActiveFocusSessionState,
  setActiveFocusPresetByLabel,
  setActiveFocusPresetId,
  validateFocusPresetsAgainstWorkspaces,
  warnZeroTargetMatchesForPreset,
} from "../focus-preset.js";

const samplePresets = parseFocusPresets([
  {
    id: "control",
    label: "Control",
    targets: [{ targetTags: ["control"] }],
  },
  {
    id: "docs",
    label: "Docs",
    targets: [{ targetTags: ["markdown", "planning"] }],
  },
]);

describe("parseFocusPresets", () => {
  it("accepts a valid preset list", () => {
    assert.deepEqual(samplePresets, [
      {
        id: "control",
        label: "Control",
        targets: [{ targetTags: ["control"] }],
      },
      {
        id: "docs",
        label: "Docs",
        targets: [{ targetTags: ["markdown", "planning"] }],
      },
    ]);
  });

  it("rejects duplicate preset ids", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          { id: "control", label: "A", targets: [{ targetTags: ["a"] }] },
          { id: "control", label: "B", targets: [{ targetTags: ["b"] }] },
        ]),
      /duplicate preset id: control/,
    );
  });

  it("accepts optional defaultRouteOverride", () => {
    assert.deepEqual(
      parseFocusPresets([
        {
          id: "docs",
          label: "Docs",
          defaultRouteOverride: "progress",
          targets: [{ targetTags: ["docs"] }],
        },
      ]),
      [
        {
          id: "docs",
          label: "Docs",
          defaultRouteOverride: "progress",
          targets: [{ targetTags: ["docs"] }],
        },
      ],
    );
  });

  it("rejects unknown defaultRouteOverride values", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "docs",
            label: "Docs",
            defaultRouteOverride: "notes",
            targets: [{ targetTags: ["docs"] }],
          },
        ]),
      /must be one of/,
    );
  });

  it("accepts optional decisionNoteDestination", () => {
    assert.deepEqual(
      parseFocusPresets([
        {
          id: "control",
          label: "Control",
          decisionNoteDestination: {
            targetTags: ["control"],
            path: "Decisions/ACTIVE.md",
          },
          targets: [{ targetTags: ["control"] }],
        },
      ]),
      [
        {
          id: "control",
          label: "Control",
          decisionNoteDestination: {
            targetTags: ["control"],
            path: "Decisions/ACTIVE.md",
          },
          targets: [{ targetTags: ["control"] }],
        },
      ],
    );
  });

  it("accepts optional focusSkills", () => {
    assert.deepEqual(
      parseFocusPresets([
        {
          id: "control",
          label: "Control",
          focusSkills: ["commit", "review"],
          targets: [{ targetTags: ["control"] }],
        },
      ]),
      [
        {
          id: "control",
          label: "Control",
          focusSkills: ["commit", "review"],
          targets: [{ targetTags: ["control"] }],
        },
      ],
    );
  });

  it("rejects unknown preset keys", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "control",
            label: "Control",
            extra: true,
            targets: [{ targetTags: ["control"] }],
          },
        ]),
      /unknown key: extra/,
    );
  });

  it("rejects unknown target keys", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "control",
            label: "Control",
            targets: [{ targetTags: ["control"], workspaceName: "Docs" }],
          },
        ]),
      /unknown key: workspaceName/,
    );
  });

  it("rejects presets with empty targets", () => {
    assert.throws(
      () => parseFocusPresets([{ id: "control", label: "Control", targets: [] }]),
      /targets must be a non-empty array/,
    );
  });

  it("rejects targets with no tags after dedupe", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "empty",
            label: "Empty",
            targets: [{ targetTags: [] }],
          },
        ]),
      /targetTags must contain at least one non-empty string/,
    );
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "control",
            label: "Control",
            targets: [{ targetTags: ["", ""] }],
          },
        ]),
      /targetTags must contain at least one non-empty string/,
    );
  });

  it("dedupes target tags and rejects empty deduped targets", () => {
    assert.deepEqual(
      parseFocusPresets([
        { id: "control", label: "Control", targets: [{ targetTags: ["control", "", "control"] }] },
      ]),
      [{ id: "control", label: "Control", targets: [{ targetTags: ["control"] }] }],
    );
    assert.throws(
      () => parseFocusPresets([{ id: "empty", label: "Empty", targets: [{ targetTags: [""] }] }]),
      /targetTags must contain at least one non-empty string/,
    );
  });
});

describe("active focus session state", () => {
  beforeEach(() => {
    resetActiveFocusSessionState();
  });

  it("defaults to the first preset when focusPresets is non-empty", () => {
    ensureActiveFocusInitialized(samplePresets);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("leaves active focus unset when focusPresets is empty", () => {
    ensureActiveFocusInitialized([]);
    assert.equal(getActiveFocusPresetId(), null);
  });

  it("supports set and clear without persisting across resets", () => {
    ensureActiveFocusInitialized(samplePresets);
    setActiveFocusPresetId("docs", samplePresets);
    assert.equal(getActiveFocusPresetId(), "docs");
    clearActiveFocusPresetId();
    assert.equal(getActiveFocusPresetId(), null);
    resetActiveFocusSessionState();
    ensureActiveFocusInitialized(samplePresets);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("rejects unknown preset ids on set", () => {
    assert.throws(() => setActiveFocusPresetId("missing", samplePresets), /Unknown focus preset id/);
  });

  it("cycles active focus forward in YAML order", () => {
    ensureActiveFocusInitialized(samplePresets);
    assert.equal(getActiveFocusPresetId(), "control");

    const firstCycle = cycleActiveFocusPresetForward(samplePresets);
    assert.equal(firstCycle?.preset.id, "docs");
    assert.equal(firstCycle?.index, 1);
    assert.equal(firstCycle?.total, 2);
    assert.equal(firstCycle?.changed, true);
    assert.equal(getActiveFocusPresetId(), "docs");

    const secondCycle = cycleActiveFocusPresetForward(samplePresets);
    assert.equal(secondCycle?.preset.id, "control");
    assert.equal(secondCycle?.index, 0);
    assert.equal(secondCycle?.changed, true);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("cycles active focus backward in YAML order with wrap-around", () => {
    ensureActiveFocusInitialized(samplePresets);
    assert.equal(getActiveFocusPresetId(), "control");

    const firstCycle = cycleActiveFocusPresetBackward(samplePresets);
    assert.equal(firstCycle?.preset.id, "docs");
    assert.equal(firstCycle?.index, 1);
    assert.equal(firstCycle?.total, 2);
    assert.equal(firstCycle?.changed, true);
    assert.equal(getActiveFocusPresetId(), "docs");

    const secondCycle = cycleActiveFocusPresetBackward(samplePresets);
    assert.equal(secondCycle?.preset.id, "control");
    assert.equal(secondCycle?.index, 0);
    assert.equal(secondCycle?.changed, true);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("selects the last preset when cycling backward without an active focus", () => {
    resetActiveFocusSessionState();
    clearActiveFocusPresetId();

    const result = cycleActiveFocusPresetBackward(samplePresets);
    assert.equal(result?.preset.id, "docs");
    assert.equal(result?.index, 1);
    assert.equal(result?.changed, true);
    assert.equal(getActiveFocusPresetId(), "docs");
  });

  it("selects the first preset when cycling forward without an active focus", () => {
    resetActiveFocusSessionState();
    clearActiveFocusPresetId();

    const result = cycleActiveFocusPresetForward(samplePresets);
    assert.equal(result?.preset.id, "control");
    assert.equal(result?.index, 0);
    assert.equal(result?.changed, true);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("keeps single-preset backward cycle as a no-op", () => {
    const [onlyPreset] = samplePresets;
    const result = cycleActiveFocusPresetBackward([onlyPreset!]);
    assert.equal(result?.preset.id, "control");
    assert.equal(result?.index, 0);
    assert.equal(result?.total, 1);
    assert.equal(result?.changed, false);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("keeps single-preset forward cycle as a no-op", () => {
    const [onlyPreset] = samplePresets;
    const result = cycleActiveFocusPresetForward([onlyPreset!]);
    assert.equal(result?.preset.id, "control");
    assert.equal(result?.index, 0);
    assert.equal(result?.total, 1);
    assert.equal(result?.changed, false);
    assert.equal(getActiveFocusPresetId(), "control");
  });

  it("sets active focus from a select-driven label", () => {
    const position = setActiveFocusPresetByLabel("Docs", samplePresets);
    assert.equal(position.preset.id, "docs");
    assert.equal(position.index, 1);
    assert.equal(position.total, 2);
    assert.equal(getActiveFocusPresetId(), "docs");
  });
});

const sampleWorkspaces = [
  {
    targetId: "#0",
    name: "Control",
    tags: ["control"],
    capabilities: ["read"],
    routeTypes: [] as string[],
  },
  {
    targetId: "#1",
    name: "Docs",
    tags: ["markdown", "planning"],
    capabilities: ["read", "writeDocs"],
    routeTypes: ["default", "progress"],
  },
];

describe("validateFocusPresetsAgainstWorkspaces", () => {
  it("accepts valid presets against configured workspaces", () => {
    assert.doesNotThrow(() => validateFocusPresetsAgainstWorkspaces(samplePresets, sampleWorkspaces));
  });

  it("rejects missing workspace targets", () => {
    assert.throws(
      () =>
        validateFocusPresetsAgainstWorkspaces(
          [
            {
              id: "broken",
              label: "Broken",
              targets: [{ targetTags: ["missing-tag"] }],
            },
          ],
          sampleWorkspaces,
        ),
      /matches no workspace target in preset "broken"/,
    );
  });

  it("rejects duplicate targetTags in one preset", () => {
    assert.throws(
      () =>
        validateFocusPresetsAgainstWorkspaces(
          [
            {
              id: "dup",
              label: "Dup",
              targets: [{ targetTags: ["control"] }, { targetTags: ["control"] }],
            },
          ],
          sampleWorkspaces,
        ),
      /duplicates targetTags \[control\]/,
    );
  });

  it("rejects overlapping target selectors that match the same workspace", () => {
    assert.throws(
      () =>
        validateFocusPresetsAgainstWorkspaces(
          [
            {
              id: "overlap",
              label: "Overlap",
              targets: [{ targetTags: ["markdown", "planning"] }, { targetTags: ["markdown"] }],
            },
          ],
          sampleWorkspaces,
        ),
      /both match workspace #1 \(Docs\)/,
    );
  });

  it("rejects defaultRouteOverride when matched workspace lacks writeDocs", () => {
    assert.throws(
      () =>
        validateFocusPresetsAgainstWorkspaces(
          [
            {
              id: "control",
              label: "Control",
              defaultRouteOverride: "progress",
              targets: [{ targetTags: ["control"] }],
            },
          ],
          sampleWorkspaces,
        ),
      /requires writeDocs on #0/,
    );
  });

  it("rejects defaultRouteOverride when matched workspace lacks the route", () => {
    assert.throws(
      () =>
        validateFocusPresetsAgainstWorkspaces(
          [
            {
              id: "docs",
              label: "Docs",
              defaultRouteOverride: "design",
              targets: [{ targetTags: ["markdown", "planning"] }],
            },
          ],
          sampleWorkspaces,
        ),
      /requires route "design" on #1/,
    );
  });
});

describe("runtime target matching", () => {
  it("warns when a target matches zero workspaces", () => {
    const warnings: string[] = [];
    warnZeroTargetMatchesForPreset(
      {
        id: "control",
        label: "Control",
        targets: [{ targetTags: ["missing-tag"] }],
      },
      [{ tags: ["control", "markdown"] }],
      (message) => warnings.push(message),
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /matches no configured workspace/);
  });

  it("does not warn when at least one workspace matches", () => {
    const warnings: string[] = [];
    warnZeroTargetMatchesForPreset(
      {
        id: "control",
        label: "Control",
        targets: [{ targetTags: ["control"] }],
      },
      [{ tags: ["control"] }],
      (message) => warnings.push(message),
    );
    assert.equal(warnings.length, 0);
    assert.equal(countMatchingWorkspaces([{ tags: ["control"] }], ["control"]), 1);
  });
});

describe("countMatchingWorkspaces", () => {
  it("returns zero when no workspaces match", () => {
    assert.equal(
      countMatchingWorkspaces([{ tags: ["control"] }, { tags: ["docs"] }], ["planning"]),
      0,
    );
  });

  it("counts multiple matching workspaces", () => {
    assert.equal(
      countMatchingWorkspaces([{ tags: ["control"] }, { tags: ["control", "docs"] }, { tags: ["docs"] }], ["control"]),
      2,
    );
  });

  it("returns zero for an empty workspace list", () => {
    assert.equal(countMatchingWorkspaces([], ["control"]), 0);
  });

  it("returns zero for empty target tags", () => {
    assert.equal(countMatchingWorkspaces([{ tags: ["control"] }], []), 0);
  });
});

describe("pickDefaultFocusPresetId", () => {
  it("returns null for empty or undefined presets", () => {
    assert.equal(pickDefaultFocusPresetId(undefined), null);
    assert.equal(pickDefaultFocusPresetId([]), null);
  });
});
