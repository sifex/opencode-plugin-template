/**
 * OpenCode plugin template.
 *
 * OpenCode ships its own npm package management and ignores globally installed
 * packages on the CLI + Desktop app, so this template provides a cross-platform
 * sideloader (postinstall.js) that copies a loader into OpenCode's plugins
 * directory. Teams fork this repo, declare providers/models/MCP servers in the
 * shared manifest, and publish.
 *
 * Safe defaults applied for every organisation:
 *   - session sharing is disabled
 *
 * Everything else is opt-in. Add shared configuration in manifest.ts and V1
 * hooks here only when a runtime-specific behavior is required.
 */

import type { Plugin, Hooks } from '@opencode-ai/plugin';
import { renderV1Config } from '../lib/config-translation.js';
import { manifest } from '../manifest.js';

const OpenCodePlugin: Plugin = async () => {
  const hooks: Hooks = {
    config: async (config) => {
      const managed = renderV1Config(manifest) as typeof config;
      if (managed.share) config.share = managed.share;
      if (managed.provider) config.provider = { ...config.provider, ...managed.provider };
      if (managed.mcp) config.mcp = { ...config.mcp, ...managed.mcp };
    },
  };

  return hooks;
};

export default OpenCodePlugin;
