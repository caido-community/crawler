import { defineStore } from "pinia";
import { ref } from "vue";

import { useSDK } from "@/plugins/sdk";
import type { CrawlConfig } from "@/types";

const defaultConfig: CrawlConfig = {
  enabled: false,
  crawlInScopeOnly: false,
  crawlOnNewHost: false,
  requestDelay: 100,
  maxDepth: 5,
  maxPagesPerDomain: 100,
  manualCrawlAgents: 5,
  includePatterns: [],
  excludePatterns: [],
  respectRobotsTxt: false,
  userAgent: "Caido-Crawler",
};

export const useConfigStore = defineStore("config", () => {
  const sdk = useSDK();
  const config = ref<CrawlConfig>(defaultConfig);
  const loading = ref(false);

  const loadConfig = async () => {
    loading.value = true;
    try {
      const result = await sdk.backend.getConfig();
      if (result.kind === "Ok") {
        config.value = result.value;
      } else {
        sdk.window.showToast("Failed to load configuration", {
          variant: "error",
        });
      }
    } catch (error) {
      sdk.window.showToast("Failed to load configuration", {
        variant: "error",
      });
    } finally {
      loading.value = false;
    }
  };

  const updateConfig = async (updates: Partial<CrawlConfig>) => {
    loading.value = true;
    try {
      const result = await sdk.backend.updateConfig(updates);
      if (result.kind === "Ok") {
        config.value = result.value;
        sdk.window.showToast("Configuration saved", { variant: "success" });
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to save configuration", {
        variant: "error",
      });
    } finally {
      loading.value = false;
    }
  };

  const toggleEnabled = async () => {
    await updateConfig({ enabled: !config.value.enabled });
  };

  return {
    config,
    loading,
    loadConfig,
    updateConfig,
    toggleEnabled,
  };
});
