// OpenCode plugin loader for the opencode-plugin-template.
//
// This file is placed in the OpenCode plugins directory by the postinstall
// script. It locates the globally-installed package and imports the compiled
// dist/injector.js so that both the TUI (Bun) and Desktop (Node.js) work.
//
// When forking this template, update PLUGIN_NAME below to your own package
// name (or set OPENCODE_PLUGIN_NAME in the environment).

import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { homedir, platform } from "os";
import { pathToFileURL } from "url";

// ---------------------------------------------------------------------------
// UPDATE THIS when forking. Must match the `name` field in package.json.
// ---------------------------------------------------------------------------
const PLUGIN_NAME = process.env.OPENCODE_PLUGIN_NAME || "opencode-plugin-template";
// ---------------------------------------------------------------------------

function readPackageVersion(pkgDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    return "";
  }
}

function compareVersion(a, b) {
  const left = String(a || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function bestCandidate(dirs) {
  const candidates = [];
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    const entry = resolveEntry(dir);
    if (!entry) continue;
    candidates.push({ dir, entry, version: readPackageVersion(dir) });
  }
  candidates.sort((a, b) => compareVersion(b.version, a.version));
  return candidates[0]?.dir ?? null;
}

function safeSubdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function resolveEntry(pkgDir) {
  // Prefer pre-built JS (required for Node.js / Desktop app)
  const dist = join(pkgDir, "dist", "injector.js");
  if (existsSync(dist)) return dist;

  // Fall back to package.json resolution (works in Bun)
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (pkg.exports) {
      const root = pkg.exports["."] ?? pkg.exports;
      if (typeof root === "string") return join(pkgDir, root);
      if (root && typeof root === "object") {
        const entry = root.import ?? root.default ?? root.module;
        if (typeof entry === "string") return join(pkgDir, entry);
      }
    }
    if (pkg.module) return join(pkgDir, pkg.module);
    if (pkg.main) return join(pkgDir, pkg.main);
  } catch {}
  return null;
}

/**
 * Locate the plugin via `pnpm list -g --json`.
 * Returns the exact on-disk path regardless of pnpm version or global dir structure.
 */
