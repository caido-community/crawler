/**
 * Concurrency Pool - Manages parallel request execution
 */

// ============================================================================
// Types
// ============================================================================

export interface ConcurrencyPoolOptions {
  maxConcurrency?: number;
  minConcurrency?: number;
  desiredConcurrency?: number;
  taskTimeoutMs?: number;
  autoscale?: boolean;
  autoscaleIntervalMs?: number;
}

export interface PoolStats {
  currentConcurrency: number;
  desiredConcurrency: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskDurationMs: number;
}

type TaskFunction<T> = () => Promise<T>;

interface QueuedTask<T> {
  task: TaskFunction<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

// ============================================================================
// Concurrency Pool Class
// ============================================================================

export class ConcurrencyPool {
  private options: Required<ConcurrencyPoolOptions>;
  private taskQueue: QueuedTask<unknown>[] = [];
  private runningTasks: Set<Promise<void>> = new Set();
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  // Stats
  private completedTasks: number = 0;
  private failedTasks: number = 0;
  private totalTaskDuration: number = 0;
  private currentConcurrency: number;

  // Autoscaling
  private autoscaleTimer: ReturnType<typeof setInterval> | undefined;
  private recentDurations: number[] = [];
  private recentSuccessRate: number = 1;

  constructor(options: ConcurrencyPoolOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 10,
      minConcurrency: options.minConcurrency ?? 1,
      desiredConcurrency: options.desiredConcurrency ?? 5,
      taskTimeoutMs: options.taskTimeoutMs ?? 60000,
      autoscale: options.autoscale ?? false,
      autoscaleIntervalMs: options.autoscaleIntervalMs ?? 10000,
    };

    this.currentConcurrency = this.options.desiredConcurrency;
  }

  /**
   * Starts the pool
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.isPaused = false;

    // Start autoscaling if enabled
    if (this.options.autoscale) {
      this.startAutoscaling();
    }

    // Process any queued tasks
    this.processQueue();
  }

  /**
   * Stops the pool
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.stopAutoscaling();

    // Wait for running tasks to complete
    if (this.runningTasks.size > 0) {
      await Promise.all(this.runningTasks);
    }
  }

  /**
   * Pauses the pool (running tasks continue, no new ones start)
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resumes the pool
   */
  resume(): void {
    this.isPaused = false;
    if (this.isRunning) {
      this.processQueue();
    }
  }

