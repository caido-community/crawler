<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import ProgressBar from "primevue/progressbar";
import { computed } from "vue";

import { AgentPanel } from "@/components/Dashboard";
import { useJobsStore } from "@/stores/jobs";
import type { CrawlJob } from "@/types";
import { getProgressPercent, getStatusColor } from "@/utils/crawlJobStatus";

const props = defineProps<{
  job: CrawlJob;
  selectedAgentIndex: number;
}>();

defineEmits<{
  selectAgent: [index: number];
}>();

const jobsStore = useJobsStore();

const progress = computed(() => getProgressPercent(props.job));
const isRunning = computed(() => props.job.status === "running");
const isPaused = computed(() => props.job.status === "paused");
</script>

<template>
  <Card
    class="h-full"
    :pt="{
      body: { class: 'h-full p-0 min-h-0' },
      content: { class: 'h-full flex flex-col' },
      header: { class: 'bg-surface-800' },
      root: { style: 'min-height: 0' },
    }"
  >
    <template #header>
      <div class="flex items-center justify-between gap-4 px-4 pt-4">
        <div class="flex items-center gap-3">
          <span class="text-base font-medium text-surface-200">{{
            job.title ?? job.host
          }}</span>
          <span class="text-xs text-surface-400 font-mono">{{ job.id }}</span>
          <div class="flex items-center gap-2">
            <div
              :class="['w-2 h-2 rounded-full', getStatusColor(job.status)]"
            />
            <span class="text-xs text-surface-300 uppercase tracking-wide">
              {{ job.status }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button
            v-if="isRunning"
            label="Pause"
            severity="secondary"
            outlined
            size="small"
            icon="fas fa-pause"
            @click="jobsStore.pauseCrawl(job.id)"
          />
          <Button
            v-if="isPaused"
            label="Resume"
            severity="secondary"
            outlined
            size="small"
            icon="fas fa-play"
            @click="jobsStore.resumeCrawl(job.id)"
          />
          <Button
            v-if="isRunning || isPaused"
            label="Stop"
            severity="danger"
            outlined
            size="small"
            icon="fas fa-stop"
            @click="jobsStore.stopCrawl(job.id)"
          />
          <Button
            label="Delete"
            severity="danger"
            outlined
            size="small"
            icon="fas fa-trash"
            @click="jobsStore.deleteJob(job.id)"
          />
        </div>
      </div>
    </template>

    <template #content>
      <div class="flex-1 min-h-0 flex flex-col gap-4 p-4 overflow-hidden">
        <div
          v-if="
            job.status === 'running' ||
            job.status === 'completed' ||
            job.status === 'cancelled'
          "
          class="flex flex-col gap-3 w-full"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm text-surface-300 font-medium"
              >Crawl progress</span
            >
            <span class="text-sm text-surface-200 font-mono font-semibold">
              {{ progress }}%
            </span>
          </div>
          <ProgressBar
            :value="progress"
            class="w-full h-2"
            :show-value="false"
            :pt="{
              root: { class: 'bg-surface-700 rounded-full overflow-hidden' },
              value: {
                class:
                  job.status === 'completed'
                    ? 'h-full transition-all duration-300 ease-out bg-success-500'
                    : job.status === 'cancelled'
                      ? 'h-full transition-all duration-300 ease-out bg-orange-500'
                      : 'h-full transition-all duration-300 ease-out bg-secondary-400',
              },
            }"
          />
        </div>

        <div class="flex flex-wrap items-center gap-4 text-xs">
          <div class="flex items-center gap-2">
            <span class="text-surface-400">Crawled:</span>
            <span class="text-surface-200 font-mono font-medium">{{
              job.crawledUrls
            }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-surface-400">Discovered:</span>
            <span class="text-surface-200 font-mono font-medium">{{
              job.discoveredUrls
            }}</span>
          </div>
          <div
            v-if="job.agentCount !== undefined"
            class="flex items-center gap-2"
          >
            <span class="text-surface-400">Agents:</span>
            <span class="text-surface-200 font-mono font-medium">{{
              job.agentCount
            }}</span>
          </div>
        </div>

        <div
          v-if="job.agentCount !== undefined && job.agentCount > 0"
          class="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <AgentPanel
            :job="job"
            :selected-agent-index="selectedAgentIndex"
            @select-agent="$emit('selectAgent', $event)"
          />
        </div>
      </div>
    </template>
  </Card>
</template>
