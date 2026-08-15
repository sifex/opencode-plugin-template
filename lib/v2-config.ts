import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';

import type { PluginManifest } from '../manifest.js';
import { renderV2Config } from './config-translation.js';

type JsonObject = Record<string, unknown>;

function configDirectory(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
}

function mergeMissing(text: string, values: JsonObject): string {
  let result = text;
  let current = parseConfig(result);
  if (!current || Array.isArray(current) || typeof current !== 'object') {
    throw new Error('OpenCode configuration must contain a JSON object');
  }

  const merge = (source: JsonObject, path: (string | number)[] = []) => {
    for (const [key, value] of Object.entries(source)) {
      const existing = source[key];
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        const currentValue = currentPath(current, [...path, key]);
        if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
          merge(value as JsonObject, [...path, key]);
          continue;
        }
      }
      if (currentPath(current, [...path, key]) !== undefined) continue;
      result = applyEdits(result, modify(result, [...path, key], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
      current = parseConfig(result);
    }
  };

  merge(values);
  return result;
}

function parseConfig(text: string): JsonObject {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as JsonObject;
  if (errors.length > 0 || !value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('OpenCode configuration must contain valid JSONC object');
  }
  return value;
}

function currentPath(source: JsonObject, path: (string | number)[]): unknown {
  return path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as JsonObject)[key] : undefined, source);
}

export async function ensureV2Config(manifest: PluginManifest, directory = configDirectory()): Promise<string[]> {
  await mkdir(directory, { recursive: true });
  const paths = ['opencode.json', 'opencode.jsonc'].map((name) => join(directory, name));
  const existing = paths.filter(existsSync);
  const targets = existing.length > 0 ? existing : [paths[1]!];
  const values = renderV2Config(manifest);
  const updated: string[] = [];

  for (const path of targets) {
    const original = existsSync(path) ? await readFile(path, 'utf8') : '{}\n';
    const next = mergeMissing(original, values);
    if (next === original) continue;
    await writeFile(path, next);
    updated.push(path);
  }
  return updated;
}
