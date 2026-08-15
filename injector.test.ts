import { describe, expect, it } from 'bun:test';
import plugin from './injector.ts';

describe('compatibility injector', () => {
  it('exports both OpenCode plugin contracts', () => {
    expect(plugin.id).toBe('opencode-plugin-template');
    expect(typeof plugin.server).toBe('function');
    expect(typeof plugin.setup).toBe('function');
  });
});
