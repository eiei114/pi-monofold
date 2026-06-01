/** Returns true when a value is a plain object record, excluding arrays and null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Throws when an object contains keys outside the supplied allow-list. */
export function assertKnownKeys(label: string, value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has unknown key: ${key}`);
  }
}

/** Coerces a required or optional unknown value to a string array with strict item validation. */
export function asStringArray(label: string, value: unknown, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

/** Removes empty strings and duplicate entries while preserving first-seen order. */
export function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
