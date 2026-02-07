import { computed, onMounted, ref, watch } from "vue";

import { useSDK } from "@/plugins/sdk";
import { useJobsStore } from "@/stores/jobs";
import type { CrawlLogEntry } from "@/types";

export function useDashboardCrawlEvents() {
  const jobsStore = useJobsStore();
  const sdk = useSDK();
  const logLines = ref<CrawlLogEntry[]>([]);
  const agentLogLines = ref<CrawlLogEntry[]>([]);
  const selectedAgentIndex = ref(1);

  const fetchLogs = async (jobId: string) => {
    const result = await sdk.backend.getJobLogs(jobId);
    if (result.kind === "Ok") {
      logLines.value = result.value;
    } else {
      logLines.value = [];
    }
  };

  const fetchAgentLogs = async (jobId: string, agentId: number) => {
    const result = await sdk.backend.getJobLogs(jobId, agentId);
    if (result.kind === "Ok") {
      agentLogLines.value = result.value;
    } else {
      agentLogLines.value = [];
    }
  };

  watch(
    () => jobsStore.selectedJobId,
    (id) => {
      if (id !== undefined) {
        fetchLogs(id);
        selectedAgentIndex.value = 1;
        fetchAgentLogs(id, 1);
      } else {
        logLines.value = [];
        agentLogLines.value = [];
      }
    },
    { immediate: true },
  );

  watch(selectedAgentIndex, (agentId) => {
    const jobId = jobsStore.selectedJobId;
    if (jobId !== undefined) {
      fetchAgentLogs(jobId, agentId);
    }
  });

  const selectedJob = computed(() => jobsStore.selectedJob);

  onMounted(() => {
    sdk.backend.onEvent(
      "crawl:log",
      (data: {
        jobId: string;
        line: string;
        agentId?: number;
        level?: string;
      }) => {
        if (data.jobId === jobsStore.selectedJobId) {
          const entry: CrawlLogEntry = {
            line: data.line,
            level: data.level ?? "info",
          };
          logLines.value = [...logLines.value, entry];

          if (data.agentId === selectedAgentIndex.value) {
            agentLogLines.value = [...agentLogLines.value, entry];
          }
        }
      },
    );
    sdk.backend.onEvent(
      "crawl:progress",
      (data: { jobId: string; crawled: number; discovered: number }) => {
        jobsStore.updateJobProgress(data.jobId, data.crawled, data.discovered);
      },
    );
    sdk.backend.onEvent("job:updated", () => {
      jobsStore.loadJobs();
    });
    sdk.backend.onEvent("job:created", async () => {
      await jobsStore.loadJobs();
      const list = jobsStore.jobs;
      if (list.length === 1) {
        jobsStore.setSelectedJob(list[0]?.id);
      }
    });
    sdk.backend.onEvent("job:deleted", (jobId: string) => {
      if (jobsStore.selectedJobId === jobId) {
        jobsStore.setSelectedJob(undefined);
      }
      jobsStore.loadJobs();
    });
    sdk.backend.onEvent("jobs:cleared", () => {
      jobsStore.loadJobs();
      jobsStore.setSelectedJob(undefined);
    });
  });

  return {
    logLines,
    agentLogLines,
    selectedAgentIndex,
    selectedJob,
  };
}
