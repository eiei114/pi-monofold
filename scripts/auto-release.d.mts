export function isStableSemver(version: string): boolean;
export function shouldDispatchPublish(runs: unknown[], tagSha: string, tag: string): boolean;
export function completeRelease(options: {
  version: string;
  repository: string;
  execute?: (command: string, args: string[], options?: { allowFailure?: boolean }) => {
    status: number | null;
    stdout: string;
    stderr: string;
  };
  log?: (message: string) => void;
}): void;
