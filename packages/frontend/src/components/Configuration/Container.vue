<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import ProgressBar from "primevue/progressbar";
import { computed, onMounted } from "vue";

import { useConfigStore } from "@/stores/config";
import { useJobsStore } from "@/stores/jobs";

const configStore = useConfigStore();
const jobsStore = useJobsStore();

onMounted(() => {
  configStore.loadConfig();
  jobsStore.loadJobs();
});

const activeJobs = computed(() =>
  jobsStore.jobs.filter(
    (j) => j.status === "running" || j.status === "pending",
  ),
);

const completedJobs = computed(() =>
  jobsStore.jobs.filter(
    (j) => j.status === "completed" || j.status === "failed",
  ),
);

const handleUpdateConfig = async <K extends keyof typeof configStore.config>(
  key: K,
  value: (typeof configStore.config)[K],
) => {
  await configStore.updateConfig({ [key]: value });
};

const getJobProgress = (job: (typeof jobsStore.jobs)[0]) => {
  if (job.discoveredUrls === 0) return 0;
  return Math.round((job.crawledUrls / job.discoveredUrls) * 100);
};

const formatDate = (date: Date | undefined) => {
  if (date === undefined) return "";
  const d = new Date(date);
  return d.toLocaleTimeString();
};

const handleUserAgentBlur = (event: Event) => {
  const target = event.target as HTMLInputElement;
  handleUpdateConfig("userAgent", target.value);
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Settings Section -->
    <div class="flex flex-col gap-4">
      <h3 class="text-lg font-semibold">Crawler Settings</h3>

      <!-- Toggles -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Checkbox
            :model-value="configStore.config.enabled"
            binary
            input-id="enabled"
            @update:model-value="handleUpdateConfig('enabled', $event)"
          />
          <label for="enabled" class="cursor-pointer"
            >Enable auto-crawl on new hosts</label
          >
        </div>

        <div class="flex items-center gap-2">
          <Checkbox
            :model-value="configStore.config.crawlInScopeOnly"
            binary
            input-id="inScope"
            @update:model-value="handleUpdateConfig('crawlInScopeOnly', $event)"
          />
          <label for="inScope" class="cursor-pointer"
            >Crawl in-scope only</label
          >
        </div>

        <div class="flex items-center gap-2">
          <Checkbox
            :model-value="configStore.config.respectRobotsTxt"
            binary
            input-id="robots"
            @update:model-value="handleUpdateConfig('respectRobotsTxt', $event)"
          />
          <label for="robots" class="cursor-pointer">Respect robots.txt</label>
        </div>
      </div>

      <!-- Number inputs -->
      <div class="grid grid-cols-3 gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Max Depth</label>
          <InputNumber
            :model-value="configStore.config.maxDepth"
            :min="1"
            :max="10"
            @update:model-value="handleUpdateConfig('maxDepth', $event ?? 3)"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Max Pages</label>
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
          <label class="text-sm font-medium">Delay (ms)</label>
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
          <label class="text-sm font-medium">Manual crawl agents</label>
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

      <!-- User Agent -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">User Agent</label>
        <InputText
          :model-value="configStore.config.userAgent"
          @blur="handleUserAgentBlur"
        />
      </div>
    </div>

    <!-- Active Jobs Section -->
    <div v-if="activeJobs.length > 0" class="flex flex-col gap-3">
      <h3 class="text-lg font-semibold">Active Crawls</h3>

      <div
        v-for="job in activeJobs"
        :key="job.id"
        class="flex flex-col gap-2 p-3 bg-surface-800 rounded"
      >
        <div class="flex justify-between items-center">
          <span class="font-medium">{{ job.host }}</span>
          <div class="flex gap-2">
            <Button
              v-if="job.status === 'running'"
              icon="fas fa-pause"
              severity="secondary"
              size="small"
              @click="jobsStore.pauseCrawl(job.id)"
            />
            <Button
              v-if="job.status === 'paused'"
              icon="fas fa-play"
              severity="secondary"
              size="small"
              @click="jobsStore.resumeCrawl(job.id)"
            />
            <Button
              icon="fas fa-stop"
              severity="danger"
              size="small"
              @click="jobsStore.stopCrawl(job.id)"
            />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <ProgressBar :value="getJobProgress(job)" class="flex-1 h-2" />
          <span class="text-sm text-gray-400">
            {{ job.crawledUrls }}/{{ job.discoveredUrls }}
          </span>
        </div>
      </div>
    </div>

    <!-- Completed Jobs Section -->
    <div v-if="completedJobs.length > 0" class="flex flex-col gap-3">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Completed Crawls</h3>
        <Button
          label="Clear"
          severity="secondary"
          size="small"
          @click="jobsStore.clearCompletedJobs()"
        />
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-for="job in completedJobs.slice(0, 5)"
          :key="job.id"
          class="flex justify-between items-center p-2 bg-surface-800 rounded"
        >
          <span>{{ job.host }}</span>
          <span class="text-sm text-gray-400">
            {{ job.crawledUrls }} URLs - {{ formatDate(job.completedAt) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
