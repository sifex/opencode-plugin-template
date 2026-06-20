#!/usr/bin/env node

// Postinstall script for opencode-plugin-template.
//
// Copies the plugin loader into the OpenCode global plugins directory so that
// both the TUI and Desktop app auto-discover and load the plugin at startup.
// The plugins directory is determined by:
//   1. Running `opencode debug paths` and parsing the config line
//   2. Falling back to XDG_CONFIG_HOME/opencode or ~/.config/opencode
//
// Requires Node.js (available via pnpm/npm installs; bun add also works if
// node is on PATH).

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOADER_FILENAME = "opencode-plugin-template.js";
const LOADER_SOURCE = join(__dirname, "loader.js");

function getConfigDir() {
  try {
    const output = execSync("opencode debug paths", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const match = output.match(/^config\s+(.+)$/m);
    if (match) return match[1].trim();
  } catch {}

  // Fall back to XDG_CONFIG_HOME or ~/.config/opencode (all platforms).
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
  return join(xdgConfig, "opencode");
}

function buildDist() {
  // Ensure dist/index.js exists — required for the Desktop app (Node.js runtime)
  const distFile = join(__dirname, "dist", "index.js");
  if (existsSync(distFile)) return;

  console.log("[opencode-plugin-template] Building dist/index.js...");
  try {
    execSync("bun run build", { cwd: __dirname, timeout: 30000, stdio: "inherit" });
  } catch {
    console.warn(
      "[opencode-plugin-template] Warning: could not build dist/index.js (bun not found).\n" +
      "  The plugin will work in the TUI but not in the Desktop app.\n" +
      "  Run manually: cd " + __dirname + " && bun run build"
    );
  }
}

function main() {
  buildDist();

  try {
    const configDir = getConfigDir();
    const pluginsDir = join(configDir, "plugins");

    if (!existsSync(pluginsDir)) {
      mkdirSync(pluginsDir, { recursive: true });
    }

    const dest = join(pluginsDir, LOADER_FILENAME);
    copyFileSync(LOADER_SOURCE, dest);
    console.log(`[opencode-plugin-template] Installed plugin loader to ${dest}`);
  } catch (err) {
    console.warn(
      `[opencode-plugin-template] Warning: could not install plugin loader.\n` +
      `  ${err.message}\n` +
      `  You can install manually: copy loader.js to ~/.config/opencode/plugins/`
    );
  }
}

main();
