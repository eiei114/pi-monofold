/** Monofold route types available for routed Markdown writes. */
export const MONOFOLD_ROUTE_TYPES = [
  "default",
  "prd",
  "design",
  "progress",
  "issue",
  "research",
  "decision",
] as const;

export type MonofoldRouteType = (typeof MONOFOLD_ROUTE_TYPES)[number];

const ROUTE_TYPE_SET = new Set<string>(MONOFOLD_ROUTE_TYPES);

/** Validates a route type string and returns the typed value. */
export function assertMonofoldRouteType(label: string, value: string): MonofoldRouteType {
  if (!ROUTE_TYPE_SET.has(value)) {
    throw new Error(
      `${label} must be one of: ${MONOFOLD_ROUTE_TYPES.join(", ")} (got: ${value})`,
    );
  }
  return value as MonofoldRouteType;
}

/** Parses an optional defaultRouteOverride from preset config. */
export function parseDefaultRouteOverride(itemLabel: string, value: unknown): MonofoldRouteType | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${itemLabel}.defaultRouteOverride must be a non-empty string`);
  }
  return assertMonofoldRouteType(`${itemLabel}.defaultRouteOverride`, value.trim());
}

/** Resolves the effective write route: explicit selection wins over Focus default, then "default". */
export function resolveWriteRouteType(
  explicitRoute: string | undefined,
  defaultRouteOverride: MonofoldRouteType | undefined,
): MonofoldRouteType {
  if (explicitRoute !== undefined && explicitRoute !== "") {
    return assertMonofoldRouteType("routeType", explicitRoute);
  }
  return defaultRouteOverride ?? "default";
}
