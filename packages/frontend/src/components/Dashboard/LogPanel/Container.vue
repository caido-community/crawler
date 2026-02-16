<script setup lang="ts">
import Card from "primevue/card";
import { nextTick, onMounted, ref, watch } from "vue";

import type { CrawlLogEntry } from "@/types";
import { getLogLabel, getLogLineClass } from "@/utils/logLineUtils";

const props = withDefaults(
  defineProps<{
    lines: CrawlLogEntry[];
    title?: string;
  }>(),
  { title: "Logs" },
);

const scrollContainerRef = ref<HTMLElement | undefined>(undefined);
const userScrolledUp = ref(false);
const scrollThreshold = 50;

const scrollToBottom = () => {
  const el = scrollContainerRef.value;
  if (el !== undefined && !userScrolledUp.value) {
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }
};

const onScroll = () => {
  const el = scrollContainerRef.value;
  if (el === undefined) return;
  const atBottom =
    el.scrollHeight - el.scrollTop - el.clientHeight <= scrollThreshold;
  userScrolledUp.value = !atBottom;
};

watch(
  () => props.lines.length,
  () => {
    nextTick(() => scrollToBottom());
  },
);

onMounted(() => {
  nextTick(() => scrollToBottom());
});
</script>

<template>
  <Card
    class="h-full flex flex-col min-h-0"
    :pt="{
      root: { class: 'h-full flex flex-col' },
      body: { class: 'h-full p-0 flex flex-col min-h-0' },
      content: { class: 'h-full flex flex-col min-h-0 overflow-hidden' },
    }"
  >
    <template #header>
      <div class="py-2 px-3 text-sm font-medium text-surface-300">
        {{ title }}
      </div>
    </template>
    <template #content>
      <div
        ref="scrollContainerRef"
        class="flex-1 overflow-y-auto p-2 font-mono text-xs bg-surface-900 rounded border border-surface-700"
        @scroll="onScroll"
      >
        <div
          v-for="(entry, i) in lines"
          :key="i"
          :class="[
            getLogLineClass(entry.level),
            'whitespace-pre-wrap break-all py-0.5 flex gap-2 items-baseline',
          ]"
        >
          <span
            class="shrink-0 whitespace-nowrap font-medium"
            :aria-label="getLogLabel(entry.level)"
          >
            [{{ getLogLabel(entry.level) }}]
          </span>
          <span>{{ entry.line }}</span>
        </div>
        <div v-if="lines.length === 0" class="text-surface-500">
          No log entries yet.
        </div>
      </div>
    </template>
  </Card>
</template>
