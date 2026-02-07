import { z } from "zod";

export const CrawlConfigSchema = z.object({
  enabled: z.boolean(),
  crawlInScopeOnly: z.boolean(),
  crawlOnNewHost: z.boolean(),
  requestDelay: z.number().min(0),
  maxDepth: z.number().min(1),
  maxPagesPerDomain: z.number().min(1),
  manualCrawlAgents: z.number().min(1).max(20),
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  respectRobotsTxt: z.boolean(),
  userAgent: z.string(),
});

export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;

export const DEFAULT_CONFIG: CrawlConfig = {
  enabled: false,
  crawlInScopeOnly: false,
  crawlOnNewHost: false,
  requestDelay: 100,
  maxDepth: 5,
  maxPagesPerDomain: 100,
  manualCrawlAgents: 5,
  includePatterns: [],
  excludePatterns: [],
  respectRobotsTxt: false,
  userAgent: "Caido-Crawler",
};

export const CrawlJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "paused",
  "cancelled",
]);

export type CrawlJobStatus = z.infer<typeof CrawlJobStatusSchema>;

export const CrawlJobSchema = z.object({
  id: z.string(),
  targetUrl: z.string(),
  host: z.string(),
  status: CrawlJobStatusSchema,
  depth: z.number(),
  discoveredUrls: z.number(),
  crawledUrls: z.number(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  agentCount: z.number().optional(),
  title: z.string().optional(),
});

export type CrawlJob = z.infer<typeof CrawlJobSchema>;

export type CrawlJobAgentStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completed";

export type CrawlJobAgent = {
  agentId: number;
  status: CrawlJobAgentStatus;
};

export type CrawlLogEntry = { line: string; level: string };

export const CrawlQueueItemSchema = z.object({
  url: z.string(),
  depth: z.number(),
  parentUrl: z.string().optional(),
  host: z.string(),
});

export type CrawlQueueItem = z.infer<typeof CrawlQueueItemSchema>;

export type Result<T> =
  | { kind: "Ok"; value: T }
  | { kind: "Error"; error: string };

export type BackendEvents = {
  "crawl:started": (data: { jobId: string; host: string }) => void;
  "crawl:progress": (data: {
    jobId: string;
    crawled: number;
    discovered: number;
  }) => void;
  "crawl:completed": (data: { jobId: string; totalUrls: number }) => void;
  "crawl:failed": (data: { jobId: string; error: string }) => void;
  "crawl:log": (data: {
    jobId: string;
    line: string;
    agentId?: number;
    level?: string;
  }) => void;
  "config:updated": (config: CrawlConfig) => void;
  "project:changed": (projectId: string | undefined) => void;
  "job:updated": (job: CrawlJob) => void;
  "job:created": (job: CrawlJob) => void;
  "job:deleted": (jobId: string) => void;
  "jobs:cleared": () => void;
};
