<script setup lang="ts">
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import MenuBar from "primevue/menubar";

import { useAppNavigation } from "@/composables/useAppNavigation";

const { navItems, component } = useAppNavigation();
</script>

<template>
  <div class="h-full flex flex-col gap-1">
    <ConfirmDialog />
    <MenuBar class="h-12 gap-2" :model="navItems">
      <template #start>
        <div class="px-2 font-bold text-gray-300">Crawler</div>
      </template>

      <template #item="{ item }">
        <Button
          :severity="item.isActive?.() ? 'secondary' : 'contrast'"
          :outlined="item.isActive?.()"
          size="small"
          :text="!item.isActive?.()"
          :label="item.label"
          class="!border-surface-700"
          @mousedown="item.command?.()"
        />
      </template>
    </MenuBar>
    <div class="flex-1 min-h-0">
      <component :is="component" />
    </div>
  </div>
</template>
