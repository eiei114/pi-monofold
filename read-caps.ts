export const DEFAULT_MAX_MATCHES = 50;
export const DEFAULT_MAX_CHARS = 8_000;
export const DEFAULT_MAX_ENTRIES = 200;

export type ResolvedSearchCaps = {
  maxMatches: number;
  maxChars: number;
};

export type ResolvedTreeCaps = {
  maxEntries: number;
};

export type SearchCapResult = {
  text: string;
  matchCount: number;
  returnedMatchCount: number;
  maxMatches: number;
  maxChars: number;
  truncated: boolean;
  hint?: string;
};

export type TreeCapResult = {
  text: string;
  entryCount: number;
  returnedEntryCount: number;
  maxEntries: number;
  truncated: boolean;
  hint?: string;
};

function assertPositiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function resolveSearchCaps(input?: { maxMatches?: number; maxChars?: number }): ResolvedSearchCaps {
  return {
    maxMatches: input?.maxMatches === undefined ? DEFAULT_MAX_MATCHES : assertPositiveInt("maxMatches", input.maxMatches),
    maxChars: input?.maxChars === undefined ? DEFAULT_MAX_CHARS : assertPositiveInt("maxChars", input.maxChars),
  };
}

export function resolveTreeCaps(input?: { maxEntries?: number }): ResolvedTreeCaps {
  return {
    maxEntries:
      input?.maxEntries === undefined ? DEFAULT_MAX_ENTRIES : assertPositiveInt("maxEntries", input.maxEntries),
  };
}

export function searchTruncationHint(matchCount: number, returnedMatchCount: number, caps: ResolvedSearchCaps): string {
  return (
    `[truncated: showing ${returnedMatchCount} of ${matchCount} matches ` +
    `(maxMatches=${caps.maxMatches}, maxChars=${caps.maxChars}). ` +
    "Narrow path/query or pass higher maxMatches/maxChars intentionally.]"
  );
}

export function treeTruncationHint(entryCount: number, returnedEntryCount: number, caps: ResolvedTreeCaps): string {
  return (
    `[truncated: showing ${returnedEntryCount} of ${entryCount} entries ` +
    `(maxEntries=${caps.maxEntries}). ` +
    "Narrow path/depth or pass a higher maxEntries intentionally.]"
  );
}

export function capSearchOutput(rawOutput: string, caps: ResolvedSearchCaps): SearchCapResult {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    return {
      text: "No matches",
      matchCount: 0,
      returnedMatchCount: 0,
      maxMatches: caps.maxMatches,
      maxChars: caps.maxChars,
      truncated: false,
    };
  }

  const lines = trimmed.split("\n");
  const matchCount = lines.length;
  const matchLimited = lines.slice(0, caps.maxMatches);
  let truncated = matchLimited.length < matchCount;

  const charLimited: string[] = [];
  let charTotal = 0;
  for (const line of matchLimited) {
    const separator = charLimited.length > 0 ? 1 : 0;
    if (charTotal + separator + line.length > caps.maxChars) {
      truncated = true;
      break;
    }
    charLimited.push(line);
    charTotal += separator + line.length;
  }

  const returnedMatchCount = charLimited.length;
  const hint = truncated ? searchTruncationHint(matchCount, returnedMatchCount, caps) : undefined;
  const body = charLimited.join("\n");
  const text = hint ? `${body}\n\n${hint}` : body;

  return {
    text,
    matchCount,
    returnedMatchCount,
    maxMatches: caps.maxMatches,
    maxChars: caps.maxChars,
    truncated,
    hint,
  };
}

export function capTreeLines(lines: string[], caps: ResolvedTreeCaps): TreeCapResult {
  const entryCount = lines.length;
  const limited = lines.slice(0, caps.maxEntries);
  const truncated = limited.length < entryCount;
  const returnedEntryCount = limited.length;
  const hint = truncated ? treeTruncationHint(entryCount, returnedEntryCount, caps) : undefined;
  const body = limited.join("\n");
  const text = hint ? `${body}\n\n${hint}` : body;

  return {
    text,
    entryCount,
    returnedEntryCount,
    maxEntries: caps.maxEntries,
    truncated,
    hint,
  };
}
