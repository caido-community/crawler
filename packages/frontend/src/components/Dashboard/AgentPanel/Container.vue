<script setup lang="ts">
import Button from "primevue/button";
import { computed, onMounted, ref, watch } from "vue";

import { useJobsStore } from "@/stores/jobs";
import type { CrawlJob, CrawlJobAgent, CrawlJobAgentStatus } from "@/types";
import {
  getAgentDotClass,
  getAgentDotClassFromAgentStatus,
} from "@/utils/crawlJobStatus";

function agentStatusLabel(status: CrawlJobAgentStatus | undefined): string {
  if (status === undefined) return "—";
  switch (status) {
    case "running":
      return "Crawling";
    case "idle":
      return "Idle";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "completed":
      return "Done";
    default:
      return status;
  }
}

const props = withDefaults(
  defineProps<{
    job: CrawlJob;
    selectedAgentIndex: number;
  }>(),
  { selectedAgentIndex: 1 },
);

const emit = defineEmits<{
  selectAgent: [index: number];
}>();

const jobsStore = useJobsStore();
const agentStatuses = ref<CrawlJobAgent[]>([]);

const agentCount = computed(() => props.job.agentCount ?? 0);

const fetchAgentStatuses = async () => {
  const list = await jobsStore.getJobAgents(props.job.id);
  agentStatuses.value = list;
};

const agentStatus = (agentId: number) =>
  agentStatuses.value.find((a) => a.agentId === agentId)?.status;

const dotClass = (agentId: number) => {
  const status = agentStatus(agentId);
  if (status !== undefined) {
    return getAgentDotClassFromAgentStatus(status);
  }
  return getAgentDotClass(props.job.status);
};

const isAgentRunning = (agentId: number) => agentStatus(agentId) === "running";
const isAgentPaused = (agentId: number) => agentStatus(agentId) === "paused";
const isJobPaused = computed(() => props.job.status === "paused");
const canShowAgentControls = computed(
  () => props.job.status === "running" || props.job.status === "paused",
);
const canControlAgent = (agentId: number) => {
  const s = agentStatus(agentId);
  return s === "running" || s === "paused" || s === "idle";
};

const selectAgent = (index: number) => {
  emit("selectAgent", index);
};

const pausingAgentId = ref<number | undefined>();
const resumingAgentId = ref<number | undefined>();
const stoppingAgentId = ref<number | undefined>();

const handlePause = async (agentId: number) => {
  if (pausingAgentId.value !== undefined) return;
  pausingAgentId.value = agentId;
  await jobsStore.pauseAgent(props.job.id, agentId);
  await fetchAgentStatuses();
  pausingAgentId.value = undefined;
};

const handleResume = async (agentId: number) => {
  if (resumingAgentId.value !== undefined) return;
  resumingAgentId.value = agentId;
  await jobsStore.resumeAgent(props.job.id, agentId);
  await fetchAgentStatuses();
  resumingAgentId.value = undefined;
};

onMounted(() => fetchAgentStatuses());
watch(
  () => props.job.id,
  () => fetchAgentStatuses(),
);
watch(
  () => props.job.status,
  (status) => {
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "failed"
    ) {
      fetchAgentStatuses();
    }
  },
);

const handleStop = (agentId: number) => {
  if (stoppingAgentId.value !== undefined) return;
  stoppingAgentId.value = agentId;
  jobsStore
    .stopAgent(props.job.id, agentId)
    .then(() => fetchAgentStatuses())
    .finally(() => {
      stoppingAgentId.value = undefined;
    });
};
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <span class="text-sm font-medium text-surface-300 px-2 pb-2 shrink-0"
      >Agents</span
    >
    <div
      v-if="agentCount > 0"
      class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1"
    >
      <div
        v-for="i in agentCount"
        :key="i"
        :class="[
          'flex items-center gap-2 w-full text-left px-3 py-2 rounded border shrink-0 transition-colors',
          selectedAgentIndex === i
            ? 'bg-surface-800 border-secondary-500/50'
            : 'bg-surface-800/80 border-surface-700 hover:border-surface-600',
        ]"
      >
        <button
          type="button"
          class="flex items-center gap-2 min-w-0 flex-1"
          @click="selectAgent(i)"
        >
          <div :class="['w-2 h-2 rounded-full shrink-0', dotClass(i)]" />
          <span class="text-sm text-surface-300 truncate">
            Crawl Agent {{ i }}
            <span class="text-surface-500 font-normal">
              · {{ agentStatusLabel(agentStatus(i)) }}
            </span>
          </span>
        </button>
        <div
          class="flex items-center gap-1 shrink-0"
          @mousedown.stop
          @click.stop
        >
          <Button
            v-if="
              canShowAgentControls && canControlAgent(i) && isAgentRunning(i)
            "
            severity="secondary"
            outlined
            size="small"
            icon="fas fa-pause"
            class="!p-1.5 !min-w-0"
            :disabled="isJobPaused || pausingAgentId === i"
            @mousedown.prevent.stop="handlePause(i)"
          />
          <Button
            v-if="
              canShowAgentControls && canControlAgent(i) && isAgentPaused(i)
            "
            severity="secondary"
            outlined
            size="small"
            icon="fas fa-play"
            class="!p-1.5 !min-w-0"
            :disabled="isJobPaused || resumingAgentId === i"
            @mousedown.prevent.stop="handleResume(i)"
          />
          <Button
            v-if="canShowAgentControls && canControlAgent(i)"
            severity="danger"
            outlined
            size="small"
            icon="fas fa-stop"
            class="!p-1.5 !min-w-0"
            :disabled="isJobPaused || stoppingAgentId === i"
            @mousedown.stop
            @click.stop.prevent="handleStop(i)"
          />
        </div>
      </div>
    </div>
    <p v-else class="text-xs text-surface-500 px-2 py-4 shrink-0">
      No agents for this crawl.
    </p>
  </div>
</template>
