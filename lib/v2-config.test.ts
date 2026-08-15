import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { ensureV2Config } from './v2-config.js';

const manifest = {
  providers: { example: { package: '@ai-sdk/openai', settings: { baseURL: 'https://example.test' } } },
  mcpServers: { example: { type: 'remote' as const, url: 'https://example.test/mcp', disabled: true } },
};

describe('V2 config installation', () => {
  it.each([
    ['opencode.json', '{\n  // User comments survive.\n  "model": "openai/gpt-5",\n}\n'],
    ['opencode.jsonc', '{\n  // User comments survive.\n  "model": "openai/gpt-5",\n}\n'],
  ])('merges missing values into %s without replacing user configuration', async (filename, original) => {
    const directory = await mkdtemp(join(tmpdir(), 'opencode-plugin-template-'));
    try {
      await writeFile(join(directory, filename), original);
      expect(await ensureV2Config(manifest, directory)).toEqual([join(directory, filename)]);
      const result = await readFile(join(directory, filename), 'utf8');
      expect(result).toContain('// User comments survive.');
      expect(result).toContain('"model": "openai/gpt-5"');
      expect(Bun.JSONC.parse(result)).toMatchObject({ providers: { example: { package: 'aisdk:@ai-sdk/openai' } }, mcp: { servers: { example: { disabled: true } } } });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('is idempotent and leaves existing plugin values unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencode-plugin-template-'));
    try {
      const path = join(directory, 'opencode.jsonc');
      await writeFile(path, '{ "providers": { "example": { "package": "custom" } } }\n');
      expect(await ensureV2Config(manifest, directory)).toEqual([path]);
      expect(Bun.JSONC.parse(await readFile(path, 'utf8'))).toMatchObject({ providers: { example: { package: 'custom', settings: { baseURL: 'https://example.test' } } } });
      expect(await ensureV2Config(manifest, directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('creates opencode.jsonc when no global config exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencode-plugin-template-'));
    try {
      const path = join(directory, 'opencode.jsonc');
      expect(await ensureV2Config(manifest, directory)).toEqual([path]);
      expect(Bun.JSONC.parse(await readFile(path, 'utf8'))).toHaveProperty('providers.example');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects malformed JSONC without overwriting it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencode-plugin-template-'));
    try {
      const path = join(directory, 'opencode.jsonc');
      await writeFile(path, '{ invalid');
      await expect(ensureV2Config(manifest, directory)).rejects.toThrow('valid JSONC object');
      expect(await readFile(path, 'utf8')).toBe('{ invalid');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
