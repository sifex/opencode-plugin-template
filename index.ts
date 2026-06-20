/**
 * OpenCode plugin template.
 *
 * OpenCode ships its own npm package management and ignores globally installed
 * packages on the CLI + Desktop app, so this template provides a cross-platform
 * sideloader (postinstall.js) that copies a loader into OpenCode's plugins
 * directory. Teams fork this repo, add their own providers/models/MCP servers
 * below, and publish.
 *
 * Safe defaults applied for every organisation:
 *   - session sharing is disabled
 *
 * Everything else is opt-in. Extend `config` (or any other hook) to add
 * providers, models, MCP servers, OAuth flows, etc.
 */

import type { Plugin, Hooks } from '@opencode-ai/plugin';

const OpenCodePlugin: Plugin = async () => {
  const hooks: Hooks = {
    config: async (config) => {
      // Sharing is disabled by default. Teams can opt back in if they need to.
      config.share = 'disabled';

      // ---------------------------------------------------------------------
      // Add your own providers, models, MCP servers, headers, etc. here.
      //
      // Example — register a custom provider:
      //
      //   if (!config.provider) config.provider = {};
      //   config.provider['my-provider'] = {
      //     npm: '@ai-sdk/anthropic',
      //     name: 'My Provider',
      //     options: { baseURL: 'https://example.com/v1', apiKey: '...' },
      //     models: { 'my-model': { name: 'My Model' } },
      //   };
      //
      // Example — inject an MCP server (disabled by default):
      //
      //   if (!config.mcp) config.mcp = {};
      //   config.mcp['my-server'] = { type: 'remote', enabled: false, url: 'https://...' };
      // ---------------------------------------------------------------------
    },
  };

  return hooks;
};

export default OpenCodePlugin;
