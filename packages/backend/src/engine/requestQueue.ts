/**
 * RequestQueue - Priority queue with deduplication
 */

import { Request } from "./request";
import type { RequestOptions } from "./types";

export interface QueueStats {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  total: number;
}

export interface RequestQueueOptions {
  maxSize?: number;
  persistState?: boolean;
}

/**
 * Priority queue for managing crawl requests
 * Features:
 * - Priority-based ordering (higher priority first)
 * - URL deduplication via uniqueKey
 * - In-progress tracking
 * - Retry queue management
 */
export class RequestQueue {
  private pending: Request[] = [];
  private inProgress: Map<string, Request> = new Map();
  private completed: Set<string> = new Set(); // uniqueKeys
  private failed: Map<string, Request> = new Map();
  private uniqueKeys: Set<string> = new Set();
  private retryQueue: Request[] = [];

  private maxSize: number;
  private isPaused: boolean = false;

  constructor(options: RequestQueueOptions = {}) {
    this.maxSize = options.maxSize ?? Infinity;
  }

  /**
   * Adds a request to the queue
   * Returns true if added, false if duplicate or queue full
   */
  add(request: Request | RequestOptions | string): boolean {
    const req = request instanceof Request ? request : new Request(request);

    // Check for duplicates
    if (this.uniqueKeys.has(req.uniqueKey)) {
      return false;
    }

    // Check queue size
    if (this.uniqueKeys.size >= this.maxSize) {
      return false;
    }

    this.uniqueKeys.add(req.uniqueKey);
    this.insertByPriority(req);
    return true;
  }

  /**
   * Adds multiple requests to the queue
   * Returns the number of requests actually added
   */
  addRequests(
    requests: (Request | RequestOptions | string)[],
    defaultOptions?: Partial<RequestOptions>,
  ): number {
    let added = 0;

    for (const request of requests) {
      let req: Request;
      if (request instanceof Request) {
        req = request;
      } else if (typeof request === "string") {
        req = new Request({ url: request, ...defaultOptions });
      } else {
        req = new Request({ ...defaultOptions, ...request });
      }

      if (this.add(req)) {
        added++;
      }
    }

    return added;
  }

  /**
   * Inserts a request in priority order (higher priority first)
   */
  private insertByPriority(request: Request): void {
    // Binary search for insertion point
    let low = 0;
    let high = this.pending.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midRequest = this.pending[mid];
      if (midRequest !== undefined && midRequest.priority >= request.priority) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.pending.splice(low, 0, request);
  }

  /**
   * Gets the next request to process
   * Returns undefined if queue is empty or paused
   */
  fetchNextRequest(): Request | undefined {
    if (this.isPaused) {
      return undefined;
    }

    // First check retry queue
    const retryRequest = this.retryQueue.shift();
    if (retryRequest !== undefined) {
      retryRequest.resetForRetry();
      retryRequest.markProcessing();
      this.inProgress.set(retryRequest.id, retryRequest);
      return retryRequest;
    }

    // Then check pending queue
    const request = this.pending.shift();
    if (request !== undefined) {
      request.markProcessing();
      this.inProgress.set(request.id, request);
      return request;
    }

    return undefined;
  }

  /**
   * Marks a request as handled (completed successfully)
   */
  markRequestHandled(request: Request): void {
    request.markCompleted();
    this.inProgress.delete(request.id);
    this.completed.add(request.uniqueKey);
  }

  /**
   * Handles a failed request - either retries or marks as failed
   */
  handleRequestFailure(request: Request, error: string): void {
    request.markFailed(error);
    this.inProgress.delete(request.id);

    if (request.state === "retrying") {
      // Add to retry queue
      this.retryQueue.push(request);
    } else {
      // Mark as permanently failed
      this.failed.set(request.id, request);
    }
  }

  /**
   * Reclaims a request back to the queue (e.g., on crawler pause)
   */
  reclaimRequest(request: Request): void {
    if (this.inProgress.has(request.id)) {
      this.inProgress.delete(request.id);
      request.state = "pending";
      this.insertByPriority(request);
    }
  }

  /**
   * Reclaims all in-progress requests back to the queue
   */
  reclaimAllInProgress(): void {
    for (const request of this.inProgress.values()) {
      request.state = "pending";
      this.insertByPriority(request);
    }
    this.inProgress.clear();
  }

  /**
   * Checks if a URL has already been queued or processed
   */
  isHandled(uniqueKey: string): boolean {
    return this.uniqueKeys.has(uniqueKey);
  }

