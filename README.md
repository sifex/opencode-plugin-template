# OpenCode Plugin Template

> A starting point for organisation-specific [OpenCode](https://opencode.ai) plugins.

OpenCode ships its own npm package management and ignores globally installed packages on both the **CLI** and **Desktop app**. This template bundles a cross-platform sideloader (`postinstall.js` + `loader.js`) so a plugin installed via `pnpm`/`npm`/`bun` is automatically discovered and loaded by both runtimes.

Fork it, add your providers / models / MCP servers / auth flows to `index.ts`, and publish.

---

## What's included

| File | Purpose |
|------|---------|
| `index.ts` | Plugin entry point. Safe defaults (sharing disabled) + a clearly-marked section for your code. |
| `loader.js` | Trampoline that OpenCode auto-discovers. Locates the package via `pnpm`/`npm`/`bun` and imports `dist/index.js`. |
| `postinstall.js` | Cross-platform installer. Builds `dist/` if needed and copies the loader into `~/.config/opencode/plugins/`. |
| `example-config.jsonc` | Sample `opencode.json` showing where teams add their own providers / MCP servers. |

---

## Quick start (forking the template)

1. **Rename the package.** Edit `package.json` (`name`) and the `PLUGIN_NAME` constant at the top of `loader.js`. Both must match.
2. **Add your code.** Edit `index.ts` and put providers, models, MCP servers, OAuth flows, etc. inside the marked section of the `config` hook (or add new hooks).
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

> **Local dev:** Add `"plugin": ["/path/to/your-fork/index.ts"]` to your `opencode.json` to skip the sideloader entirely.

---

## Customising `index.ts`

The shipped entry point is intentionally minimal. It only enforces `config.share = "disabled"` and provides two commented examples:

- Registering a provider
- Registering an MCP server

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

`dist/index.js` is required because the **Desktop app** uses Node.js, which can't load `.ts` from `node_modules` directly. The TUI uses Bun and would happily load `.ts`; the loader prefers the compiled JS so both runtimes share the same path.

---

## Testing

```bash
bun test
```

Covers the plugin's `config` hook plus the loader and postinstall logic.

---

## License

MIT — fork freely.
