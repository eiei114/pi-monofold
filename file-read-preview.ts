export const DEFAULT_PREVIEW_LINES = 20;
export const DEFAULT_PREVIEW_CHARS = 2_000;

export type FileReadOptions = {
  includeContent?: boolean;
  maxChars?: number;
  head?: number;
  tail?: number;
};

export type FileReadFileStat = {
  size: number;
  mtime: Date;
};

export type FileReadDetails = {
  byteSize: number;
  characterCount: number;
  lineCount: number;
  modifiedTime: string;
  truncated: boolean;
  previewLineCount: number;
  previewCharacterCount: number;
  includeContent: boolean;
  maxChars?: number;
  head?: number;
  tail?: number;
};

export type FileReadResponse = {
  text: string;
  details: FileReadDetails;
};

export function assertPositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [""];
  }
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "" && (content.endsWith("\n") || content.endsWith("\r"))) {
    lines.pop();
  }
  return lines.length === 0 ? [""] : lines;
}

function takeHeadLines(lines: string[], count: number): string[] {
  return lines.slice(0, count);
}

function takeTailLines(lines: string[], count: number): string[] {
  if (count >= lines.length) {
    return lines;
  }
  return lines.slice(lines.length - count);
}

function truncateChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export function truncationHint(details: FileReadDetails): string {
  const parts: string[] = [];
  if (details.truncated) {
    parts.push(
      `Showing ${details.previewLineCount} of ${details.lineCount} lines and ${details.previewCharacterCount} of ${details.characterCount} characters.`,
    );
  }
  parts.push(
    "Pass includeContent: true for full content, or use head, tail, and/or maxChars for a larger bounded range.",
  );
  return parts.join(" ");
}

function buildHeadTailPreview(lines: string[], head: number | undefined, tail: number | undefined): string {
  const headCount = head ?? 0;
  const tailCount = tail ?? 0;
  if (headCount > 0 && tailCount > 0) {
    const headLines = takeHeadLines(lines, headCount);
    const tailLines = takeTailLines(lines, tailCount);
    if (headCount + tailCount >= lines.length) {
      return lines.join("\n");
    }
    const omitted = lines.length - headLines.length - tailLines.length;
    return [
      ...headLines,
      `... [${omitted} line${omitted === 1 ? "" : "s"} omitted] ...`,
      ...tailLines,
    ].join("\n");
  }
  if (headCount > 0) {
    return takeHeadLines(lines, headCount).join("\n");
  }
  if (tailCount > 0) {
    return takeTailLines(lines, tailCount).join("\n");
  }
  return takeHeadLines(lines, DEFAULT_PREVIEW_LINES).join("\n");
}

function resolveExplicitLimits(options: FileReadOptions): {
  includeContent: boolean;
  maxChars?: number;
  head?: number;
  tail?: number;
} {
  const includeContent = options.includeContent === true;
  const maxChars = options.maxChars === undefined ? undefined : assertPositiveInt(options.maxChars, "maxChars");
  const head = options.head === undefined ? undefined : assertPositiveInt(options.head, "head");
  const tail = options.tail === undefined ? undefined : assertPositiveInt(options.tail, "tail");
  return { includeContent, maxChars, head, tail };
}

export function buildFileReadResponse(
  content: string,
  options: FileReadOptions,
  fileStat: FileReadFileStat,
  context: { relativePath: string },
): FileReadResponse {
  const limits = resolveExplicitLimits(options);
  const lines = splitLines(content);
  const lineCount = lines.length;
  const characterCount = content.length;

  let previewText: string;
  let truncated: boolean;
  let previewLineCount: number;
  let previewCharacterCount: number;

  if (limits.includeContent && limits.maxChars === undefined && limits.head === undefined && limits.tail === undefined) {
    previewText = content;
    truncated = false;
    previewLineCount = lineCount;
    previewCharacterCount = characterCount;
  } else if (limits.head !== undefined || limits.tail !== undefined) {
    const headCount = limits.head ?? 0;
    const tailCount = limits.tail ?? 0;
    previewText = buildHeadTailPreview(lines, limits.head, limits.tail);
    const maxChars = limits.maxChars ?? Number.POSITIVE_INFINITY;
    const charResult = truncateChars(previewText, maxChars);
    previewText = charResult.text;
    const linesFullyShown =
      headCount + tailCount >= lineCount ||
      (headCount > 0 && tailCount === 0 && headCount >= lineCount) ||
      (tailCount > 0 && headCount === 0 && tailCount >= lineCount);
    truncated = charResult.truncated || !linesFullyShown;
    previewLineCount = previewText === "" ? 0 : previewText.split("\n").length;
    previewCharacterCount = previewText.length;
  } else if (limits.maxChars !== undefined) {
    const charResult = truncateChars(content, limits.maxChars);
    previewText = charResult.text;
    truncated = charResult.truncated || previewText.length < content.length;
    previewLineCount = previewText === "" ? 0 : previewText.split("\n").length;
    previewCharacterCount = previewText.length;
  } else {
    const defaultLines = takeHeadLines(lines, DEFAULT_PREVIEW_LINES);
    previewText = defaultLines.join("\n");
    const charResult = truncateChars(previewText, DEFAULT_PREVIEW_CHARS);
    previewText = charResult.text;
    truncated = charResult.truncated || defaultLines.length < lines.length;
    previewLineCount = previewText === "" ? 0 : previewText.split("\n").length;
    previewCharacterCount = previewText.length;
  }

  const details: FileReadDetails = {
    byteSize: fileStat.size,
    characterCount,
    lineCount,
    modifiedTime: fileStat.mtime.toISOString(),
    truncated,
    previewLineCount,
    previewCharacterCount,
    includeContent: limits.includeContent,
    ...(limits.maxChars === undefined ? {} : { maxChars: limits.maxChars }),
    ...(limits.head === undefined ? {} : { head: limits.head }),
    ...(limits.tail === undefined ? {} : { tail: limits.tail }),
  };

  const metadataLines = [
    `Path: ${context.relativePath}`,
    `Byte size: ${details.byteSize}`,
    `Characters: ${details.characterCount}`,
    `Lines: ${details.lineCount}`,
    `Modified: ${details.modifiedTime}`,
  ];

  const sections = [metadataLines.join("\n")];
  if (previewText.length > 0) {
    sections.push("", "--- preview ---", previewText);
  }
  if (truncated) {
    sections.push("", `[truncated] ${truncationHint(details)}`);
  }

  return {
    text: sections.join("\n"),
    details,
  };
}
