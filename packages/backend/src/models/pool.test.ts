/**
 * Tests for ConcurrencyPool class
 */

import { afterEach, describe, expect, it } from "vitest";

import { ConcurrencyPool } from "./pool";

describe("ConcurrencyPool", () => {
  let pool: ConcurrencyPool;

  afterEach(() => {
    if (pool?.isActive()) {
      pool.abort();
    }
  });

  describe("constructor", () => {
    it("creates pool with default options", () => {
      pool = new ConcurrencyPool();
      expect(pool.getConcurrency()).toBe(5);
    });

    it("creates pool with custom options", () => {
      pool = new ConcurrencyPool({
        maxConcurrency: 20,
        minConcurrency: 2,
        desiredConcurrency: 10,
      });
      expect(pool.getConcurrency()).toBe(10);
    });
  });

  describe("start/stop", () => {
    it("starts the pool", () => {
      pool = new ConcurrencyPool();
      expect(pool.isActive()).toBe(false);
      pool.start();
      expect(pool.isActive()).toBe(true);
    });

    it("stops the pool", async () => {
      pool = new ConcurrencyPool();
      pool.start();
      await pool.stop();
      expect(pool.isActive()).toBe(false);
    });

    it("start is idempotent", () => {
      pool = new ConcurrencyPool();
      pool.start();
      pool.start();
      expect(pool.isActive()).toBe(true);
    });
  });

  describe("pause/resume", () => {
    it("pauses the pool", () => {
      pool = new ConcurrencyPool();
      pool.start();
      pool.pause();
      expect(pool.isPausedState()).toBe(true);
    });

    it("resumes the pool", () => {
      pool = new ConcurrencyPool();
      pool.start();
      pool.pause();
      pool.resume();
      expect(pool.isPausedState()).toBe(false);
    });
  });

  describe("addTask", () => {
    it("executes a task and returns its result", async () => {
      pool = new ConcurrencyPool();
      pool.start();

      const result = await pool.addTask(() => Promise.resolve(42));

      expect(result).toBe(42);
    });

    it("handles task errors", async () => {
      pool = new ConcurrencyPool();
      pool.start();

      await expect(
        pool.addTask(() => Promise.reject(new Error("Task failed"))),
      ).rejects.toThrow("Task failed");
    });

    it("queues tasks when not running", async () => {
      pool = new ConcurrencyPool();

      const promise = pool.addTask(() => Promise.resolve(1));
      expect(pool.hasTasks()).toBe(true);

      pool.start();
      const result = await promise;
      expect(result).toBe(1);
    });
  });

  describe("addTasks", () => {
    it("executes multiple tasks", async () => {
      pool = new ConcurrencyPool({ maxConcurrency: 5 });
      pool.start();

      const results = await pool.addTasks([
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
      ]);

      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe("concurrency control", () => {
    it("respects maxConcurrency limit", async () => {
      pool = new ConcurrencyPool({ maxConcurrency: 2, desiredConcurrency: 2 });
      pool.start();

      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array(5)
        .fill(null)
        .map(() => async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 20));
          concurrent--;
          return true;
        });

      await pool.addTasks(tasks);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("setConcurrency clamps to min/max", () => {
      pool = new ConcurrencyPool({
        minConcurrency: 2,
        maxConcurrency: 10,
      });

      pool.setConcurrency(1);
      expect(pool.getConcurrency()).toBe(2);

      pool.setConcurrency(100);
      expect(pool.getConcurrency()).toBe(10);

      pool.setConcurrency(5);
      expect(pool.getConcurrency()).toBe(5);
    });
  });

  describe("getStats", () => {
    it("tracks task statistics", async () => {
      pool = new ConcurrencyPool();
      pool.start();

      await pool.addTask(() => Promise.resolve(1));
      await pool.addTask(() => Promise.resolve(2));

      const stats = pool.getStats();
      expect(stats.completedTasks).toBe(2);
      expect(stats.failedTasks).toBe(0);
    });

    it("tracks failed tasks", async () => {
      pool = new ConcurrencyPool();
      pool.start();

      try {
        await pool.addTask(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }

      const stats = pool.getStats();
      expect(stats.failedTasks).toBe(1);
    });
  });

  describe("hasTasks", () => {
    it("returns true when tasks are queued or running", async () => {
      pool = new ConcurrencyPool({ maxConcurrency: 1 });
      pool.start();

      let resolve: () => void;
      const blockingPromise = new Promise<void>((r) => {
        resolve = r;
      });

      pool.addTask(() => blockingPromise.then(() => {}));

      // Add another task that will be queued
      pool.addTask(() => Promise.resolve(1));

      expect(pool.hasTasks()).toBe(true);

      resolve!();
      await new Promise((r) => setTimeout(r, 100));
    });

    it("returns false when no tasks", () => {
      pool = new ConcurrencyPool();
      expect(pool.hasTasks()).toBe(false);
    });
  });

  describe("clearPending", () => {
    it("clears pending tasks and rejects them", async () => {
      pool = new ConcurrencyPool({ maxConcurrency: 1 });
      // Don't start yet so tasks are queued

      const promise = pool.addTask(() => Promise.resolve(1));
      pool.clearPending();

      await expect(promise).rejects.toThrow("Task cancelled");
    });
  });

  describe("abort", () => {
    it("stops the pool and clears pending tasks", () => {
      pool = new ConcurrencyPool();
      pool.start();
      pool.addTask(() => Promise.resolve(1));

      pool.abort();

      expect(pool.isActive()).toBe(false);
    });
  });

  describe("task timeout", () => {
    it("rejects tasks that exceed timeout", async () => {
      pool = new ConcurrencyPool({ taskTimeoutMs: 50 });
      pool.start();

      await expect(
        pool.addTask(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 1;
        }),
      ).rejects.toThrow("Task timed out");
    });
  });

  describe("getTaskDurations", () => {
    it("returns a copy of task durations", async () => {
      pool = new ConcurrencyPool();
      pool.start();

      await pool.addTask(() => Promise.resolve(1));
      const durations = pool.getTaskDurations();

      expect(durations).toHaveLength(1);
      expect(durations[0]).toBeGreaterThanOrEqual(0);
    });
  });
});
