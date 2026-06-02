# Security Policy

## Supported versions

`0.x` is pre-stable. Security fixes should target the latest `0.x` line.

## Reporting a vulnerability

Open a private report or contact the maintainer through [GitHub Security Advisories](https://github.com/eiei114/pi-monofold/security/advisories) or repository issues when appropriate.

## Extension behavior

Pi Monofold runs as a Pi extension with the same privileges as the host Pi session. When monofold config is present it:

- Reads and writes files only through Pi's standard tools, with additional capability checks per workspace.
- Runs git subprocesses for allowed workspaces when using `/monofold:git` or `monofold_git`.
- Blocks raw `bash` git commit/push and redirects those flows to monofold git tools.

Review `.pi/monofold.yaml` carefully: misconfigured `capabilities` or workspace paths can expose repositories you did not intend to expose to the agent.

## Recommendations

- Limit `runCommands` and `editCode` to workspaces that should allow shell or code edits.
- Keep the control repository and linked workspace paths under your trust boundary.
- Review third-party Pi packages before installing; see the install notice in `README.md`.
