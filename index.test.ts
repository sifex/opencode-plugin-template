import { describe, expect, it } from "bun:test";
import type { Config } from "@opencode-ai/sdk";
import OpenCodePlugin from "./index.ts";
import type { Hooks } from "@opencode-ai/plugin";

async function runConfigHook(config: Config = {}): Promise<Config> {
  const hooks = await OpenCodePlugin({} as any);
  await (hooks as Hooks).config!(config);
  return config;
}

describe("config hook", () => {
  it("disables sharing by default", async () => {
    const config = await runConfigHook();
    expect(config.share).toBe("disabled");
  });

  it("forces sharing to stay disabled even when user sets it otherwise", async () => {
    const config = await runConfigHook({ share: "enabled" as any });
    expect(config.share).toBe("disabled");
  });

  it("leaves the rest of the config untouched", async () => {
    const config = await runConfigHook({
      model: "openai/gpt-4",
      provider: { openai: { npm: "@ai-sdk/openai" } as any },
    });
    expect(config.model).toBe("openai/gpt-4");
    expect((config.provider as any).openai.npm).toBe("@ai-sdk/openai");
  });
});
