# OpenCode Plugin Template

> A starting point for organisation-specific [OpenCode](https://opencode.ai) plugins.

OpenCode ships its own npm package management and ignores globally installed packages on both the **CLI** and **Desktop app**. This template bundles a cross-platform sideloader (`postinstall.js` + `loader.js`) so a plugin installed via `pnpm`/`npm`/`bun` is automatically discovered and loaded by both runtimes.

Fork it, add your providers / models / MCP servers / auth flows to `v1/index.ts` and `v2/index.ts`, and publish.

---

## What's included

| File | Purpose |
|------|---------|
| `v1/index.ts` | OpenCode V1 entry point. Safe defaults (sharing disabled) + a clearly-marked section for your code. |
| `v2/index.ts` | OpenCode V2 entry point for catalog transforms and runtime hooks. |
| `injector.ts` | Exposes both plugin contracts from one auto-discovered entry point. |
| `manifest.ts` | Single source of truth for providers, models, MCP servers, and defaults. |
| `loader.js` | Trampoline that OpenCode auto-discovers. Locates the package via `pnpm`/`npm`/`bun` and imports `dist/injector.js`. |
| `postinstall.js` | Cross-platform installer. Builds `dist/` if needed and copies the loader into `~/.config/opencode/plugins/`. |
| `example-config.jsonc` | Sample `opencode.json` showing where teams add their own providers / MCP servers. |
| `example-config.v2.jsonc` | Native V2 configuration example. |

---

## Quick start (forking the template)

1. **Rename the package.** Edit `package.json` (`name`) and the `PLUGIN_NAME` constant at the top of `loader.js`. Both must match.
2. **Declare configuration once.** Edit `manifest.ts`; the V1 and V2 adapters render its native config shapes. Add version-specific hooks only when required.
3. **Build.**
   ```bash
   bun install
   bun run build
   ```
4. **Install globally** (or publish to a private registry first).
   ```bash
   # pnpm 10+
   pnpm add -g /path/to/your-fork --allow-build=your-package-name
   # pnpm 8/9
   pnpm add -g /path/to/your-fork
   # npm
   npm install -g /path/to/your-fork
   # bun
   bun add -g /path/to/your-fork
   ```
5. **Launch OpenCode.** The plugin is auto-discovered; no `plugin` array entry needed.

> **Local dev:** Add `"plugin": ["/path/to/your-fork/injector.ts"]` to a V1 config, or `"plugins": ["/path/to/your-fork/injector.ts"]` to a V2 config, to skip the sideloader entirely.

---

## Customising the entrypoints

The V1 entry point is intentionally minimal. It enforces `config.share = "disabled"` and provides two commented examples. OpenCode V2 remains compatible with that V1 configuration, while new V2-specific behavior belongs in `v2/index.ts`.

- Registering a provider
- Registering an MCP server

## Shared configuration

`manifest.ts` is the plugin-owned configuration source. It renders provider package names, models, MCP enablement, and timeouts for both OpenCode generations. V2 merges only missing manifest values into the global JSONC config and preserves comments and existing user values; restart after the first V2 launch to load newly added entries.

Do not use the translators to rewrite arbitrary user configuration. V1 request `options` and V2 `settings`/`headers`/`body` do not always have a lossless semantic mapping.

Add anything else OpenCode plugins support: `auth` hooks for OAuth, `chat.params` for request shaping, `event` hooks for runtime reactions, `experimental` flags, etc. The `@opencode-ai/plugin` types document the full surface.

---

## How the sideloader works

OpenCode looks for plugins in two places:

1. The `plugin` array in `opencode.json` (file-based)
2. `~/.config/opencode/plugins/*.js` (auto-discovered)

The postinstall script puts `loader.js` into the second location, renaming it to match the package. At OpenCode startup, the loader:

1. Tries `pnpm list -g <pkg> --json` and `npm list -g <pkg> --json` to get the install path
2. Falls back to scanning `pnpm`/`npm` global directories (including `nvm` and `fnm` layouts)
3. Tries `~/.bun/install/global/node_modules/<pkg>`
4. Picks the highest-version candidate and imports its entry point

`dist/injector.js` is required because the **Desktop app** uses Node.js, which can't load `.ts` from `node_modules` directly. The TUI uses Bun and would happily load `.ts`; the loader prefers the compiled JS so both runtimes share the same path. The injector exports V1's `server` contract and V2's `setup` contract; each OpenCode generation ignores the other.

---

## Testing

```bash
bun test
```

Covers the plugin's `config` hook plus the loader and postinstall logic.

---

## License

MIT — fork freely.
