import type { CrawlJob, CrawlJobAgentStatus } from "@/types";

type CrawlJobStatus = CrawlJob["status"];

export function getStatusColor(status: CrawlJobStatus): string {
  switch (status) {
    case "running":
      return "bg-secondary-500";
    case "paused":
      return "bg-yellow-500";
    case "completed":
      return "bg-success-500";
    case "failed":
      return "bg-red-500";
    case "cancelled":
      return "bg-orange-500";
    default:
      return "bg-surface-400";
  }
}

export function getAgentDotClass(status: CrawlJobStatus): string {
  if (status === "completed") return "bg-success-500";
  if (status === "failed") return "bg-red-500";
  if (status === "cancelled") return "bg-orange-500";
  if (status === "running") return "bg-secondary-500";
  if (status === "paused") return "bg-yellow-500";
  return "bg-surface-500";
}

export function getAgentDotClassFromAgentStatus(
  status: CrawlJobAgentStatus,
): string {
  if (status === "completed") return "bg-success-500";
  if (status === "running") return "bg-secondary-500";
  if (status === "paused") return "bg-yellow-500";
  if (status === "stopped") return "bg-red-500";
  return "bg-surface-500";
}

export function getProgressPercent(job: CrawlJob): number {
  if (job.discoveredUrls === 0) return 0;
  return Math.round((job.crawledUrls / job.discoveredUrls) * 100);
}
