import { onMounted } from "vue";

import { useConfigStore } from "@/stores/config";

export function useSettings() {
  const configStore = useConfigStore();

  onMounted(() => {
    configStore.loadConfig();
  });

  return { configStore };
}
