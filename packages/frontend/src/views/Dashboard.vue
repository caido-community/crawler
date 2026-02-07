<script setup lang="ts">
import {
  CrawlJobList,
  DashboardContent,
  DashboardEmptyState,
  DashboardHeader,
} from "@/components/Dashboard";
import { useDashboardCrawlEvents } from "@/composables/useDashboardCrawlEvents";
import { useJobsStore } from "@/stores/jobs";

const jobsStore = useJobsStore();
const { logLines, agentLogLines, selectedAgentIndex, selectedJob } =
  useDashboardCrawlEvents();
</script>

<template>
  <div class="flex flex-col h-full min-h-0 gap-1.5 overflow-hidden">
    <DashboardHeader />
    <CrawlJobList v-if="jobsStore.jobs.length > 0" />
    <DashboardEmptyState
      v-if="jobsStore.jobs.length === 0"
      class="flex-1 min-h-0"
    />
    <template v-else-if="selectedJob === undefined">
      <div
        class="flex-1 min-h-0 flex items-center justify-center text-surface-500 text-sm"
      >
        Select a crawl to view details and logs.
      </div>
    </template>
    <DashboardContent
      v-else
      :job="selectedJob"
      :selected-agent-index="selectedAgentIndex"
      :log-lines="logLines"
      :agent-log-lines="agentLogLines"
      @select-agent="selectedAgentIndex = $event"
    />
  </div>
</template>