function tryPnpm() {
  try {
    const output = execSync(`pnpm list -g ${PLUGIN_NAME} --json`, {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const parsed = JSON.parse(output);
    const entry = parsed?.[0]?.dependencies?.[PLUGIN_NAME];
    if (entry?.path && existsSync(entry.path)) return entry.path;
  } catch {}
  return null;
}

/**
 * Fallback for OpenCode/Desktop environments where pnpm is not on PATH.
 * Scans pnpm's global virtual env directories across known pnpm versions.
 */
function tryPnpmStatic() {
  const home = homedir();
  const os = platform();
  const roots = [];

  if (os === "darwin") {
    roots.push(join(home, "Library", "pnpm", "global"));
  } else if (os === "win32") {
    roots.push(join(home, "AppData", "Local", "pnpm", "global"));
  } else {
    const xdg = process.env.XDG_DATA_HOME || join(home, ".local", "share");
    roots.push(join(xdg, "pnpm", "global"));
  }

  const dirs = [];
  for (const root of roots) {
    for (const versionDir of safeSubdirs(root)) {
      dirs.push(join(root, versionDir, "node_modules", PLUGIN_NAME));
    }
    dirs.push(join(root, "node_modules", PLUGIN_NAME));
  }

  return bestCandidate(dirs);
}

/**
 * Locate the plugin via `npm list -g --json --long`.
 * The --long flag includes the `path` field for each dependency.
 */
function tryNpm() {
  try {
    const output = execSync(`npm list -g ${PLUGIN_NAME} --json --long`, {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const parsed = JSON.parse(output);
    const entry = parsed?.dependencies?.[PLUGIN_NAME];
    if (entry?.path && existsSync(entry.path)) return entry.path;
  } catch {}
  return null;
}

/**
 * Fallback for npm when npm is not on PATH.
 */
function tryNpmStatic() {
  const home = homedir();
  const os = platform();
  const dirs = [];

  if (os === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    dirs.push(join(appData, "npm", "node_modules", PLUGIN_NAME));

    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    dirs.push(join(localAppData, "npm", "node_modules", PLUGIN_NAME));

    const progFiles = process.env.ProgramFiles || "C:\\Program Files";
    dirs.push(join(progFiles, "nodejs", "node_modules", PLUGIN_NAME));

    const progFilesAlt = process.env.ProgramW6432 || progFiles;
    if (progFilesAlt !== progFiles) {
      dirs.push(join(progFilesAlt, "nodejs", "node_modules", PLUGIN_NAME));
    }

    const nvmHome = process.env.NVM_HOME || join(appData, "nvm");
    for (const versionDir of safeSubdirs(nvmHome)) {
      dirs.push(join(nvmHome, versionDir, "node_modules", PLUGIN_NAME));
    }

    const fnmDir = process.env.FNM_DIR || join(appData, "fnm");
    const fnmVersions = join(fnmDir, "node-versions");
    for (const versionDir of safeSubdirs(fnmVersions)) {
      dirs.push(join(fnmVersions, versionDir, "installation", "node_modules", PLUGIN_NAME));
    }
  } else {
    dirs.push(join("/usr/local/lib/node_modules", PLUGIN_NAME));
    dirs.push(join(home, ".npm-global", "lib", "node_modules", PLUGIN_NAME));
    for (const versionDir of safeSubdirs(join(home, ".nvm", "versions", "node"))) {
      dirs.push(join(home, ".nvm", "versions", "node", versionDir, "lib", "node_modules", PLUGIN_NAME));
    }

    const xdg = process.env.XDG_DATA_HOME || join(home, ".local", "share");
    const fnmDir = process.env.FNM_DIR || join(xdg, "fnm");
    const fnmVersions = join(fnmDir, "node-versions");
    for (const versionDir of safeSubdirs(fnmVersions)) {
      dirs.push(join(fnmVersions, versionDir, "installation", "lib", "node_modules", PLUGIN_NAME));
    }
  }

  return bestCandidate(dirs);
}

/**
 * Check bun global install location (no JSON list available).
 */
function tryBun() {
  const home = homedir();
  const dir = join(home, ".bun", "install", "global", "node_modules", PLUGIN_NAME);
  if (existsSync(dir)) return dir;
  return null;
}

function findPlugin() {
  const pnpmDir = tryPnpm();
  if (pnpmDir) {
    const entry = resolveEntry(pnpmDir);
    if (entry) return entry;
  }

  const pnpmStaticDir = tryPnpmStatic();
  if (pnpmStaticDir) {
    const entry = resolveEntry(pnpmStaticDir);
    if (entry) return entry;
  }

  const npmDir = tryNpm();
  if (npmDir) {
    const entry = resolveEntry(npmDir);
    if (entry) return entry;
  }

  const npmStaticDir = tryNpmStatic();
  if (npmStaticDir) {
    const entry = resolveEntry(npmStaticDir);
    if (entry) return entry;
  }

  const bunDir = tryBun();
  if (bunDir) {
    const entry = resolveEntry(bunDir);
    if (entry) return entry;
  }

  throw new Error(
    `${PLUGIN_NAME} not found in any global package manager location.\n` +
    `Install with one of:\n` +
    `  pnpm add -g ${PLUGIN_NAME} --allow-build=${PLUGIN_NAME}  (pnpm 10+)\n` +
    `  pnpm add -g ${PLUGIN_NAME}                               (pnpm 8/9)\n` +
    `  npm install -g ${PLUGIN_NAME}\n` +
    `  bun add -g ${PLUGIN_NAME}`
  );
}

const entry = findPlugin();
const mod = await import(pathToFileURL(entry).href);
export default mod.default ?? mod;