  /**
   * Checks if a URL has been completed
   */
  isCompleted(uniqueKey: string): boolean {
    return this.completed.has(uniqueKey);
  }

  /**
   * Gets the request currently in progress by ID
   */
  getInProgressRequest(requestId: string): Request | undefined {
    return this.inProgress.get(requestId);
  }

  /**
   * Checks if the queue is empty (no pending or in-progress)
   */
  isEmpty(): boolean {
    return (
      this.pending.length === 0 &&
      this.retryQueue.length === 0 &&
      this.inProgress.size === 0
    );
  }

  /**
   * Checks if there are requests ready to be fetched
   */
  hasNextRequest(): boolean {
    if (this.isPaused) {
      return false;
    }
    return this.pending.length > 0 || this.retryQueue.length > 0;
  }

  /**
   * Gets the number of pending requests
   */
  pendingCount(): number {
    return this.pending.length + this.retryQueue.length;
  }

  /**
   * Gets the number of in-progress requests
   */
  inProgressCount(): number {
    return this.inProgress.size;
  }

  /**
   * Pauses the queue
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resumes the queue
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Checks if the queue is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Clears the entire queue
   */
  clear(): void {
    this.pending = [];
    this.retryQueue = [];
    this.inProgress.clear();
    this.completed.clear();
    this.failed.clear();
    this.uniqueKeys.clear();
    this.isPaused = false;
  }

  /**
   * Gets queue statistics
   */
  getStats(): QueueStats {
    return {
      pending: this.pending.length + this.retryQueue.length,
      inProgress: this.inProgress.size,
      completed: this.completed.size,
      failed: this.failed.size,
      total: this.uniqueKeys.size,
    };
  }

  /**
   * Gets all failed requests
   */
  getFailedRequests(): Request[] {
    return Array.from(this.failed.values());
  }

  /**
   * Gets all pending requests (for inspection)
   */
  getPendingRequests(): Request[] {
    return [...this.pending, ...this.retryQueue];
  }

  /**
   * Gets all in-progress requests
   */
  getInProgressRequests(): Request[] {
    return Array.from(this.inProgress.values());
  }

  /**
   * Drops a request from the queue by ID
   */
  drop(requestId: string): boolean {
    // Check pending
    const pendingIndex = this.pending.findIndex((r) => r.id === requestId);
    if (pendingIndex >= 0) {
      const request = this.pending[pendingIndex];
      if (request !== undefined) {
        this.pending.splice(pendingIndex, 1);
        this.uniqueKeys.delete(request.uniqueKey);
        return true;
      }
    }

    // Check retry queue
    const retryIndex = this.retryQueue.findIndex((r) => r.id === requestId);
    if (retryIndex >= 0) {
      const request = this.retryQueue[retryIndex];
      if (request !== undefined) {
        this.retryQueue.splice(retryIndex, 1);
        this.uniqueKeys.delete(request.uniqueKey);
        return true;
      }
    }

    // Check in-progress
    const inProgressRequest = this.inProgress.get(requestId);
    if (inProgressRequest !== undefined) {
      this.inProgress.delete(requestId);
      this.uniqueKeys.delete(inProgressRequest.uniqueKey);
      return true;
    }

    return false;
  }

  /**
   * Updates the max size limit
   */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
  }

  /**
   * Gets the current max size
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Exports the queue state for persistence
   */
  toJSON(): {
    pending: ReturnType<Request["toJSON"]>[];
    retryQueue: ReturnType<Request["toJSON"]>[];
    completed: string[];
  } {
    return {
      pending: this.pending.map((r) => r.toJSON()),
      retryQueue: this.retryQueue.map((r) => r.toJSON()),
      completed: Array.from(this.completed),
    };
  }

  /**
   * Restores queue state from persistence
   */
  static fromJSON(
    data: {
      pending: ReturnType<Request["toJSON"]>[];
      retryQueue: ReturnType<Request["toJSON"]>[];
      completed: string[];
    },
    options?: RequestQueueOptions,
  ): RequestQueue {
    const queue = new RequestQueue(options);

    for (const reqData of data.pending) {
      const request = Request.fromJSON(reqData);
      queue.uniqueKeys.add(request.uniqueKey);
      queue.pending.push(request);
    }

    for (const reqData of data.retryQueue) {
      const request = Request.fromJSON(reqData);
      queue.uniqueKeys.add(request.uniqueKey);
      queue.retryQueue.push(request);
    }

    for (const key of data.completed) {
      queue.completed.add(key);
      queue.uniqueKeys.add(key);
    }

    return queue;
  }
}
