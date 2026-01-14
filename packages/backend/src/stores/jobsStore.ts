import type { CrawlJob } from "shared";

import { requireSDK } from "../sdk";

import { ProjectScopedStore } from "./projectStore";

type JobsData = {
  jobs: CrawlJob[];
};

class JobsStore extends ProjectScopedStore<JobsData> {
  constructor() {
    super("crawler-jobs");
  }

  protected getDefaultData(): JobsData {
    return { jobs: [] };
  }

  getJobs(): CrawlJob[] {
    return this.data.jobs;
  }

  getJob(jobId: string): CrawlJob | undefined {
    return this.data.jobs.find((job) => job.id === jobId);
  }

  addJob(job: CrawlJob): void {
    const existingIndex = this.data.jobs.findIndex((j) => j.id === job.id);
    if (existingIndex >= 0) {
      this.data.jobs[existingIndex] = job;
    } else {
      this.data.jobs.push(job);
    }
    this.notify();
    this.saveToFile();
  }

  updateJob(jobId: string, updates: Partial<CrawlJob>): void {
    const index = this.data.jobs.findIndex((job) => job.id === jobId);
    if (index >= 0) {
      const currentJob = this.data.jobs[index];
      if (currentJob !== undefined) {
        this.data.jobs[index] = { ...currentJob, ...updates };
        this.notify();
        this.saveToFile();
        this.emitJobUpdate(this.data.jobs[index]);
      }
    }
  }

  removeJob(jobId: string): void {
    const index = this.data.jobs.findIndex((job) => job.id === jobId);
    if (index >= 0) {
      this.data.jobs.splice(index, 1);
      this.notify();
      this.saveToFile();
    }
  }

  clearCompletedJobs(): void {
    this.data.jobs = this.data.jobs.filter(
      (job) => job.status !== "completed" && job.status !== "failed",
    );
    this.notify();
    this.saveToFile();
  }

  clearAllJobs(): void {
    this.data.jobs = [];
    this.notify();
    this.saveToFile();
  }

  getActiveJobs(): CrawlJob[] {
    return this.data.jobs.filter(
      (job) => job.status === "running" || job.status === "pending",
    );
  }

  getJobByHost(host: string): CrawlJob | undefined {
    return this.data.jobs.find(
      (job) =>
        job.host === host &&
        (job.status === "running" || job.status === "pending"),
    );
  }

  private emitJobUpdate(job: CrawlJob): void {
    const sdk = requireSDK();
    sdk.api.send("job:updated", job);
  }
}

export const jobsStore = new JobsStore();
