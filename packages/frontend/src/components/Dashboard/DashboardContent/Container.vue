<script setup lang="ts">
import { CrawlJobDetail, LogPanel } from "@/components/Dashboard";
import type { CrawlJob, CrawlLogEntry } from "@/types";

defineProps<{
  job: CrawlJob;
  selectedAgentIndex: number;
  logLines: CrawlLogEntry[];
  agentLogLines: CrawlLogEntry[];
}>();

defineEmits<{
  selectAgent: [index: number];
}>();
</script>

<template>
  <div class="flex-1 flex gap-3 min-h-0 overflow-hidden">
    <div class="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <CrawlJobDetail
        :job="job"
        :selected-agent-index="selectedAgentIndex"
        @select-agent="$emit('selectAgent', $event)"
      />
    </div>
    <div class="w-1/2 flex flex-col min-h-0 gap-2">
      <div class="h-1/2 min-h-[12rem] flex flex-col overflow-hidden">
        <LogPanel title="General Logs" :lines="logLines" />
      </div>
      <div class="h-1/2 min-h-[12rem] flex flex-col overflow-hidden">
        <LogPanel
          :title="`Crawl Agent ${selectedAgentIndex} Logs`"
          :lines="agentLogLines"
        />
      </div>
    </div>
  </div>
</template>
