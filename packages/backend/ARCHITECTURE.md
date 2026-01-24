# Backend Architecture

## Overview

The crawler backend follows a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────┐
│             API Layer                │  ← External interface
├──────────────────────────────────────┤
│          Services Layer              │  ← Business logic
├──────────────────────────────────────┤
│     Stores    │    Repositories      │  ← Data access
├──────────────────────────────────────┤
│           Models Layer               │  ← Domain objects
└──────────────────────────────────────┘
```

## Directory Structure

```
packages/backend/src/
├── api/           # API handlers (jobs, config endpoints)
├── errors/        # Custom error classes
├── events/        # Event bus and type definitions
├── models/        # Domain models (Request, Session, Pool, etc.)
├── parsers/       # HTML/robots.txt parsing
├── repositories/  # External data access (HTTP client)
├── services/      # Business logic (CrawlerService, HttpCrawler)
├── stores/        # State management (jobs, config, crawlers)
├── utils/         # Utilities (logger, validation)
└── validation/    # Zod schemas for request validation
```

## Key Components

### Services (`services/crawler/`)

| Module              | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `HttpCrawler.ts`    | Core crawling engine - request processing, rate limiting |
| `CrawlerService.ts` | Job management - start, stop, pause, resume              |
| `linkProcessor.ts`  | Link extraction and filtering                            |
| `robotsHandler.ts`  | robots.txt compliance                                    |
| `statsTracker.ts`   | Crawl statistics tracking                                |
| `autoCrawl.ts`      | Automatic crawling service (passive -> active)           |

### Models (`models/`)

| Model             | Purpose                             |
| ----------------- | ----------------------------------- |
| `Request`         | Represents a crawl request          |
| `RequestQueue`    | Priority queue for pending requests |
| `Session`         | Cookie/header management            |
| `SessionPool`     | Session lifecycle management        |
| `ConcurrencyPool` | Task concurrency control            |
| `Router`          | URL pattern matching for handlers   |
| `RateLimiter`     | Per-domain request throttling       |

### Stores (`stores/`)

| Store          | Purpose                  | Interface       |
| -------------- | ------------------------ | --------------- |
| `jobsStore`    | Persists crawl jobs      | `IJobsStore`    |
| `configStore`  | Crawl configuration      | `IConfigStore`  |
| `crawlerStore` | Active crawler instances | `ICrawlerStore` |

### Events (`events/`)

| Component  | Purpose                             |
| ---------- | ----------------------------------- |
| `EventBus` | Centralized typed event emitter     |
| `types.ts` | Event definitions (payloads, types) |

## Data Flow

```
1. API Request
   ↓
2. CrawlerService.start(url)
   ↓
3. HttpCrawler created
   ↓
4. RequestQueue populated
   ↓
5. ConcurrencyPool processes requests
   ↓
6. HttpClient fetches URLs
   ↓
7. HtmlExtractor extracts links
   ↓
8. New links added to queue
   ↓
9. Stats updated, events emitted
```

## Dependency Injection

Stores implement interfaces for testability:

```typescript
// Import interface
import type { IJobsStore } from "./stores/interfaces";

// Use in services
class MyService {
  constructor(private jobsStore: IJobsStore) {}
}
```

## Error Handling

Custom errors in `errors/index.ts`:

- `JobNotFoundError` - Job lookup failures
- `CrawlerAlreadyRunningError` - Duplicate crawl attempts
- `InvalidUrlError` - URL validation failures
- `InvalidConfigError` - Configuration validation errors

## Logging

Use the logger factory:

```typescript
import { createLogger } from "./utils";

const logger = createLogger("ComponentName");
logger.info("Message", { contextData: "value" });
```
