import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { execSync } from "child_process";

const PROJECT_DIR = import.meta.dir;
const POSTINSTALL = join(PROJECT_DIR, "postinstall.js");
const BUN = process.execPath;

/** Run postinstall with XDG_CONFIG_HOME overridden to a temp directory */
function runPostinstall(configHome: string) {
  return execSync(`"${BUN}" "${POSTINSTALL}"`, {
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      // Remove opencode from PATH so getConfigDir falls back to XDG
      PATH: (process.env.PATH || "")
        .split(":")
        .filter((p) => !p.includes("opencode"))
        .join(":"),
    },
    timeout: 15000,
  });
}

describe("postinstall", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "postinstall-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies loader.js to the target plugins directory", () => {
    runPostinstall(tmpDir);

    const dest = join(tmpDir, "opencode", "plugins", "opencode-plugin-template.js");
    expect(existsSync(dest)).toBe(true);

    const content = readFileSync(dest, "utf8");
    expect(content).toContain("PLUGIN_NAME");
    expect(content).toContain("findPlugin");
    expect(content).toContain("resolveEntry");
  });

  it("creates the plugins directory if it does not exist", () => {
    const pluginsDir = join(tmpDir, "opencode", "plugins");
    expect(existsSync(pluginsDir)).toBe(false);

    runPostinstall(tmpDir);

    expect(existsSync(pluginsDir)).toBe(true);
  });

  it("overwrites existing loader on update", () => {
    const pluginsDir = join(tmpDir, "opencode", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, "opencode-plugin-template.js"), "// old version");

    runPostinstall(tmpDir);

    const content = readFileSync(join(pluginsDir, "opencode-plugin-template.js"), "utf8");
    expect(content).not.toBe("// old version");
    expect(content).toContain("findPlugin");
  });

  it("does not fail when dist/injector.js already exists", () => {
    if (!existsSync(join(PROJECT_DIR, "dist", "injector.js"))) return;

    const output = runPostinstall(tmpDir);
    expect(output).toContain("Installed plugin loader");
  });

  it("installed loader loads the shared compatibility injector", () => {
    runPostinstall(tmpDir);

    const dest = join(tmpDir, "opencode", "plugins", "opencode-plugin-template.js");
    const content = readFileSync(dest, "utf8");
    expect(content).toContain('dist", "injector.js"');
  });
});

describe("postinstall: config directory resolution", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "postinstall-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("respects XDG_CONFIG_HOME", () => {
    runPostinstall(tmpDir);

    const dest = join(tmpDir, "opencode", "plugins", "opencode-plugin-template.js");
    expect(existsSync(dest)).toBe(true);
  });

  it("uses a nested opencode/plugins path structure", () => {
    runPostinstall(tmpDir);

    expect(existsSync(join(tmpDir, "opencode", "plugins", "opencode-plugin-template.js"))).toBe(true);
    expect(existsSync(join(tmpDir, "opencode-plugin-template.js"))).toBe(false);
  });
});
