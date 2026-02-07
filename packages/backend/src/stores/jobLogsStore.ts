import { ProjectScopedStore } from "./projectStore";

const MAX_LOG_LINES_PER_JOB = 500;

const DEFAULT_LOG_LEVEL = "info";

type LogEntry = {
  line: string;
  agentId?: number;
  timestamp: number;
  level?: string;
};

export type JobLogEntry = { line: string; level: string };

type JobLogsData = {
  logs: Record<string, LogEntry[]>;
};

class JobLogsStoreClass extends ProjectScopedStore<JobLogsData> {
  constructor() {
    super("crawler-job-logs");
  }

  protected getDefaultData(): JobLogsData {
    return { logs: {} };
  }

  append(
    jobId: string,
    line: string,
    agentId?: number,
    level: string = DEFAULT_LOG_LEVEL,
  ): void {
    let buffer = this.data.logs[jobId];
    if (buffer === undefined) {
      buffer = [];
      this.data.logs[jobId] = buffer;
    }
    buffer.push({ line, agentId, timestamp: Date.now(), level });
    if (buffer.length > MAX_LOG_LINES_PER_JOB) {
      buffer.shift();
    }
    this.saveToFile();
  }

  getLogs(jobId: string, agentId?: number): JobLogEntry[] {
    const buffer = this.data.logs[jobId];
    if (buffer === undefined) return [];

    const filtered =
      agentId !== undefined
        ? buffer.filter((entry) => entry.agentId === agentId)
        : buffer;

    return filtered.map((entry) => ({
      line: entry.line,
      level: entry.level ?? DEFAULT_LOG_LEVEL,
    }));
  }

  clear(jobId: string): void {
    delete this.data.logs[jobId];
    this.saveToFile();
  }

  clearAll(): void {
    this.data.logs = {};
    this.saveToFile();
  }
}

export const jobLogsStore = new JobLogsStoreClass();
