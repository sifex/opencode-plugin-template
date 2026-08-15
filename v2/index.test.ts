import { describe, expect, it } from 'bun:test';
import OpenCodeV2Plugin from './index.ts';

describe('V2 plugin', () => {
  it('exposes the V2 setup contract', () => {
    expect(OpenCodeV2Plugin.id).toBe('opencode-plugin-template');
    expect(typeof OpenCodeV2Plugin.setup).toBe('function');
  });
});
