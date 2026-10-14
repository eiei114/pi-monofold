export const VERIFICATION_CONTRACT: "pi-sdk-behavior-v2";
export const REQUIRED_SDK_VERSIONS: Readonly<Record<string, string>>;

export function parseJsonLines(output: string): {
  records: Record<string, any>[];
  invalidLines: string[];
};
export function extensionRegistered(records: Record<string, any>[], id: string): {
  id: string;
  expected: string;
  observed: string;
  passed: boolean;
};
export function featureResponse(records: Record<string, any>[], id: string): {
  id: string;
  expected: string;
  observed: string;
  passed: boolean;
};
export function handledError(records: Record<string, any>[], id: string): {
  id: string;
  expected: string;
  observed: string;
  passed: boolean;
};
export function cleanShutdown(exitCode: number | null, exited: boolean, signal: NodeJS.Signals | null, hasRuntimeErrors: boolean): {
  id: string;
  expected: string;
  observed: string;
  passed: boolean;
};
export function nativeShellBoundary(exitCode: number | null, exited: boolean, output: string, expectedVersion: string): {
  id: string;
  expected: string;
  observed: string;
  passed: boolean;
};
