import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";
import type { CrawlJob, CrawlJobAgent } from "@/types";

export const useJobsStore = defineStore("jobs", () => {
  const sdk = useSDK();
  const jobs = ref<CrawlJob[]>([]);
  const loading = ref(false);
  const selectedJobId = ref<string | undefined>();

  const activeJobs = computed(() =>
    jobs.value.filter((j) => j.status === "running" || j.status === "paused"),
  );

  const completedJobs = computed(() =>
    jobs.value.filter((j) => j.status === "completed" || j.status === "failed"),
  );

  const loadJobs = async () => {
    loading.value = true;
    try {
      const result = await sdk.backend.getJobs();
      if (result.kind === "Ok") {
        jobs.value = result.value;
      }
    } catch (error) {
      sdk.window.showToast("Failed to load jobs", { variant: "error" });
    } finally {
      loading.value = false;
    }
  };

  const startCrawl = async (targetUrl: string) => {
    try {
      const hadNoJobs = jobs.value.length === 0;
      const result = await sdk.backend.startCrawl(targetUrl);
      if (result.kind === "Ok") {
        jobs.value.unshift(result.value);
        if (hadNoJobs) {
          selectedJobId.value = result.value.id;
        }
        sdk.window.showToast(`Started crawling ${result.value.host}`, {
          variant: "success",
        });
        return result.value;
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
        return undefined;
      }
    } catch (error) {
      sdk.window.showToast("Failed to start crawl", { variant: "error" });
      return undefined;
    }
  };

  const stopCrawl = async (jobId: string) => {
    try {
      const result = await sdk.backend.stopCrawl(jobId);
      if (result.kind === "Ok") {
        const job = jobs.value.find((j) => j.id === jobId);
        if (job !== undefined) {
          job.status = "cancelled";
          job.completedAt = new Date();
        }
        sdk.window.showToast("Crawl stopped", { variant: "success" });
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to stop crawl", { variant: "error" });
    }
  };

  const pauseCrawl = async (jobId: string) => {
    try {
      const result = await sdk.backend.pauseCrawl(jobId);
      if (result.kind === "Ok") {
        const job = jobs.value.find((j) => j.id === jobId);
        if (job !== undefined) {
          job.status = "paused";
        }
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to pause crawl", { variant: "error" });
    }
  };

  const resumeCrawl = async (jobId: string) => {
    try {
      const result = await sdk.backend.resumeCrawl(jobId);
      if (result.kind === "Ok") {
        const job = jobs.value.find((j) => j.id === jobId);
        if (job !== undefined) {
          job.status = "running";
        }
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to resume crawl", { variant: "error" });
    }
  };

  const getJobAgents = async (jobId: string): Promise<CrawlJobAgent[]> => {
    const result = await sdk.backend.getJobAgents(jobId);
    if (result.kind === "Ok") return result.value;
    return [];
  };

  const pauseAgent = async (jobId: string, agentId: number) => {
    const result = await sdk.backend.pauseAgent(jobId, agentId);
    if (result.kind === "Error") {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  };

  const resumeAgent = async (jobId: string, agentId: number) => {
    const result = await sdk.backend.resumeAgent(jobId, agentId);
    if (result.kind === "Error") {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  };

  const stopAgent = async (jobId: string, agentId: number) => {
    const result = await sdk.backend.stopAgent(jobId, agentId);
    if (result.kind === "Error") {
      sdk.window.showToast(result.error, { variant: "error" });
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const result = await sdk.backend.deleteJob(jobId);
      if (result.kind === "Ok") {
        jobs.value = jobs.value.filter((j) => j.id !== jobId);
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to delete job", { variant: "error" });
    }
  };

  const clearCompletedJobs = async () => {
    try {
      const result = await sdk.backend.clearCompletedJobs();
      if (result.kind === "Ok") {
        jobs.value = jobs.value.filter(
          (j) => j.status === "running" || j.status === "paused",
        );
        sdk.window.showToast("Completed jobs cleared", { variant: "success" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to clear jobs", { variant: "error" });
    }
  };

  const clearAllJobs = async () => {
    try {
      const result = await sdk.backend.clearAllJobs();
      if (result.kind === "Ok") {
        jobs.value = [];
        selectedJobId.value = undefined;
        sdk.window.showToast("All crawl jobs deleted", { variant: "success" });
      } else {
        sdk.window.showToast(result.error, { variant: "error" });
      }
    } catch (error) {
      sdk.window.showToast("Failed to delete all jobs", { variant: "error" });
    }
  };

  const updateJobProgress = (
    jobId: string,
    crawled: number,
    discovered: number,
  ) => {
    const job = jobs.value.find((j) => j.id === jobId);
    if (job !== undefined) {
      job.crawledUrls = crawled;
      job.discoveredUrls = discovered;
    }
  };

  const markJobCompleted = (jobId: string) => {
    const job = jobs.value.find((j) => j.id === jobId);
    if (job !== undefined) {
      job.status = "completed";
      job.completedAt = new Date();
    }
  };

  const setSelectedJob = (jobId: string | undefined) => {
    selectedJobId.value = jobId;
  };

  const updateJobTitle = async (jobId: string, title: string) => {
    const result = await sdk.backend.updateJob(jobId, { title });
    if (result.kind === "Ok") {
      const job = jobs.value.find((j) => j.id === jobId);
      if (job !== undefined) {
        job.title = title;
      }
    }
  };

  const selectedJob = computed(() => {
    const id = selectedJobId.value;
    return id !== undefined ? jobs.value.find((j) => j.id === id) : undefined;
  });

  return {
    jobs,
    loading,
    selectedJobId,
    selectedJob,
    activeJobs,
    completedJobs,
    loadJobs,
    startCrawl,
    stopCrawl,
    pauseCrawl,
    resumeCrawl,
    deleteJob,
    clearCompletedJobs,
    clearAllJobs,
    updateJobProgress,
    markJobCompleted,
    setSelectedJob,
    updateJobTitle,
    getJobAgents,
    pauseAgent,
    resumeAgent,
    stopAgent,
  };
});
