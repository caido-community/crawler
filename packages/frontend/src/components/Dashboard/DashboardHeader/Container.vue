<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import { useConfirm } from "primevue/useconfirm";
import { computed } from "vue";

import { useJobsStore } from "@/stores/jobs";

const jobsStore = useJobsStore();
const confirm = useConfirm();
const hasJobs = computed(() => jobsStore.jobs.length > 0);

const deleteAllClick = () => {
  confirm.require({
    message:
      "Do you want to delete all crawl jobs? Running crawls will be stopped.",
    header: "Delete all",
    acceptClass: "p-button-danger",
    accept: () => {
      jobsStore.clearAllJobs();
    },
  });
};
</script>

<template>
  <Card
    class="h-fit"
    :pt="{
      body: { class: 'h-fit p-0' },
      content: { class: 'h-fit flex flex-col' },
    }"
  >
    <template #content>
      <div class="flex justify-between items-center p-4">
        <div>
          <h3 class="text-lg font-semibold text-surface-200">Crawl Jobs</h3>
          <p class="text-sm text-surface-400">
            Running and completed crawls. Select one to view details and logs.
          </p>
        </div>
        <Button
          label="Delete all"
          severity="danger"
          outlined
          size="small"
          icon="fas fa-trash"
          :disabled="!hasJobs"
          @click="deleteAllClick"
        />
      </div>
    </template>
  </Card>
</template>
