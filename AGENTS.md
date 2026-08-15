# AI Coding Agent Instructions

## Purpose

- Template for organisation-specific OpenCode plugins.
- Bundles a cross-platform sideloader (`postinstall.js` + `loader.js`) so plugins
  install via `pnpm`/`npm`/`bun` on macOS and Windows and are auto-discovered
  by both the OpenCode CLI and Desktop app.
- Teams fork the repo, add V1 behavior in `v1/index.ts` and V2 behavior in
  `v2/index.ts`, then publish.

## Architecture

- **Language:** TypeScript (ESNext)
- **Runtime:** Bun (build + tests) / Node.js (Desktop app runtime)
- **Structure:** Single-package template
- **Key Components:**
  - `v1/index.ts` - OpenCode V1 entry point and safe defaults.
  - `v2/index.ts` - OpenCode V2 entry point.
  - `injector.ts` - Shared V1/V2 compatibility adapter.
  - `manifest.ts` - Shared provider, model, MCP, and default declarations.
  - `loader.js` - Trampoline copied to `~/.config/opencode/plugins/` that
    locates the installed package via `pnpm`/`npm`/`bun` and imports it.
  - `postinstall.js` - Cross-platform installer (sideloader).
  - `example-config.jsonc` - Sample `opencode.json` showing where teams add
    their own providers and MCP servers.

## Development Environment

### Setup

```bash
curl -fsSL https://bun.sh/install | bash
bun install
```

No environment variables are required for development.

### Navigation

- `v1/index.ts` - V1 plugin logic.
- `v2/index.ts` - V2 plugin logic.
- `injector.ts` - Shared plugin entry point.
- `manifest.ts` - Shared configuration declarations.
- `loader.js` - Trampoline (set `PLUGIN_NAME` to your package name).
- `postinstall.js` - Sideloader.
- `example-config.jsonc` - Sample user config.

## Build & Test

- **Build:** `bun run build`
- **Test:** `bun test`
- **Lint:** `bun run lint`

## Testing Strategy

- Run `bun test` to execute tests.
- Tests use the `*.test.ts` convention and live next to the code they cover.
- Fix all type errors (`bun run lint`) before committing.

## Repository Map

```
v1/index.ts           # V1 plugin entry point
v2/index.ts           # V2 plugin entry point
injector.ts           # V1/V2 compatibility adapter
manifest.ts           # Shared configuration declarations
loader.js             # Sideloader trampoline
postinstall.js        # Sideloader installer
example-config.jsonc  # Sample user config
tsconfig.json         # TypeScript configuration
```

## Code Style

- Strict TypeScript enabled (`strict: true` in tsconfig).
- ESNext target with bundler module resolution.
- Use `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch`.
- Prefer async/await for asynchronous operations.

## Git & PR Policy

- **Commits:** Ask permission before pushing.
- **PRs:** Create as drafts only (`gh pr create --draft`).
- **Versioning:** Follows semantic versioning.

## Security Considerations

- The sideloader copies only `loader.js` (no secrets) into the OpenCode
  plugins directory.
- `dist/injector.js` is built from the source; never commit secrets or tokens.
- The default plugin enforces `config.share = "disabled"` to prevent
  accidental session sharing.
- Custom `package.json` scripts and any code teams add inside either entrypoint
  should be reviewed like any other code — the postinstall hook runs
  automatically on install.