  /**
   * Adds a task to the pool
   * Returns a promise that resolves when the task completes
   */
  addTask<T>(task: TaskFunction<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.taskQueue.push({
        task: task as TaskFunction<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        createdAt: Date.now(),
      });

      if (this.isRunning && !this.isPaused) {
        this.processQueue();
      }
    });
  }

  /**
   * Adds multiple tasks and waits for all to complete
   */
  async addTasks<T>(tasks: TaskFunction<T>[]): Promise<T[]> {
    const promises = tasks.map((task) => this.addTask(task));
    return Promise.all(promises);
  }

  /**
   * Processes tasks from the queue
   */
  private processQueue(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    while (
      this.runningTasks.size < this.currentConcurrency &&
      this.taskQueue.length > 0
    ) {
      const queuedTask = this.taskQueue.shift();
      if (queuedTask !== undefined) {
        this.runTask(queuedTask);
      }
    }
  }

  /**
   * Runs a single task
   */
  private runTask<T>(queuedTask: QueuedTask<T>): void {
    const startTime = Date.now();
    const promiseRef: { current: Promise<void> | undefined } = {
      current: undefined,
    };

    const runAsync = async (): Promise<void> => {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`Task timed out after ${this.options.taskTimeoutMs}ms`),
            );
          }, this.options.taskTimeoutMs);
        });

        // Race between task and timeout
        const result = await Promise.race([queuedTask.task(), timeoutPromise]);

        const duration = Date.now() - startTime;
        this.recordSuccess(duration);
        queuedTask.resolve(result as T);
      } catch (error) {
        const duration = Date.now() - startTime;
        this.recordFailure(duration);
        queuedTask.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        if (promiseRef.current !== undefined) {
          this.runningTasks.delete(promiseRef.current);
        }
        this.processQueue();
      }
    };

    const taskPromise = runAsync();
    promiseRef.current = taskPromise;
    this.runningTasks.add(taskPromise);
  }

  /**
   * Records a successful task
   */
  private recordSuccess(duration: number): void {
    this.completedTasks++;
    this.totalTaskDuration += duration;
    this.recentDurations.push(duration);

    // Keep only last 100 durations
    if (this.recentDurations.length > 100) {
      this.recentDurations.shift();
    }

    // Update success rate
    this.recentSuccessRate =
      this.completedTasks / (this.completedTasks + this.failedTasks);
  }

  /**
   * Records a failed task
   */
  private recordFailure(duration: number): void {
    this.failedTasks++;
    this.totalTaskDuration += duration;
    this.recentDurations.push(duration);

    // Keep only last 100 durations
    if (this.recentDurations.length > 100) {
      this.recentDurations.shift();
    }

    // Update success rate
    this.recentSuccessRate =
      this.completedTasks / (this.completedTasks + this.failedTasks);
  }

  /**
   * Starts autoscaling
   */
  private startAutoscaling(): void {
    this.autoscaleTimer = setInterval(() => {
      this.autoscale();
    }, this.options.autoscaleIntervalMs);
  }

  /**
   * Stops autoscaling
   */
  private stopAutoscaling(): void {
    if (this.autoscaleTimer !== undefined) {
      clearInterval(this.autoscaleTimer);
      this.autoscaleTimer = undefined;
    }
  }

  /**
   * Autoscales the pool based on performance
   */
  private autoscale(): void {
    const { minConcurrency, maxConcurrency } = this.options;

    // Calculate average task duration
    const avgDuration =
      this.recentDurations.length > 0
        ? this.recentDurations.reduce((a, b) => a + b, 0) /
          this.recentDurations.length
        : 0;

    // Calculate load factor (how full is the queue)
    const queueLoad = this.taskQueue.length / this.currentConcurrency;

    // Scaling logic
    let newConcurrency = this.currentConcurrency;

    // Scale up if:
    // - Queue is building up
    // - Success rate is good
    // - Tasks are completing reasonably fast
    if (queueLoad > 2 && this.recentSuccessRate > 0.9 && avgDuration < 5000) {
      newConcurrency = Math.min(
        maxConcurrency,
        Math.ceil(this.currentConcurrency * 1.2),
      );
    }
    // Scale down if:
    // - Too many failures
    // - Tasks are slow
    else if (this.recentSuccessRate < 0.5 || avgDuration > 30000) {
      newConcurrency = Math.max(
        minConcurrency,
        Math.floor(this.currentConcurrency * 0.8),
      );
    }

    this.currentConcurrency = newConcurrency;
  }

  /**
   * Sets the desired concurrency
   */
  setConcurrency(concurrency: number): void {
    this.currentConcurrency = Math.max(
      this.options.minConcurrency,
      Math.min(this.options.maxConcurrency, concurrency),
    );
    this.processQueue();
  }

  /**
   * Gets the current concurrency
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Gets pool statistics
   */
  getStats(): PoolStats {
    const totalTasks = this.completedTasks + this.failedTasks;
    return {
      currentConcurrency: this.currentConcurrency,
      desiredConcurrency: this.options.desiredConcurrency,
      pendingTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      avgTaskDurationMs:
        totalTasks > 0 ? this.totalTaskDuration / totalTasks : 0,
    };
  }

  /**
   * Checks if the pool is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Checks if the pool is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Checks if there are pending or running tasks
   */
  hasTasks(): boolean {
    return this.taskQueue.length > 0 || this.runningTasks.size > 0;
  }

  /**
   * Clears all pending tasks
   */
  clearPending(): void {
    // Reject all pending tasks
    for (const task of this.taskQueue) {
      task.reject(new Error("Task cancelled"));
    }
    this.taskQueue = [];
  }

  /**
   * Aborts all tasks
   */
  abort(): void {
    this.isRunning = false;
    this.stopAutoscaling();
    this.clearPending();
  }
}
