/**
 * The single source of truth for plugin-managed OpenCode configuration.
 *
 * Add providers, models, and MCP servers here. The V1 and V2 adapters render
 * their respective native configuration shapes.
 */

export interface PluginManifest {
  share?: 'auto' | 'disabled' | 'manual';
  providers?: Record<string, ProviderDefinition>;
  mcpServers?: Record<string, MCPServerDefinition>;
}

export interface ProviderDefinition {
  package: string;
  name?: string;
  settings?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  models?: Record<string, ModelDefinition>;
}

export interface ModelDefinition {
  modelID?: string;
  name?: string;
  capabilities?: {
    tools?: boolean;
    input?: string[];
    output?: string[];
  };
  limit?: Record<string, number>;
  cost?: Record<string, number | { read?: number; write?: number }>;
  disabled?: boolean;
  settings?: Record<string, unknown>;
}

export interface MCPServerDefinition {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  disabled?: boolean;
  timeout?: number;
}

export const manifest: PluginManifest = {
  share: 'disabled',
  providers: {},
  mcpServers: {},
};
