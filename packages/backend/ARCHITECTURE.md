# Backend Architecture

## Overview

The crawler backend uses a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────┐
│             API Layer                │  ← Caido plugin API (jobs, config)
├──────────────────────────────────────┤
│          Services Layer             │  ← CrawlerService, AutoCrawl, HttpCrawler
├──────────────────────────────────────┤
│     Stores    │    Repositories      │  ← Persistence, HTTP history
├──────────────────────────────────────┤
│  validation  │  Models  │  parsers   │  ← Schemas, domain models, HTML/robots
└──────────────────────────────────────┘
```

## Directory Structure

```
packages/backend/src/
├── api/              # API handlers (jobs, config)
├── errors/           # Custom error classes
├── events/           # Event bus and event type definitions
├── models/           # Domain models (Request, Session, Pool, Router, etc.)
├── parsers/          # HTML and robots.txt parsing
├── repositories/     # HTTP client, HTTP history (seed URLs)
├── services/         # CrawlerService, HttpCrawler, AutoCrawlService
│   └── crawler/      # Crawler engine (constants, linkProcessor, robotsHandler, statsTracker)
├── stores/           # Persistence (jobs, config, crawlers, job logs)
├── utils/            # Logger, logger factory
├── validation/       # Zod schemas (config validation)
├── index.ts          # Plugin entry, API registration, init
├── sdk.ts            # SDK singleton (setSDK, requireSDK)
└── types.ts          # BackendSDK, BackendEvents, InterceptedRequest
```

## API Layer (`api/`)

| Module       | Endpoints                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| `config.ts`  | `getConfig`, `updateConfig`                                               |
| `jobs.ts`    | `startCrawl`, `stopCrawl`, `pauseCrawl`, `resumeCrawl`, `getJobs`, `getJob`, `updateJob`, `getJobLogs`, `getJobAgents`, `pauseAgent`, `resumeAgent`, `stopAgent`, `clearCompletedJobs`, `clearAllJobs`, `deleteJob` |

API handlers call into services and stores, then send events to the frontend via `sdk.api.send()` (e.g. `job:created`, `crawl:log`, `crawl:progress`).

## Services

### Crawler (`services/crawler/`)

| Module              | Responsibility                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| `CrawlerService.ts` | Job lifecycle: start/stop/pause/resume, per-agent control, job + log creation |
| `HttpCrawler.ts`    | Core engine: request queue, concurrency pool, rate limiting, events             |
| `linkProcessor.ts`  | URL normalization, host extraction, scope filtering                             |
| `robotsHandler.ts`  | robots.txt fetch and allow/disallow checks                                     |
| `statsTracker.ts`   | Request counts (finished, failed, total)                                      |
| `constants.ts`      | Defaults (concurrency, timeouts, retries, etc.)                                |
| `types.ts`          | CrawlerOptions, event payloads (EventData, CrawlerEventType)                   |

### Auto-crawl (`services/autoCrawl.ts`)

Listens to `onInterceptResponse`. When a new host is seen and auto-crawl is enabled, starts a crawl via `CrawlerService.start()` (non-manual). Sends `job:created` and `crawl:started` so the frontend shows the job and logs. Respects “crawl in scope only” and skips static resources.

## Stores (`stores/`)

| Store           | Purpose                         | Scope        | Interface     |
| --------------- | ------------------------------- | ------------ | ------------- |
| `configStore`   | Crawl configuration             | Global       | `IConfigStore`|
| `jobsStore`     | Crawl jobs (list, status, etc.) | Project      | `IJobsStore`  |
| `jobLogsStore`  | Per-job log lines (general + per-agent) | Project | —             |
| `crawlerStore`  | Active crawler instances (in-memory)    | —           | `ICrawlerStore`|

**Persistence base classes** (in `projectStore.ts`):

- `GlobalStore<T>` – single JSON file, not tied to project (used by `configStore`).
- `ProjectScopedStore<T>` – one JSON file per project; `switchProject()` loads the correct file when the user changes project (used by `jobsStore`, `jobLogsStore`).

Stores implement interfaces in `interfaces.ts` for testability and decoupling.

## Models (`models/`)

| Model             | Purpose                               |
| ----------------- | ------------------------------------- |
| `Request`         | Single crawl request (URL, depth, retries) |
| `RequestQueue`    | Priority queue for pending requests   |
| `Session`        | Cookies and headers                   |
| `SessionPool`    | Session lifecycle (optional)          |
| `pool.ts`        | Concurrency pool (slots, tasks)       |
| `Router`         | URL pattern matching for handlers     |
| `RateLimiter`    | Per-domain request throttling        |

## Repositories (`repositories/`)

| Module           | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `httpClient.ts` | Sends HTTP requests (used by HttpCrawler); Caido SDK  |
| `httpHistory.ts`| Fetches seed URLs from HTTP history for manual crawl |

## Events and Frontend Communication

- **Stores** persist state; **API handlers** and **CrawlerService** call `sdk.api.send()` to push updates to the frontend.
- Event names include: `job:created`, `job:updated`, `job:deleted`, `jobs:cleared`, `crawl:started`, `crawl:progress`, `crawl:completed`, `crawl:log`, `config:updated`, `project:changed`.
- `crawl:log` includes optional `agentId` so the UI can show general and per-agent log panels.

## Data Flow (manual crawl)

1. Frontend calls `startCrawl(targetUrl)`.
2. `CrawlerService.start(targetUrl, callbacks, true)` builds options, creates `HttpCrawler`, registers it in `crawlerStore`, creates job with `agentCount`, appends first log line, adds job to `jobsStore`, sends `job:created` and `crawl:started`.
3. `HttpCrawler.run()` drains the request queue via the concurrency pool; each slot can emit `agentStarted` once; requests are rate-limited and checked against robots.txt.
4. As requests complete/fail, `CrawlerService` updates the job, appends to `jobLogsStore`, and sends `crawl:log` and `crawl:progress`.
5. On completion or abort, per-agent “finished”/“stopped” lines are logged, then “All agents have finished” or “All agents have been stopped”, and job status is updated.

## Plugin Initialization (`init`)

1. `setSDK(sdk)`.
2. `configStore.initialize()`, `jobsStore.initialize()`, `jobLogsStore.initialize()`.
3. `AutoCrawlService.init(sdk)` (subscribe to intercept response).
4. Register all API handlers with `sdk.api.register()`.
5. Subscribe to `sdk.events.onProjectChange()` and call `jobsStore.switchProject()`, `jobLogsStore.switchProject()`, then send `project:changed`.

## Error Handling

Custom errors in `errors/index.ts`:

- `CrawlerError` (base)
- `SDKNotInitializedError`, `JobNotFoundError`, `CrawlerNotFoundError`, `CrawlerAlreadyRunningError`
- `InvalidUrlError`, `InvalidConfigError`, `RequestFailedError`, `MaxRetriesExceededError`, `RobotsDisallowedError`, `RequestTimeoutError`

Helpers: `isCrawlerError()`, `getErrorMessage()`.

## Validation

`validation/schemas.ts` uses Zod for config (e.g. `CrawlConfigSchema`). API and config store validate input before updating.

## Logging

Use the logger factory from `utils/`:

```typescript
import { createLogger } from "./utils";

const logger = createLogger("ComponentName");
logger.info("Message", { contextData: "value" });
```
