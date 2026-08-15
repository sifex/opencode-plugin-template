import type { MCPServerDefinition, ModelDefinition, PluginManifest, ProviderDefinition } from '../manifest.js';

type JsonObject = Record<string, unknown>;

function hasEntries(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return !!value && Object.keys(value).length > 0;
}

function toV1Package(packageName: string): string {
  return packageName.replace(/^aisdk:/, '');
}

function toV2Package(packageName: string): string {
  return packageName.startsWith('@ai-sdk/') ? `aisdk:${packageName}` : packageName;
}

function toV1Model(model: ModelDefinition): JsonObject {
  const { modelID, capabilities, disabled, settings, cost, ...rest } = model;
  const { cache, ...costWithoutCache } = cost ?? {};
  const cacheValues = typeof cache === 'object' && cache !== null ? cache as { read?: number; write?: number } : undefined;
  return {
    ...rest,
    ...(modelID ? { id: modelID } : {}),
    ...(capabilities ? {
      tool_call: capabilities.tools,
      modalities: { input: capabilities.input, output: capabilities.output },
    } : {}),
    ...(disabled ? { status: 'deprecated' } : {}),
    ...(cost ? { cost: { ...costWithoutCache, ...(cacheValues ? { cache_read: cacheValues.read, cache_write: cacheValues.write } : {}) } } : {}),
    ...(settings ? { options: settings } : {}),
  };
}

function toV2Model(model: JsonObject): ModelDefinition {
  const { id, tool_call, modalities, status, options, cost, ...rest } = model;
  const v1Cost = cost as JsonObject | undefined;
  const { cache_read, cache_write, ...costRest } = v1Cost ?? {};
  const modality = modalities as JsonObject | undefined;
  return {
    ...rest,
    ...(typeof id === 'string' ? { modelID: id } : {}),
    ...(typeof tool_call === 'boolean' || modality ? {
      capabilities: {
        ...(typeof tool_call === 'boolean' ? { tools: tool_call } : {}),
        ...(Array.isArray(modality?.input) ? { input: modality.input as string[] } : {}),
        ...(Array.isArray(modality?.output) ? { output: modality.output as string[] } : {}),
      },
    } : {}),
    ...(status === 'deprecated' ? { disabled: true } : {}),
    ...(v1Cost ? { cost: { ...costRest, ...((typeof cache_read === 'number' || typeof cache_write === 'number') ? { cache: { ...(typeof cache_read === 'number' ? { read: cache_read } : {}), ...(typeof cache_write === 'number' ? { write: cache_write } : {}) } } : {}) } } : {}),
    ...(options && typeof options === 'object' ? { settings: options as JsonObject } : {}),
  };
}

function toV1Provider(provider: ProviderDefinition): JsonObject {
  return {
    npm: toV1Package(provider.package),
    ...(provider.name ? { name: provider.name } : {}),
    ...(typeof provider.settings?.baseURL === 'string' ? { api: provider.settings.baseURL } : {}),
    options: {
      ...provider.settings,
      ...(provider.headers ? { headers: provider.headers } : {}),
      ...provider.body,
    },
    ...(provider.models ? { models: Object.fromEntries(Object.entries(provider.models).map(([id, model]) => [id, toV1Model(model)])) } : {}),
  };
}

function toV2Provider(provider: JsonObject): ProviderDefinition {
  const { npm, name, api, options, models } = provider;
  const v1Options = options && typeof options === 'object' ? options as JsonObject : {};
  const { headers, ...settings } = v1Options;
  return {
    package: toV2Package(String(npm ?? '')),
    ...(typeof name === 'string' ? { name } : {}),
    settings: { ...settings, ...(typeof api === 'string' ? { baseURL: api } : {}) },
    ...(headers && typeof headers === 'object' ? { headers: headers as Record<string, string> } : {}),
    ...(models && typeof models === 'object' ? { models: Object.fromEntries(Object.entries(models as JsonObject).map(([id, model]) => [id, toV2Model(model as JsonObject)])) } : {}),
  };
}

