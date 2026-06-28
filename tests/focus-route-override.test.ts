import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertMonofoldRouteType,
  parseDefaultRouteOverride,
  resolveWriteRouteType,
} from "../focus-route-override.js";

describe("assertMonofoldRouteType", () => {
  it("accepts known route types", () => {
    assert.equal(assertMonofoldRouteType("route", "progress"), "progress");
  });

  it("rejects unknown route types with actionable errors", () => {
    assert.throws(() => assertMonofoldRouteType("route", "notes"), /must be one of:.*progress/);
  });
});

describe("parseDefaultRouteOverride", () => {
  it("returns undefined when omitted", () => {
    assert.equal(parseDefaultRouteOverride("focusPresets[0]", undefined), undefined);
  });

  it("parses and trims valid route overrides", () => {
    assert.equal(parseDefaultRouteOverride("focusPresets[0]", " design "), "design");
  });

  it("rejects empty strings", () => {
    assert.throws(() => parseDefaultRouteOverride("focusPresets[0]", ""), /non-empty string/);
  });

  it("rejects unknown route values", () => {
    assert.throws(() => parseDefaultRouteOverride("focusPresets[0]", "notes"), /must be one of/);
  });
});

describe("resolveWriteRouteType", () => {
  it("prefers explicit route selection", () => {
    assert.equal(resolveWriteRouteType("prd", "progress"), "prd");
  });

  it("uses focus default when route is omitted", () => {
    assert.equal(resolveWriteRouteType(undefined, "research"), "research");
  });

  it("falls back to default when no override is configured", () => {
    assert.equal(resolveWriteRouteType(undefined, undefined), "default");
  });

  it("rejects invalid explicit routes", () => {
    assert.throws(() => resolveWriteRouteType("bogus", "progress"), /must be one of/);
  });
});
