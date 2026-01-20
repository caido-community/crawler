/**
 * Event Types for the Crawler Backend
 *
 * Defines all event types and their payloads for the event-driven system.
 */

import type { CrawlConfig, CrawlJob } from "shared";

/**
 * Request-related events
 */
export interface RequestQueuedEvent {
  type: "request:queued";
  requestId: string;
  url: string;
  depth: number;
}

export interface RequestCompletedEvent {
  type: "request:completed";
  requestId: string;
  url: string;
  statusCode: number;
  durationMs: number;
}

export interface RequestFailedEvent {
  type: "request:failed";
  requestId: string;
  url: string;
  error: string;
  retryCount: number;
}

/**
 * Crawler lifecycle events
 */
export interface CrawlerStartedEvent {
  type: "crawler:started";
  jobId: string;
  targetUrl: string;
}

export interface CrawlerPausedEvent {
  type: "crawler:paused";
  jobId: string;
}

export interface CrawlerResumedEvent {
  type: "crawler:resumed";
  jobId: string;
}

export interface CrawlerCompletedEvent {
  type: "crawler:completed";
  jobId: string;
  totalUrls: number;
  durationMs: number;
}

export interface CrawlerAbortedEvent {
  type: "crawler:aborted";
  jobId: string;
}

/**
 * Job-related events
 */
export interface JobCreatedEvent {
  type: "job:created";
  job: CrawlJob;
}

export interface JobUpdatedEvent {
  type: "job:updated";
  job: CrawlJob;
}

export interface JobDeletedEvent {
  type: "job:deleted";
  jobId: string;
}

/**
 * Config-related events
 */
export interface ConfigUpdatedEvent {
  type: "config:updated";
  config: CrawlConfig;
}

/**
 * All event types union
 */
export type CrawlerEvent =
  | RequestQueuedEvent
  | RequestCompletedEvent
  | RequestFailedEvent
  | CrawlerStartedEvent
  | CrawlerPausedEvent
  | CrawlerResumedEvent
  | CrawlerCompletedEvent
  | CrawlerAbortedEvent
  | JobCreatedEvent
  | JobUpdatedEvent
  | JobDeletedEvent
  | ConfigUpdatedEvent;

/**
 * Event type strings for type-safe subscriptions
 */
export type EventType = CrawlerEvent["type"];

/**
 * Maps event type strings to their payloads
 */
export type EventPayload<T extends EventType> = Extract<
  CrawlerEvent,
  { type: T }
>;

/**
 * Event handler function type
 */
export type EventHandler<T extends EventType = EventType> = (
  event: EventPayload<T>,
) => void;
