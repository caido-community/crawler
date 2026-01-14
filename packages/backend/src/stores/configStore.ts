import { type CrawlConfig, CrawlConfigSchema, DEFAULT_CONFIG } from "shared";

import { requireSDK } from "../sdk";

import { ProjectScopedStore } from "./projectStore";

class ConfigStore extends ProjectScopedStore<CrawlConfig> {
  constructor() {
    super("crawler-config");
  }

  protected getDefaultData(): CrawlConfig {
    return { ...DEFAULT_CONFIG };
  }

  getConfig(): CrawlConfig {
    return this.data;
  }

  updateConfig(newConfig: Partial<CrawlConfig>): void {
    const result = CrawlConfigSchema.partial().safeParse(newConfig);
    if (!result.success) {
      throw new Error("Invalid config passed into updateConfig.");
    }

    this.data = { ...this.data, ...newConfig };
    this.notify();
    this.saveToFile();

    const sdk = requireSDK();
    sdk.api.send("config:updated", this.data);
  }
}

export const configStore = new ConfigStore();
