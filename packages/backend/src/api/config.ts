import type { SDK } from "caido:plugin";
import { type CrawlConfig, CrawlConfigSchema, type Result } from "shared";

import { configStore } from "../stores/configStore";

export function getConfig(_sdk: SDK): Result<CrawlConfig> {
  return { kind: "Ok", value: configStore.getConfig() };
}

export function updateConfig(
  _sdk: SDK,
  newConfig: Partial<CrawlConfig>,
): Result<CrawlConfig> {
  const result = CrawlConfigSchema.partial().safeParse(newConfig);
  if (!result.success) {
    return {
      kind: "Error",
      error: "Invalid configuration parameters.",
    };
  }

  configStore.updateConfig(newConfig);
  return { kind: "Ok", value: configStore.getConfig() };
}
