<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import ContextMenu from "primevue/contextmenu";
import InputText from "primevue/inputtext";
import { computed, nextTick, ref } from "vue";

import { useJobsStore } from "@/stores/jobs";
import type { CrawlJob } from "@/types";
import { getStatusColor } from "@/utils/crawlJobStatus";

const jobsStore = useJobsStore();

const jobs = computed(() => jobsStore.jobs);
const selectedJobId = computed(() => jobsStore.selectedJobId);

const editingJobId = ref<string | undefined>();
const editingTitle = ref("");
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | undefined>();
const contextMenuJobId = ref<string | undefined>();

const jobDisplayName = (job: CrawlJob) => job.title ?? job.host;

const onSelect = (jobId: string) => {
  if (editingJobId.value === jobId) return;
  jobsStore.setSelectedJob(jobId);
};

const startRename = (job: CrawlJob) => {
  editingJobId.value = job.id;
  editingTitle.value = job.title ?? job.host;
  contextMenuJobId.value = undefined;
  nextTick(() => {
    const el = document.getElementById(`rename-input-${job.id}`);
    (el as HTMLInputElement | undefined)?.focus();
  });
};

const saveRename = async (jobId: string) => {
  const title = editingTitle.value.trim();
  editingJobId.value = undefined;
  if (title.length > 0) {
    await jobsStore.updateJobTitle(jobId, title);
  }
};

const contextMenuItems = computed(() => [
  {
    label: "Rename",
    icon: "fas fa-pen",
    command: () => {
      const id = contextMenuJobId.value;
      if (id === undefined) return;
      const job = jobs.value.find((j) => j.id === id);
      if (job !== undefined) startRename(job);
    },
  },
  {
    label: "Delete",
    icon: "fas fa-trash",
    class: "text-red-400",
    command: () => {
      const id = contextMenuJobId.value;
      if (id !== undefined) jobsStore.deleteJob(id);
    },
  },
]);

const onContextMenu = (event: MouseEvent, jobId: string) => {
  event.preventDefault();
  contextMenuJobId.value = jobId;
  contextMenuRef.value?.show(event);
};
</script>

<template>
  <ContextMenu ref="contextMenuRef" :model="contextMenuItems" />
  <Card
    class="h-fit"
    :pt="{
      body: { class: 'h-fit p-0' },
      content: { class: 'h-fit flex flex-col' },
    }"
  >
    <template #content>
      <div class="flex gap-2 py-2 px-3 overflow-x-auto flex-wrap">
        <div
          v-for="job in jobs"
          :key="job.id"
          class="relative"
          @contextmenu="onContextMenu($event, job.id)"
        >
          <Button
            :class="[
              selectedJobId === job.id
                ? '!border-secondary-400'
                : '!border-surface-700',
              '!bg-surface-900 border-[1px] rounded-md !ring-0',
            ]"
            severity="contrast"
            size="small"
            outlined
            @mousedown="onSelect(job.id)"
            @dblclick.prevent="startRename(job)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div
                :class="[
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  getStatusColor(job.status),
                ]"
              />
              <template v-if="editingJobId === job.id">
                <InputText
                  :id="`rename-input-${job.id}`"
                  v-model="editingTitle"
                  class="!py-0 !h-6 !text-sm !w-32"
                  @blur="saveRename(job.id)"
                  @keydown.enter="saveRename(job.id)"
                  @keydown.escape="editingJobId = undefined"
                  @click.stop
                  @mousedown.stop
                />
              </template>
              <span v-else class="whitespace-nowrap truncate">{{
                jobDisplayName(job)
              }}</span>
            </div>
          </Button>
        </div>
      </div>
    </template>
  </Card>
</template>
