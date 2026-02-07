import type { DefineAPI } from "caido:plugin";

import {
  clearAllJobs,
  clearCompletedJobs,
  deleteJob,
  getConfig,
  getJob,
  getJobAgents,
  getJobLogs,
  getJobs,
  pauseAgent,
  pauseCrawl,
  resumeAgent,
  resumeCrawl,
  startCrawl,
  stopAgent,
  stopCrawl,
  updateConfig,
  updateJob,
} from "./api";
import { setSDK } from "./sdk";
import { AutoCrawlService } from "./services";
import { configStore } from "./stores/configStore";
import { jobLogsStore } from "./stores/jobLogsStore";
import { jobsStore } from "./stores/jobsStore";
import type { BackendEvents, BackendSDK } from "./types";

export type API = DefineAPI<{
  getConfig: typeof getConfig;
  updateConfig: typeof updateConfig;
  startCrawl: typeof startCrawl;
  stopCrawl: typeof stopCrawl;
  pauseCrawl: typeof pauseCrawl;
  resumeCrawl: typeof resumeCrawl;
  getJobs: typeof getJobs;
  getJob: typeof getJob;
  updateJob: typeof updateJob;
  getJobLogs: typeof getJobLogs;
  getJobAgents: typeof getJobAgents;
  pauseAgent: typeof pauseAgent;
  resumeAgent: typeof resumeAgent;
  stopAgent: typeof stopAgent;
  clearCompletedJobs: typeof clearCompletedJobs;
  clearAllJobs: typeof clearAllJobs;
  deleteJob: typeof deleteJob;
}>;

export type { BackendEvents };
export type {
  CrawlConfig,
  CrawlJob,
  CrawlJobAgent,
  CrawlJobAgentStatus,
  CrawlJobStatus,
  Result,
} from "shared";
export * from "./errors";
export * from "./models";
export {
  AutoCrawlService,
  CrawlerService,
  CRAWLER_DEFAULTS,
  HttpCrawler,
  StatsTracker,
} from "./services";
export * from "./stores";
export * from "./utils";
export * from "./validation/schemas";

// Export events explicitly to avoid CrawlerEvent conflict with models
export { EventBus } from "./events";
export type {
  ConfigUpdatedEvent,
  CrawlerAbortedEvent,
  CrawlerCompletedEvent,
  CrawlerPausedEvent,
  CrawlerResumedEvent,
  CrawlerStartedEvent,
  EventHandler,
  EventPayload,
  EventType,
  JobCreatedEvent,
  JobDeletedEvent,
  JobUpdatedEvent,
  RequestCompletedEvent,
  RequestFailedEvent,
  RequestQueuedEvent,
} from "./events";
export type { CrawlerEvent as DomainCrawlerEvent } from "./events";

// Export utility types
export type { HtmlExtractorOptions } from "./parsers/htmlExtractor";
export type { RobotsParserOptions } from "./parsers/robotsTxtParser";
export type { HttpClientOptions, SendOptions } from "./repositories/httpClient";

export function init(sdk: BackendSDK) {
  setSDK(sdk);

  configStore.initialize();
  jobsStore.initialize();
  jobLogsStore.initialize();

  AutoCrawlService.init(sdk);

  sdk.api.register("getConfig", getConfig);
  sdk.api.register("updateConfig", updateConfig);
  sdk.api.register("startCrawl", startCrawl);
  sdk.api.register("stopCrawl", stopCrawl);
  sdk.api.register("pauseCrawl", pauseCrawl);
  sdk.api.register("resumeCrawl", resumeCrawl);
  sdk.api.register("getJobs", getJobs);
  sdk.api.register("getJob", getJob);
  sdk.api.register("updateJob", updateJob);
  sdk.api.register("getJobLogs", getJobLogs);
  sdk.api.register("getJobAgents", getJobAgents);
  sdk.api.register("pauseAgent", pauseAgent);
  sdk.api.register("resumeAgent", resumeAgent);
  sdk.api.register("stopAgent", stopAgent);
  sdk.api.register("clearCompletedJobs", clearCompletedJobs);
  sdk.api.register("clearAllJobs", clearAllJobs);
  sdk.api.register("deleteJob", deleteJob);

  sdk.events.onProjectChange(async (_sdk, project) => {
    const projectID = project?.getId();
    await jobsStore.switchProject(projectID);
    await jobLogsStore.switchProject(projectID);
    sdk.api.send("project:changed", projectID);
  });
}
