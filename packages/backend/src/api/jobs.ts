import type { SDK } from "caido:plugin";
import type { CrawlJob, CrawlJobAgent, CrawlLogEntry, Result } from "shared";

import { requireSDK } from "../sdk";
import { CrawlerService } from "../services";
import { jobLogsStore } from "../stores/jobLogsStore";

export async function startCrawl(
  _sdk: SDK,
  targetUrl: string,
): Promise<Result<CrawlJob>> {
  const sdk = requireSDK();

  const result = await CrawlerService.start(
    targetUrl,
    {
      onProgress: (stats, jobId) => {
        sdk.api.send("crawl:progress", {
          jobId,
          crawled: stats.crawledUrls,
          discovered: stats.discoveredUrls,
        });
      },
      onComplete: (stats, jobId) => {
        sdk.api.send("crawl:completed", {
          jobId,
          totalUrls: stats.crawledUrls,
        });
      },
      onError: (url, error) => {
        sdk.console.log(`[Crawler] Error crawling ${url}: ${error}`);
      },
    },
    true,
  );

  if (result.kind === "Error") {
    return result;
  }

  const { job, jobId } = result.value;

  sdk.api.send("job:created", job);
  sdk.api.send("crawl:started", { jobId, host: job.host });

  return { kind: "Ok", value: job };
}

export function stopCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const sdk = requireSDK();

  const result = CrawlerService.stop(jobId);

  if (result.kind === "Ok") {
    const jobResult = CrawlerService.getJob(jobId);
    if (jobResult.kind === "Ok") {
      sdk.api.send("job:updated", jobResult.value);
    }
  }

  return { kind: "Ok", value: undefined };
}

export function pauseCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const result = CrawlerService.pause(jobId);

  if (result.kind === "Ok") {
    const sdk = requireSDK();
    const jobResult = CrawlerService.getJob(jobId);
    if (jobResult.kind === "Ok") {
      sdk.api.send("job:updated", jobResult.value);
    }
  }

  return result;
}

export function resumeCrawl(_sdk: SDK, jobId: string): Result<undefined> {
  const result = CrawlerService.resume(jobId);

  if (result.kind === "Ok") {
    const sdk = requireSDK();
    const jobResult = CrawlerService.getJob(jobId);
    if (jobResult.kind === "Ok") {
      sdk.api.send("job:updated", jobResult.value);
    }
  }

  return result;
}

export function getJobs(_sdk: SDK): Result<CrawlJob[]> {
  return CrawlerService.getJobs();
}

export function getJob(_sdk: SDK, jobId: string): Result<CrawlJob> {
  return CrawlerService.getJob(jobId);
}

export function updateJob(
  _sdk: SDK,
  jobId: string,
  updates: { title?: string },
): Result<CrawlJob> {
  const sdk = requireSDK();
  const result = CrawlerService.updateJob(jobId, updates);
  if (result.kind === "Ok") {
    sdk.api.send("job:updated", result.value);
  }
  return result;
}

export function getJobLogs(
  _sdk: SDK,
  jobId: string,
  agentId?: number,
): Result<CrawlLogEntry[]> {
  const logs = jobLogsStore.getLogs(jobId, agentId);
  return { kind: "Ok", value: logs };
}

export function getJobAgents(
  _sdk: SDK,
  jobId: string,
): Result<CrawlJobAgent[]> {
  return CrawlerService.getJobAgents(jobId);
}

export function pauseAgent(
  _sdk: SDK,
  jobId: string,
  agentId: number,
): Result<undefined> {
  return CrawlerService.pauseAgent(jobId, agentId);
}

export function resumeAgent(
  _sdk: SDK,
  jobId: string,
  agentId: number,
): Result<undefined> {
  return CrawlerService.resumeAgent(jobId, agentId);
}

export function stopAgent(
  _sdk: SDK,
  jobId: string,
  agentId: number,
): Result<undefined> {
  return CrawlerService.stopAgent(jobId, agentId);
}

export function clearCompletedJobs(_sdk: SDK): Result<undefined> {
  const sdk = requireSDK();

  const jobsResult = CrawlerService.getJobs();
  const completedIds =
    jobsResult.kind === "Ok"
      ? jobsResult.value
          .filter(
            (j) =>
              j.status === "completed" ||
              j.status === "failed" ||
              j.status === "cancelled",
          )
          .map((j) => j.id)
      : [];

  const result = CrawlerService.clearCompleted();

  if (result.kind === "Ok") {
    for (const id of completedIds) {
      jobLogsStore.clear(id);
    }
    sdk.api.send("jobs:cleared");
  }

  return result;
}

export function clearAllJobs(_sdk: SDK): Result<undefined> {
  const sdk = requireSDK();

  const result = CrawlerService.clearAll();

  if (result.kind === "Ok") {
    jobLogsStore.clearAll();
    sdk.api.send("jobs:cleared");
  }

  return result;
}

export function deleteJob(_sdk: SDK, jobId: string): Result<undefined> {
  const sdk = requireSDK();

  const result = CrawlerService.delete(jobId);

  if (result.kind === "Ok") {
    jobLogsStore.clear(jobId);
    sdk.api.send("job:deleted", jobId);
  }

  return result;
}
