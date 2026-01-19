export type ConcurrencyPoolOptions = {
  maxConcurrency?: number;
  minConcurrency?: number;
  desiredConcurrency?: number;
  taskTimeoutMs?: number;
  autoscale?: boolean;
  autoscaleIntervalMs?: number;
};

export type PoolStats = {
  currentConcurrency: number;
  desiredConcurrency: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTaskDurationMs: number;
};

type TaskFunction<T> = () => Promise<T>;

type QueuedTask<T> = {
  task: TaskFunction<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

export class ConcurrencyPool {
  private options: Required<ConcurrencyPoolOptions>;
  private taskQueue: QueuedTask<unknown>[] = [];
  private runningTasks: Set<Promise<void>> = new Set();
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private completedTasks: number = 0;
  private failedTasks: number = 0;
  private currentConcurrency: number;
  private autoscaleTimer: ReturnType<typeof setInterval> | undefined;
  private taskDurations: number[] = [];

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

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.isPaused = false;

    if (this.options.autoscale) {
      this.startAutoscaling();
    }

    this.processQueue();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stopAutoscaling();

    if (this.runningTasks.size > 0) {
      await Promise.all(this.runningTasks);
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    if (this.isRunning) {
      this.processQueue();
    }
  }

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

  async addTasks<T>(tasks: TaskFunction<T>[]): Promise<T[]> {
    const promises = tasks.map((task) => this.addTask(task));
    return Promise.all(promises);
  }

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

  private runTask<T>(queuedTask: QueuedTask<T>): void {
    const startTime = Date.now();
    const promiseRef: { current: Promise<void> | undefined } = {
      current: undefined,
    };

    const runAsync = async (): Promise<void> => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`Task timed out after ${this.options.taskTimeoutMs}ms`),
            );
          }, this.options.taskTimeoutMs);
        });

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

  private recordSuccess(duration: number): void {
    this.completedTasks++;
    this.taskDurations.push(duration);
  }

  private recordFailure(duration: number): void {
    this.failedTasks++;
    this.taskDurations.push(duration);
  }

  private startAutoscaling(): void {
    this.autoscaleTimer = setInterval(() => {
      this.autoscale();
    }, this.options.autoscaleIntervalMs);
  }

  private stopAutoscaling(): void {
    if (this.autoscaleTimer !== undefined) {
      clearInterval(this.autoscaleTimer);
      this.autoscaleTimer = undefined;
    }
  }

  private autoscale(): void {
    const { minConcurrency, maxConcurrency } = this.options;

    const avgDuration =
      this.taskDurations.length > 0
        ? this.taskDurations.reduce((a, b) => a + b, 0) /
          this.taskDurations.length
        : 0;

    const totalTasks = this.completedTasks + this.failedTasks;
    const successRate = totalTasks > 0 ? this.completedTasks / totalTasks : 1;

    const queueLoad = this.taskQueue.length / this.currentConcurrency;

    let newConcurrency = this.currentConcurrency;

    if (queueLoad > 2 && successRate > 0.9 && avgDuration < 5000) {
      newConcurrency = Math.min(
        maxConcurrency,
        Math.ceil(this.currentConcurrency * 1.2),
      );
    } else if (successRate < 0.5 || avgDuration > 30000) {
      newConcurrency = Math.max(
        minConcurrency,
        Math.floor(this.currentConcurrency * 0.8),
      );
    }

    this.currentConcurrency = newConcurrency;
  }

  setConcurrency(concurrency: number): void {
    this.currentConcurrency = Math.max(
      this.options.minConcurrency,
      Math.min(this.options.maxConcurrency, concurrency),
    );
    this.processQueue();
  }

  getConcurrency(): number {
    return this.currentConcurrency;
  }

  getStats(): PoolStats {
    const totalDuration = this.taskDurations.reduce((a, b) => a + b, 0);
    return {
      currentConcurrency: this.currentConcurrency,
      desiredConcurrency: this.options.desiredConcurrency,
      pendingTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      avgTaskDurationMs:
        this.taskDurations.length > 0
          ? totalDuration / this.taskDurations.length
          : 0,
    };
  }

  /**
   * Gets all task durations for external analysis
   */
  getTaskDurations(): number[] {
    return [...this.taskDurations];
  }

  isActive(): boolean {
    return this.isRunning;
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  hasTasks(): boolean {
    return this.taskQueue.length > 0 || this.runningTasks.size > 0;
  }

  clearPending(): void {
    for (const task of this.taskQueue) {
      task.reject(new Error("Task cancelled"));
    }
    this.taskQueue = [];
  }

  abort(): void {
    this.isRunning = false;
    this.stopAutoscaling();
    this.clearPending();
  }
}
