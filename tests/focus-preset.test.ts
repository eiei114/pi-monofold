import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearActiveFocusPresetId,
  countMatchingWorkspaces,
  ensureActiveFocusInitialized,
  getActiveFocusPresetId,
  parseFocusPresets,
  pickDefaultFocusPresetId,
  resetActiveFocusSessionState,
  setActiveFocusPresetId,
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

  it("rejects unknown preset keys", () => {
    assert.throws(
      () =>
        parseFocusPresets([
          {
            id: "control",
            label: "Control",
            focusSkills: ["ignored"],
            targets: [{ targetTags: ["control"] }],
          },
        ]),
      /unknown key: focusSkills/,
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

describe("pickDefaultFocusPresetId", () => {
  it("returns null for empty or undefined presets", () => {
    assert.equal(pickDefaultFocusPresetId(undefined), null);
    assert.equal(pickDefaultFocusPresetId([]), null);
  });
});
