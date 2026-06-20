# AI Coding Agent Instructions

## Purpose

- Template for organisation-specific OpenCode plugins.
- Bundles a cross-platform sideloader (`postinstall.js` + `loader.js`) so plugins
  install via `pnpm`/`npm`/`bun` on macOS and Windows and are auto-discovered
  by both the OpenCode CLI and Desktop app.
- Teams fork the repo, drop their own providers/models/MCP servers into
  `index.ts`, and publish.

## Architecture

- **Language:** TypeScript (ESNext)
- **Runtime:** Bun (build + tests) / Node.js (Desktop app runtime)
- **Structure:** Single-package template
- **Key Components:**
  - `index.ts` - Plugin entry point. Safe defaults (`share = "disabled"`) + a
    marked section for teams to extend.
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

- `index.ts` - Plugin logic (extend this).
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
index.ts              # Plugin entry point
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
- `dist/index.js` is built from the source; never commit secrets or tokens.
- The default plugin enforces `config.share = "disabled"` to prevent
  accidental session sharing.
- Custom `package.json` scripts and any code teams add inside `index.ts`
  should be reviewed like any other code — the postinstall hook runs
  automatically on install.
