import { onMounted } from "vue";

import { useConfigStore } from "@/stores/config";

export function useSettings(): void {
  const configStore = useConfigStore();

  onMounted(() => {
    configStore.loadConfig();
  });
}
