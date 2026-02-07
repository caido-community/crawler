import { computed, onMounted, ref } from "vue";

import { useJobsStore } from "@/stores/jobs";
import Dashboard from "@/views/Dashboard.vue";
import Settings from "@/views/Settings.vue";

type Page = "Dashboard" | "Settings";

export function useAppNavigation() {
  const page = ref<Page>("Dashboard");
  const jobsStore = useJobsStore();

  const navItems = [
    {
      label: "Dashboard",
      isActive: () => page.value === "Dashboard",
      command: () => {
        page.value = "Dashboard";
      },
    },
    {
      label: "Settings",
      isActive: () => page.value === "Settings",
      command: () => {
        page.value = "Settings";
      },
    },
  ];

  const component = computed(() => {
    switch (page.value) {
      case "Dashboard":
        return Dashboard;
      case "Settings":
        return Settings;
      default:
        return undefined;
    }
  });

  onMounted(() => {
    jobsStore.loadJobs();
  });

  return { page, navItems, component };
}
