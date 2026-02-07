<script setup lang="ts">
import Card from "primevue/card";
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
          <h3 class="text-lg font-semibold text-surface-200">Crawl jobs</h3>
          <p class="text-sm text-surface-400">
            Running and completed crawls. Select one to view details and logs.
          </p>
        </div>
      </div>
    </template>
  </Card>
</template>