export function renderV1Config(source: PluginManifest): JsonObject {
  const providers = source.providers && Object.fromEntries(Object.entries(source.providers).map(([id, provider]) => [id, toV1Provider(provider)]));
  const servers = source.mcpServers && Object.fromEntries(Object.entries(source.mcpServers).map(([id, server]) => {
    const { disabled, ...rest } = server;
    return [id, { ...rest, ...(disabled === undefined ? {} : { enabled: !disabled }) }];
  }));
  return {
    ...(source.share ? { share: source.share } : {}),
    ...(hasEntries(providers) ? { provider: providers } : {}),
    ...(hasEntries(servers) ? { mcp: servers } : {}),
  };
}

export function renderV2Config(source: PluginManifest): JsonObject {
  const providers = source.providers && Object.fromEntries(Object.entries(source.providers).map(([id, provider]) => [id, {
    ...(provider.name ? { name: provider.name } : {}),
    package: toV2Package(provider.package),
    ...(provider.settings ? { settings: provider.settings } : {}),
    ...(provider.headers ? { headers: provider.headers } : {}),
    ...(provider.body ? { body: provider.body } : {}),
    ...(provider.models ? { models: provider.models } : {}),
  }]));
  const servers = source.mcpServers && Object.fromEntries(Object.entries(source.mcpServers).map(([id, server]) => {
    const { timeout, ...rest } = server;
    return [id, { ...rest, ...(timeout === undefined ? {} : { timeout: { catalog: timeout, execution: timeout } }) }];
  }));
  return {
    ...(source.share ? { share: source.share } : {}),
    ...(hasEntries(providers) ? { providers } : {}),
    ...(hasEntries(servers) ? { mcp: { servers } } : {}),
  };
}

export function translateV1ToV2(source: JsonObject): JsonObject {
  const providers = source.provider && typeof source.provider === 'object'
    ? Object.fromEntries(Object.entries(source.provider as JsonObject).map(([id, provider]) => [id, toV2Provider(provider as JsonObject)]))
    : undefined;
  const servers = source.mcp && typeof source.mcp === 'object'
    ? Object.fromEntries(Object.entries(source.mcp as JsonObject).map(([id, server]) => {
      const { enabled, timeout, ...rest } = server as JsonObject;
      return [id, { ...rest, ...(typeof enabled === 'boolean' ? { disabled: !enabled } : {}), ...(typeof timeout === 'number' ? { timeout: { catalog: timeout, execution: timeout } } : {}) }];
    }))
    : undefined;
  return {
    ...(source.share ? { share: source.share } : {}),
    ...(providers ? { providers } : {}),
    ...(servers ? { mcp: { servers } } : {}),
  };
}

export function translateV2ToV1(source: JsonObject): JsonObject {
  const providers = source.providers && typeof source.providers === 'object'
    ? Object.fromEntries(Object.entries(source.providers as JsonObject).map(([id, provider]) => [id, toV1Provider(provider as ProviderDefinition)]))
    : undefined;
  const servers = (source.mcp as JsonObject | undefined)?.servers;
  const mcp = servers && typeof servers === 'object'
    ? Object.fromEntries(Object.entries(servers as JsonObject).map(([id, server]) => {
      const { disabled, timeout, ...rest } = server as JsonObject;
      const timeoutConfig = timeout as JsonObject | undefined;
      return [id, { ...rest, ...(typeof disabled === 'boolean' ? { enabled: !disabled } : {}), ...(typeof timeoutConfig?.execution === 'number' ? { timeout: timeoutConfig.execution } : {}) }];
    }))
    : undefined;
  return {
    ...(source.share ? { share: source.share } : {}),
    ...(providers ? { provider: providers } : {}),
    ...(mcp ? { mcp } : {}),
  };
}
