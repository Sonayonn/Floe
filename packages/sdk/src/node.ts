// Node-only entry point for @floe/sdk.
// Contains tooling that requires Node built-ins (child_process/fs/os/path) —
// e.g. publishing per-vault share modules via the Sui CLI.
// The browser-facing index (./index.ts) intentionally does NOT import this.
export * from './share/publish.ts';
