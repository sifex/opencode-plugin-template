/**
 * Compatibility adapter for OpenCode's incompatible plugin APIs.
 *
 * V1 reads `server`; V2 reads `setup`. Both runtimes ignore the other field,
 * so one auto-discovered loader works with either generation.
 */

import v1 from './v1/index.js';
import v2 from './v2/index.js';

const OpenCodePluginInjector = {
  id: 'opencode-plugin-template',
  server: v1,
  setup: v2.setup,
};

export default OpenCodePluginInjector;
