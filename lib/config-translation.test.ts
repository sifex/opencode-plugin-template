import { describe, expect, it } from 'bun:test';

import type { PluginManifest } from '../manifest.js';
import { renderV1Config, renderV2Config, translateV1ToV2, translateV2ToV1 } from './config-translation.js';

const manifest: PluginManifest = {
  share: 'disabled',
  providers: {
    anthropic: {
      package: '@ai-sdk/anthropic',
      name: 'Example Anthropic',
      settings: { baseURL: 'https://example.test/v1', apiKey: 'placeholder' },
      headers: { 'x-team': 'example' },
      body: { thinking: { type: 'enabled' } },
      models: {
        'example-model': {
          modelID: 'upstream-model',
          name: 'Example model',
          capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
          limit: { context: 1000, output: 100 },
          cost: { input: 1, output: 2, cache: { read: 0.1, write: 0.2 } },
          settings: { maxTokens: 100 },
        },
      },
    },
  },
  mcpServers: {
    enabled: { type: 'remote', url: 'https://example.test/mcp', timeout: 5000 },
    disabled: { type: 'local', command: ['npx', 'example-mcp'], disabled: true },
  },
};

describe('configuration renderers', () => {
  it.each([
    ['V1', renderV1Config, {
      share: 'disabled',
      provider: {
        anthropic: {
          npm: '@ai-sdk/anthropic',
          api: 'https://example.test/v1',
          options: { baseURL: 'https://example.test/v1', apiKey: 'placeholder', headers: { 'x-team': 'example' }, thinking: { type: 'enabled' } },
        },
      },
      mcp: {
        enabled: { type: 'remote', url: 'https://example.test/mcp', timeout: 5000 },
        disabled: { type: 'local', command: ['npx', 'example-mcp'], enabled: false },
      },
    }],
    ['V2', renderV2Config, {
      share: 'disabled',
      providers: {
        anthropic: {
          package: 'aisdk:@ai-sdk/anthropic',
          settings: { baseURL: 'https://example.test/v1', apiKey: 'placeholder' },
          headers: { 'x-team': 'example' },
          body: { thinking: { type: 'enabled' } },
        },
      },
      mcp: {
        servers: {
          enabled: { type: 'remote', url: 'https://example.test/mcp', timeout: { catalog: 5000, execution: 5000 } },
          disabled: { type: 'local', command: ['npx', 'example-mcp'], disabled: true },
        },
      },
    }],
  ])('%s renders providers and MCP enablement', (_version, render, expected) => {
    const config = render(manifest) as any;
    const expectedConfig = expected as any;
    expect(config.share).toBe(expected.share);
    expect(config.provider ?? config.providers).toMatchObject(expectedConfig.provider ?? expectedConfig.providers);
    expect(config.mcp).toEqual(expectedConfig.mcp);
  });

  it.each([
    ['empty manifest', {}, {}],
    ['share only', { share: 'manual' }, { share: 'manual' }],
    ['empty collections', { providers: {}, mcpServers: {} }, {}],
  ] satisfies [string, PluginManifest, Record<string, unknown>][])('%s does not emit empty configuration sections', (_name, source, expected) => {
    expect(renderV1Config(source)).toEqual(expected);
    expect(renderV2Config(source)).toEqual(expected);
  });
});

describe('V1/V2 structural translation', () => {
  it.each([
    ['provider package', { provider: { example: { npm: '@ai-sdk/openai', options: {} } } }, { providers: { example: { package: 'aisdk:@ai-sdk/openai', settings: {} } } }],
    ['provider headers', { provider: { example: { npm: 'custom', options: { headers: { authorization: 'Bearer token' } } } } }, { providers: { example: { package: 'custom', settings: {}, headers: { authorization: 'Bearer token' } } } }],
    ['MCP enabled and timeout', { mcp: { example: { type: 'remote', enabled: true, timeout: 42 } } }, { mcp: { servers: { example: { type: 'remote', disabled: false, timeout: { catalog: 42, execution: 42 } } } } }],
    ['MCP disabled', { mcp: { example: { type: 'local', command: ['example'], enabled: false } } }, { mcp: { servers: { example: { type: 'local', command: ['example'], disabled: true } } } }],
    ['model metadata', { provider: { example: { npm: 'custom', options: {}, models: { model: { id: 'upstream', tool_call: true, modalities: { input: ['text'], output: ['text'] }, status: 'deprecated', cost: { cache_read: 1, cache_write: 2 } } } } } }, { providers: { example: { package: 'custom', settings: {}, models: { model: { modelID: 'upstream', capabilities: { tools: true, input: ['text'], output: ['text'] }, disabled: true, cost: { cache: { read: 1, write: 2 } } } } } } }],
  ])('translates V1 %s', (_name, v1, v2) => {
    expect(translateV1ToV2(v1)).toEqual(v2);
  });

  it.each([
    ['provider package', { providers: { example: { package: 'aisdk:@ai-sdk/openai', settings: {} } } }, { provider: { example: { npm: '@ai-sdk/openai', options: {} } } }],
    ['provider headers', { providers: { example: { package: 'custom', settings: {}, headers: { authorization: 'Bearer token' } } } }, { provider: { example: { npm: 'custom', options: { headers: { authorization: 'Bearer token' } } } } }],
    ['MCP enabled and timeout', { mcp: { servers: { example: { type: 'remote', disabled: false, timeout: { catalog: 42, execution: 42 } } } } }, { mcp: { example: { type: 'remote', enabled: true, timeout: 42 } } }],
    ['MCP disabled', { mcp: { servers: { example: { type: 'local', command: ['example'], disabled: true } } } }, { mcp: { example: { type: 'local', command: ['example'], enabled: false } } }],
    ['model metadata', { providers: { example: { package: 'custom', settings: {}, models: { model: { modelID: 'upstream', capabilities: { tools: true, input: ['text'], output: ['text'] }, disabled: true, cost: { cache: { read: 1, write: 2 } } } } } } }, { provider: { example: { npm: 'custom', options: {}, models: { model: { id: 'upstream', tool_call: true, modalities: { input: ['text'], output: ['text'] }, status: 'deprecated', cost: { cache_read: 1, cache_write: 2 } } } } } }],
  ])('translates V2 %s', (_name, v2, v1) => {
    expect(translateV2ToV1(v2)).toEqual(v1);
  });
});
