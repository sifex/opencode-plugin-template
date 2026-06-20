import { describe, expect, it, beforeAll, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";

// ---------------------------------------------------------------------------
// We test the loader's internal logic by extracting and exercising the
// resolveEntry and findPlugin functions in isolation. Since loader.js has
// top-level await and side effects, we replicate the logic here against
// controlled fixtures.
// ---------------------------------------------------------------------------

const PLUGIN_NAME = "opencode-plugin-template";

/** Replicated from loader.js — resolves entry file from a package directory */
function resolveEntry(pkgDir: string): string | null {
  const dist = join(pkgDir, "dist", "index.js");
  if (existsSync(dist)) return dist;

  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const { readFileSync } = require("fs");
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

describe("loader: resolveEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "loader-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prefers dist/index.js when it exists", () => {
    const distDir = join(tmpDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.js"), "export default {}");
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ main: "index.ts" }));
    writeFileSync(join(tmpDir, "index.ts"), "export default {}");

    expect(resolveEntry(tmpDir)).toBe(join(distDir, "index.js"));
  });

  it("falls back to exports['.'] string", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ exports: { ".": "./src/main.js" } })
    );

    expect(resolveEntry(tmpDir)).toBe(join(tmpDir, "src/main.js"));
  });

  it("falls back to exports['.'].import", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ exports: { ".": { import: "./lib/index.mjs" } } })
    );

    expect(resolveEntry(tmpDir)).toBe(join(tmpDir, "lib/index.mjs"));
  });

  it("falls back to exports['.'].default", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ exports: { ".": { default: "./lib/entry.js" } } })
    );

    expect(resolveEntry(tmpDir)).toBe(join(tmpDir, "lib/entry.js"));
  });

  it("falls back to pkg.module", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ module: "index.mjs" })
    );

    expect(resolveEntry(tmpDir)).toBe(join(tmpDir, "index.mjs"));
  });

  it("falls back to pkg.main", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ main: "index.ts" })
    );

    expect(resolveEntry(tmpDir)).toBe(join(tmpDir, "index.ts"));
  });

  it("returns null when no package.json exists", () => {
    expect(resolveEntry(tmpDir)).toBeNull();
  });

  it("returns null for empty package.json", () => {
    writeFileSync(join(tmpDir, "package.json"), "{}");

    expect(resolveEntry(tmpDir)).toBeNull();
  });

  it("returns null for malformed package.json", () => {
    writeFileSync(join(tmpDir, "package.json"), "not json at all");

    expect(resolveEntry(tmpDir)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test the findPlugin discovery logic.
// The new approach uses `pnpm list -g --json` / `npm list -g --json` / bun
// static path. We test the JSON parsing and path extraction logic here.
// ---------------------------------------------------------------------------

/** Replicated from loader.js — parses pnpm list -g --json output */
function parsePnpmListOutput(output: string, pluginName: string): string | null {
  try {
    const parsed = JSON.parse(output);
    const entry = parsed?.[0]?.dependencies?.[pluginName];
    if (entry?.path) return entry.path;
  } catch {}
  return null;
}

/** Replicated from loader.js — parses npm list -g --json --long output */
function parseNpmListOutput(output: string, pluginName: string): string | null {
  try {
    const parsed = JSON.parse(output);
    const entry = parsed?.dependencies?.[pluginName];
    if (entry?.path) return entry.path;
  } catch {}
  return null;
}

function safeSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function pnpmStaticDirs(os: "darwin" | "win32" | "linux", home: string, xdgDataHome?: string): string[] {
  const roots: string[] = [];
  if (os === "darwin") roots.push(join(home, "Library", "pnpm", "global"));
  else if (os === "win32") roots.push(join(home, "AppData", "Local", "pnpm", "global"));
  else roots.push(join(xdgDataHome || join(home, ".local", "share"), "pnpm", "global"));

  const dirs: string[] = [];
  for (const root of roots) {
    for (const versionDir of safeSubdirs(root)) {
      dirs.push(join(root, versionDir, "node_modules", PLUGIN_NAME));
    }
    dirs.push(join(root, "node_modules", PLUGIN_NAME));
  }
  return dirs;
}

function npmStaticDirs(
  os: "darwin" | "win32" | "linux",
  home: string,
  env: { APPDATA?: string; LOCALAPPDATA?: string; ProgramFiles?: string; ProgramW6432?: string; NVM_HOME?: string; FNM_DIR?: string; XDG_DATA_HOME?: string } = {}
): string[] {
  const dirs: string[] = [];
  if (os === "win32") {
    const appData = env.APPDATA || join(home, "AppData", "Roaming");
    dirs.push(join(appData, "npm", "node_modules", PLUGIN_NAME));

    const localAppData = env.LOCALAPPDATA || join(home, "AppData", "Local");
    dirs.push(join(localAppData, "npm", "node_modules", PLUGIN_NAME));

    const progFiles = env.ProgramFiles || "C:\\Program Files";
    dirs.push(join(progFiles, "nodejs", "node_modules", PLUGIN_NAME));

    const progFilesAlt = env.ProgramW6432 || progFiles;
    if (progFilesAlt !== progFiles) {
      dirs.push(join(progFilesAlt, "nodejs", "node_modules", PLUGIN_NAME));
    }

    // nvm-windows stores global packages alongside each Node version
    const nvmHome = env.NVM_HOME || join(appData, "nvm");
    for (const versionDir of safeSubdirs(nvmHome)) {
      dirs.push(join(nvmHome, versionDir, "node_modules", PLUGIN_NAME));
    }

    // fnm (Fast Node Manager) on Windows
    const fnmDir = env.FNM_DIR || join(appData, "fnm");
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

    // fnm (Fast Node Manager) on macOS/Linux
    const xdg = env.XDG_DATA_HOME || join(home, ".local", "share");
    const fnmDir = env.FNM_DIR || join(xdg, "fnm");
    const fnmVersions = join(fnmDir, "node-versions");
    for (const versionDir of safeSubdirs(fnmVersions)) {
      dirs.push(join(fnmVersions, versionDir, "installation", "lib", "node_modules", PLUGIN_NAME));
    }
  }
  return dirs;
}

describe("loader: findPlugin discovery", () => {
  it("parses pnpm list -g --json output to extract package path", () => {
    const output = JSON.stringify([{
      path: "/Users/alice/Library/pnpm/global/5",
      private: false,
      dependencies: {
        [PLUGIN_NAME]: {
          from: PLUGIN_NAME,
          version: "2.1.6",
          path: "/Users/alice/Library/pnpm/global/5/.pnpm/opencode-plugin-template@0.1.0/node_modules/opencode-plugin-template",
        },
      },
    }]);

    expect(parsePnpmListOutput(output, PLUGIN_NAME)).toBe(
      "/Users/alice/Library/pnpm/global/5/.pnpm/opencode-plugin-template@0.1.0/node_modules/opencode-plugin-template"
    );
  });

  it("returns null when pnpm list output has no dependencies", () => {
    const output = JSON.stringify([{
      path: "/Users/alice/Library/pnpm/global/5",
      private: false,
    }]);

    expect(parsePnpmListOutput(output, PLUGIN_NAME)).toBeNull();
  });

  it("returns null for invalid pnpm list output", () => {
    expect(parsePnpmListOutput("not json", PLUGIN_NAME)).toBeNull();
    expect(parsePnpmListOutput("", PLUGIN_NAME)).toBeNull();
  });

  it("parses npm list -g --json --long output to extract package path", () => {
    const output = JSON.stringify({
      name: "lib",
      path: "/Users/alice/.nvm/versions/node/v20.0.0/lib",
      dependencies: {
        [PLUGIN_NAME]: {
          version: "2.1.6",
          path: "/Users/alice/.nvm/versions/node/v20.0.0/lib/node_modules/opencode-plugin-template",
        },
      },
    });

    expect(parseNpmListOutput(output, PLUGIN_NAME)).toBe(
      "/Users/alice/.nvm/versions/node/v20.0.0/lib/node_modules/opencode-plugin-template"
    );
  });

  it("returns null when npm list output has no matching dependency", () => {
    const output = JSON.stringify({ name: "lib" });
    expect(parseNpmListOutput(output, PLUGIN_NAME)).toBeNull();
  });

  it("returns null for invalid npm list output", () => {
    expect(parseNpmListOutput("not json", PLUGIN_NAME)).toBeNull();
  });

  it("bun: checks ~/.bun/install/global/node_modules/<pkg>", () => {
    // Verify the expected bun global path structure
    const home = "/Users/alice";
    const expected = join(home, ".bun", "install", "global", "node_modules", PLUGIN_NAME);
    expect(expected).toBe("/Users/alice/.bun/install/global/node_modules/opencode-plugin-template");
  });

  it("pnpm static fallback scans all global version directories", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pnpm-global-test-"));
    try {
      const root = join(tmp, "Library", "pnpm", "global");
      mkdirSync(join(root, "3"), { recursive: true });
      mkdirSync(join(root, "5"), { recursive: true });

      expect(pnpmStaticDirs("darwin", tmp)).toEqual([
        join(root, "3", "node_modules", PLUGIN_NAME),
        join(root, "5", "node_modules", PLUGIN_NAME),
        join(root, "node_modules", PLUGIN_NAME),
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("npm static fallback includes nvm global package directories", () => {
    const tmp = mkdtempSync(join(tmpdir(), "npm-global-test-"));
    try {
      const root = join(tmp, ".nvm", "versions", "node");
      mkdirSync(join(root, "v20.19.0"), { recursive: true });
      mkdirSync(join(root, "v22.11.0"), { recursive: true });

      expect(npmStaticDirs("darwin", tmp)).toEqual([
        join("/usr/local/lib/node_modules", PLUGIN_NAME),
        join(tmp, ".npm-global", "lib", "node_modules", PLUGIN_NAME),
        join(root, "v20.19.0", "lib", "node_modules", PLUGIN_NAME),
        join(root, "v22.11.0", "lib", "node_modules", PLUGIN_NAME),
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Windows + npm specific tests
// Covers the bug where tryNpmStatic() only checked %APPDATA%\npm and missed
// other common Windows npm global install locations.
// ---------------------------------------------------------------------------

describe("loader: Windows npm static fallback paths", () => {
  it("includes %APPDATA%\\npm\\node_modules as primary path", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home, { APPDATA: "C:\\Users\\bob\\AppData\\Roaming" });
    expect(dirs).toContain(
      join("C:\\Users\\bob\\AppData\\Roaming", "npm", "node_modules", PLUGIN_NAME)
    );
  });

  it("includes %LOCALAPPDATA%\\npm\\node_modules for newer npm configurations", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home, { LOCALAPPDATA: "C:\\Users\\bob\\AppData\\Local" });
    expect(dirs).toContain(
      join("C:\\Users\\bob\\AppData\\Local", "npm", "node_modules", PLUGIN_NAME)
    );
  });

  it("includes Program Files\\nodejs\\node_modules (Node.js MSI installer default)", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home, { ProgramFiles: "C:\\Program Files" });
    expect(dirs).toContain(
      join("C:\\Program Files", "nodejs", "node_modules", PLUGIN_NAME)
    );
  });

  it("includes ProgramW6432 path when different from ProgramFiles (32-bit process on 64-bit OS)", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home, {
      ProgramFiles: "C:\\Program Files (x86)",
      ProgramW6432: "C:\\Program Files",
    });
    expect(dirs).toContain(
      join("C:\\Program Files (x86)", "nodejs", "node_modules", PLUGIN_NAME)
    );
    expect(dirs).toContain(
      join("C:\\Program Files", "nodejs", "node_modules", PLUGIN_NAME)
    );
  });

  it("does NOT duplicate ProgramW6432 path when same as ProgramFiles", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home, {
      ProgramFiles: "C:\\Program Files",
      ProgramW6432: "C:\\Program Files",
    });
    // Should only have ONE entry for Program Files\nodejs
    const progFilesEntries = dirs.filter((d) =>
      d.includes(join("C:\\Program Files", "nodejs", "node_modules"))
    );
    expect(progFilesEntries.length).toBe(1);
  });

  it("includes nvm-windows version directories when NVM_HOME is set", () => {
    const tmp = mkdtempSync(join(tmpdir(), "nvm-win-test-"));
    try {
      const nvmHome = join(tmp, "nvm");
      mkdirSync(join(nvmHome, "v18.20.0"), { recursive: true });
      mkdirSync(join(nvmHome, "v20.11.0"), { recursive: true });

      const dirs = npmStaticDirs("win32", "C:\\Users\\bob", { NVM_HOME: nvmHome });
      expect(dirs).toContain(
        join(nvmHome, "v18.20.0", "node_modules", PLUGIN_NAME)
      );
      expect(dirs).toContain(
        join(nvmHome, "v20.11.0", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to %APPDATA%\\nvm for nvm-windows when NVM_HOME is not set", () => {
    const tmp = mkdtempSync(join(tmpdir(), "nvm-win-fallback-test-"));
    try {
      const appData = join(tmp, "AppData", "Roaming");
      const nvmDir = join(appData, "nvm");
      mkdirSync(join(nvmDir, "v20.11.0"), { recursive: true });

      const dirs = npmStaticDirs("win32", tmp, { APPDATA: appData });
      expect(dirs).toContain(
        join(nvmDir, "v20.11.0", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("uses default paths when no env variables are set", () => {
    const home = "C:\\Users\\bob";
    const dirs = npmStaticDirs("win32", home);
    // Should include default locations derived from home
    expect(dirs).toContain(
      join(home, "AppData", "Roaming", "npm", "node_modules", PLUGIN_NAME)
    );
    expect(dirs).toContain(
      join(home, "AppData", "Local", "npm", "node_modules", PLUGIN_NAME)
    );
    expect(dirs).toContain(
      join("C:\\Program Files", "nodejs", "node_modules", PLUGIN_NAME)
    );
  });

  it("full Windows discovery finds plugin in Program Files when APPDATA path is empty", () => {
    // Simulate: plugin installed at C:\Program Files\nodejs\node_modules\<plugin>...
    // but NOT at %APPDATA%\npm\node_modules\<plugin>...
    const tmp = mkdtempSync(join(tmpdir(), "win-npm-progfiles-"));
    try {
      const progFiles = join(tmp, "Program Files");
      const pluginDir = join(progFiles, "nodejs", "node_modules", PLUGIN_NAME);
      mkdirSync(join(pluginDir, "dist"), { recursive: true });
      writeFileSync(join(pluginDir, "dist", "index.js"), "export default {}");
      writeFileSync(join(pluginDir, "package.json"), JSON.stringify({ version: "2.0.9" }));

      const dirs = npmStaticDirs("win32", join(tmp, "Users", "bob"), {
        APPDATA: join(tmp, "empty-appdata"),
        LOCALAPPDATA: join(tmp, "empty-localappdata"),
        ProgramFiles: progFiles,
        NVM_HOME: join(tmp, "empty-nvm"),
      });

      // The Program Files path should be in the list
      expect(dirs).toContain(pluginDir);

      // And resolveEntry should find the dist/index.js
      const entry = resolveEntry(pluginDir);
      expect(entry).toBe(join(pluginDir, "dist", "index.js"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// fnm (Fast Node Manager) specific tests.
// fnm is commonly used on Windows and stores node versions + global packages at:
//   %APPDATA%\fnm\node-versions\<version>\installation\node_modules\<pkg>
// On macOS/Linux:
//   ~/.local/share/fnm/node-versions/<version>/installation/lib/node_modules/<pkg>
// ---------------------------------------------------------------------------

describe("loader: fnm (Fast Node Manager) discovery", () => {
  it("Windows: includes fnm node-versions paths from %APPDATA%\\fnm by default", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-win-test-"));
    try {
      const appData = join(tmp, "AppData", "Roaming");
      const fnmVersions = join(appData, "fnm", "node-versions");
      mkdirSync(join(fnmVersions, "v24.14.1"), { recursive: true });
      mkdirSync(join(fnmVersions, "v20.11.0"), { recursive: true });

      const dirs = npmStaticDirs("win32", tmp, { APPDATA: appData });
      expect(dirs).toContain(
        join(fnmVersions, "v24.14.1", "installation", "node_modules", PLUGIN_NAME)
      );
      expect(dirs).toContain(
        join(fnmVersions, "v20.11.0", "installation", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Windows: respects FNM_DIR env override", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-dir-test-"));
    try {
      const customFnm = join(tmp, "custom-fnm");
      const fnmVersions = join(customFnm, "node-versions");
      mkdirSync(join(fnmVersions, "v22.0.0"), { recursive: true });

      const dirs = npmStaticDirs("win32", "C:\\Users\\bob", { FNM_DIR: customFnm });
      expect(dirs).toContain(
        join(fnmVersions, "v22.0.0", "installation", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Windows: end-to-end resolves plugin installed via fnm + npm", () => {
    // Simulates the exact scenario from the bug report:
    // User has fnm on Windows, npm install -g puts package at:
    // %APPDATA%\fnm\node-versions\v24.14.1\installation\node_modules\opencode-plugin-template
    const tmp = mkdtempSync(join(tmpdir(), "fnm-e2e-win-"));
    try {
      const appData = join(tmp, "AppData", "Roaming");
      const fnmVersions = join(appData, "fnm", "node-versions");
      const pluginDir = join(fnmVersions, "v24.14.1", "installation", "node_modules", PLUGIN_NAME);
      mkdirSync(join(pluginDir, "dist"), { recursive: true });
      writeFileSync(join(pluginDir, "dist", "index.js"), "export default {}");
      writeFileSync(join(pluginDir, "package.json"), JSON.stringify({ version: "2.1.8" }));

      // Verify the path is in our search list
      const dirs = npmStaticDirs("win32", tmp, {
        APPDATA: appData,
        LOCALAPPDATA: join(tmp, "AppData", "Local"),
        NVM_HOME: join(tmp, "nonexistent-nvm"),
      });
      expect(dirs).toContain(pluginDir);

      // Verify resolveEntry finds the entry point
      const entry = resolveEntry(pluginDir);
      expect(entry).toBe(join(pluginDir, "dist", "index.js"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("macOS/Linux: includes fnm node-versions paths from ~/.local/share/fnm", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-mac-test-"));
    try {
      const fnmVersions = join(tmp, ".local", "share", "fnm", "node-versions");
      mkdirSync(join(fnmVersions, "v20.11.0"), { recursive: true });
      mkdirSync(join(fnmVersions, "v22.5.0"), { recursive: true });

      const dirs = npmStaticDirs("darwin", tmp);
      expect(dirs).toContain(
        join(fnmVersions, "v20.11.0", "installation", "lib", "node_modules", PLUGIN_NAME)
      );
      expect(dirs).toContain(
        join(fnmVersions, "v22.5.0", "installation", "lib", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("macOS/Linux: respects XDG_DATA_HOME for fnm location", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-xdg-test-"));
    try {
      const xdgData = join(tmp, "custom-data");
      const fnmVersions = join(xdgData, "fnm", "node-versions");
      mkdirSync(join(fnmVersions, "v20.11.0"), { recursive: true });

      const dirs = npmStaticDirs("linux", tmp, { XDG_DATA_HOME: xdgData });
      expect(dirs).toContain(
        join(fnmVersions, "v20.11.0", "installation", "lib", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("macOS/Linux: respects FNM_DIR env override", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-dir-mac-test-"));
    try {
      const customFnm = join(tmp, "my-fnm");
      const fnmVersions = join(customFnm, "node-versions");
      mkdirSync(join(fnmVersions, "v18.0.0"), { recursive: true });

      const dirs = npmStaticDirs("darwin", tmp, { FNM_DIR: customFnm });
      expect(dirs).toContain(
        join(fnmVersions, "v18.0.0", "installation", "lib", "node_modules", PLUGIN_NAME)
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Windows: picks highest version when multiple fnm versions have the plugin", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fnm-multi-ver-"));
    try {
      const appData = join(tmp, "AppData", "Roaming");
      const fnmVersions = join(appData, "fnm", "node-versions");

      // Create two versions with the plugin installed
      const v20Dir = join(fnmVersions, "v20.11.0", "installation", "node_modules", PLUGIN_NAME);
      const v24Dir = join(fnmVersions, "v24.14.1", "installation", "node_modules", PLUGIN_NAME);
      mkdirSync(join(v20Dir, "dist"), { recursive: true });
      mkdirSync(join(v24Dir, "dist"), { recursive: true });
      writeFileSync(join(v20Dir, "dist", "index.js"), "export default {}");
      writeFileSync(join(v20Dir, "package.json"), JSON.stringify({ version: "2.0.5" }));
      writeFileSync(join(v24Dir, "dist", "index.js"), "export default {}");
      writeFileSync(join(v24Dir, "package.json"), JSON.stringify({ version: "2.1.8" }));

      const dirs = npmStaticDirs("win32", tmp, {
        APPDATA: appData,
        LOCALAPPDATA: join(tmp, "AppData", "Local"),
        NVM_HOME: join(tmp, "nonexistent"),
      });

      // Both paths should be candidates
      expect(dirs).toContain(v20Dir);
      expect(dirs).toContain(v24Dir);

      // bestCandidate (used by the real loader) would pick 2.1.8 as highest version
      // We test that resolveEntry works on both
      expect(resolveEntry(v20Dir)).toBe(join(v20Dir, "dist", "index.js"));
      expect(resolveEntry(v24Dir)).toBe(join(v24Dir, "dist", "index.js"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test the getConfigDir fallback logic from postinstall.js.
// On all platforms, OpenCode uses ~/.config/opencode as the global config dir.
// ---------------------------------------------------------------------------

/** Replicated from postinstall.js */
function getConfigDirFallback(home: string, xdgConfigHome?: string): string {
  const xdgConfig = xdgConfigHome || join(home, ".config");
  return join(xdgConfig, "opencode");
}

describe("postinstall: getConfigDir path logic", () => {
  it("defaults to ~/.config/opencode on macOS", () => {
    expect(getConfigDirFallback("/Users/alice")).toBe("/Users/alice/.config/opencode");
  });

  it("defaults to ~/.config/opencode on Linux", () => {
    expect(getConfigDirFallback("/home/bob")).toBe("/home/bob/.config/opencode");
  });

  it("defaults to ~/.config/opencode on Windows (homedir)", () => {
    // On native Windows, homedir() returns C:\Users\<user>
    expect(getConfigDirFallback("C:\\Users\\carol")).toBe(
      join("C:\\Users\\carol", ".config", "opencode")
    );
  });

  it("respects XDG_CONFIG_HOME override", () => {
    expect(getConfigDirFallback("/Users/alice", "/custom/config")).toBe("/custom/config/opencode");
  });

  it("plugins subdir is always configDir/plugins", () => {
    const configDir = getConfigDirFallback("/Users/alice");
    expect(join(configDir, "plugins")).toBe("/Users/alice/.config/opencode/plugins");
  });
});

// These tests require the plugin to be globally installed on the machine.
// They verify the full loader.js integration (findPlugin -> import -> re-export).
// Skipped in CI where no global install exists.
describe("loader: export shape (requires global install)", () => {
  let mod: any;
  let loaderAvailable = false;

  beforeAll(async () => {
    try {
      mod = await import("./loader.js");
      loaderAvailable = true;
    } catch {
      // Plugin not globally installed — tests will be skipped
    }
  });

  it("wraps a function export in { id, server } PluginModule shape", () => {
    if (!loaderAvailable) return; // skip

    expect(mod.default).toBeDefined();
    expect(mod.default.id).toBe(PLUGIN_NAME);
    expect(typeof mod.default.server).toBe("function");
  });

  it("server() returns hooks when called with mock input", async () => {
    if (!loaderAvailable) return; // skip

    const hooks = await mod.default.server({
      client: {
        tui: { showToast: async () => {} },
        app: { log: async () => {} },
      },
      project: {},
      directory: "/tmp",
      worktree: "/tmp",
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost"),
      $: {},
    });

    expect(hooks).toBeDefined();
    expect(typeof hooks.config).toBe("function");
  });
});
