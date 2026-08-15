/**
 * OpenCode V2 plugin entry point.
 *
 * V2 does not expose V1's mutable config hook. The managed manifest is merged
 * into the global JSONC configuration during setup; restart OpenCode to load
 * values added on the first V2 launch.
 */

import { ensureV2Config } from '../lib/v2-config.js';
import { manifest } from '../manifest.js';

const OpenCodeV2Plugin = {
  id: 'opencode-plugin-template',
  async setup() {
    await ensureV2Config(manifest);
  },
};

export default OpenCodeV2Plugin;
