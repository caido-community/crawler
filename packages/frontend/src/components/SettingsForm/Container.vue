<script setup lang="ts">
import InputNumber from "primevue/inputnumber";
import InputSwitch from "primevue/inputswitch";
import InputText from "primevue/inputtext";

import { useConfigStore } from "@/stores/config";

const configStore = useConfigStore();

const handleUpdateConfig = async <K extends keyof typeof configStore.config>(
  key: K,
  value: (typeof configStore.config)[K],
) => {
  await configStore.updateConfig({ [key]: value });
};

const handleUserAgentBlur = (event: Event) => {
  const target = event.target as HTMLInputElement;
  handleUpdateConfig("userAgent", target.value);
};
</script>

<template>
  <div class="flex flex-col gap-6 p-4">
    <div class="flex flex-col gap-4">
      <div
        class="flex items-start justify-between gap-4 py-3 border-b border-surface-700"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <label class="text-sm font-medium text-surface-200">
            Enable auto-crawl on new hosts
          </label>
          <p class="text-xs text-surface-500">
            Start a crawl automatically when traffic to a new host is seen.
          </p>
        </div>
        <InputSwitch
          :model-value="configStore.config.enabled"
          @update:model-value="handleUpdateConfig('enabled', $event)"
        />
      </div>
      <div
        class="flex items-start justify-between gap-4 py-3 border-b border-surface-700"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <label class="text-sm font-medium text-surface-200">
            Crawl in-scope only
          </label>
          <p class="text-xs text-surface-500">
            Limit discovered URLs to the current project scope.
          </p>
        </div>
        <InputSwitch
          :model-value="configStore.config.crawlInScopeOnly"
          @update:model-value="handleUpdateConfig('crawlInScopeOnly', $event)"
        />
      </div>
      <div
        class="flex items-start justify-between gap-4 py-3 border-b border-surface-700"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <label class="text-sm font-medium text-surface-200">
            Respect robots.txt
          </label>
          <p class="text-xs text-surface-500">
            Skip URLs disallowed by the site's robots.txt.
          </p>
        </div>
        <InputSwitch
          :model-value="configStore.config.respectRobotsTxt"
          @update:model-value="handleUpdateConfig('respectRobotsTxt', $event)"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-300">Max Depth</label>
        <InputNumber
          :model-value="configStore.config.maxDepth"
          :min="1"
          :max="10"
          @update:model-value="handleUpdateConfig('maxDepth', $event ?? 3)"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-300">Max Pages</label>
        <InputNumber
          :model-value="configStore.config.maxPagesPerDomain"
          :min="1"
          :max="10000"
          @update:model-value="
            handleUpdateConfig('maxPagesPerDomain', $event ?? 100)
          "
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-300">Delay (ms)</label>
        <InputNumber
          :model-value="configStore.config.requestDelay"
          :min="0"
          :max="10000"
          @update:model-value="
            handleUpdateConfig('requestDelay', $event ?? 100)
          "
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-surface-300"
          >Manual crawl agents</label
        >
        <InputNumber
          :model-value="configStore.config.manualCrawlAgents"
          :min="1"
          :max="20"
          @update:model-value="
            handleUpdateConfig('manualCrawlAgents', $event ?? 5)
          "
        />
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium text-surface-300">User Agent</label>
      <InputText
        :model-value="configStore.config.userAgent"
        class="w-full"
        @blur="handleUserAgentBlur"
      />
    </div>

    <div class="flex flex-col gap-4 pt-4 mt-4 border-t border-surface-700">
      <div
        class="flex items-start justify-between gap-4 py-3 border-b border-surface-700"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <label class="text-sm font-medium text-surface-200">
            Developer mode
          </label>
          <p class="text-xs text-surface-500">
            Show extra options for testing (e.g. disable HTTP history for
            seeds).
          </p>
        </div>
        <InputSwitch
          :model-value="configStore.config.devMode ?? false"
          @update:model-value="handleUpdateConfig('devMode', $event)"
        />
      </div>
      <template v-if="configStore.config.devMode">
        <div
          class="flex items-start justify-between gap-4 py-3 border-b border-surface-700"
        >
          <div class="flex flex-col gap-0.5 min-w-0">
            <label class="text-sm font-medium text-surface-200">
              Disable HTTP history for crawl seeds
            </label>
            <p class="text-xs text-surface-500">
              Manual crawls use only the start URL as seed; no URLs from HTTP
              history.
            </p>
          </div>
          <InputSwitch
            :model-value="configStore.config.devModeDisableHttpHistory ?? false"
            @update:model-value="
              handleUpdateConfig('devModeDisableHttpHistory', $event)
            "
          />
        </div>
      </template>
    </div>
  </div>
</template>
