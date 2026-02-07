<script setup lang="ts">
import Card from "primevue/card";

import { SettingsForm } from "@/components/SettingsForm";
import { useSettings } from "@/composables/useSettings";

useSettings();
</script>

<template>
  <div class="flex flex-col h-full gap-1.5 overflow-y-auto">
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
            <h3 class="text-lg font-semibold text-surface-200">Settings</h3>
            <p class="text-sm text-surface-400">
              Configure crawler behavior, limits, and auto-crawl options.
            </p>
          </div>
        </div>
      </template>
    </Card>

    <Card
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <SettingsForm />
      </template>
    </Card>
  </div>
</template>
