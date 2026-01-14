import { readFile, writeFile } from "fs/promises";
import path from "path";

import { requireSDK } from "../sdk";

export abstract class ProjectScopedStore<T> {
  private currentProjectID: string | undefined;
  protected data: T;
  private subscribers = new Set<(data: T) => void>();

  constructor(private filename: string) {
    this.data = this.getDefaultData();
  }

  protected abstract getDefaultData(): T;

  async initialize(): Promise<void> {
    const sdk = requireSDK();
    const project = await sdk.projects.getCurrent();
    this.currentProjectID = project?.getId();
    await this.loadFromFile();
  }

  async switchProject(projectID: string | undefined): Promise<void> {
    this.currentProjectID = projectID;
    this.data = this.getDefaultData();
    await this.loadFromFile();
  }

  private getFilePath(): string {
    const sdk = requireSDK();
    if (this.currentProjectID === undefined) {
      return path.join(sdk.meta.path(), `${this.filename}.json`);
    }
    return path.join(
      sdk.meta.path(),
      `${this.filename}-${this.currentProjectID}.json`,
    );
  }

  protected async saveToFile(): Promise<void> {
    const filePath = this.getFilePath();
    await writeFile(filePath, JSON.stringify(this.data, null, 2));
  }

  private async loadFromFile(): Promise<void> {
    const filePath = this.getFilePath();
    try {
      const fileData = await readFile(filePath, "utf-8");
      const loaded = JSON.parse(fileData);
      this.data = this.mergeData(this.data, loaded);
      this.notify();
    } catch {
      await this.saveToFile();
    }
  }

  protected mergeData(current: T, loaded: unknown): T {
    if (Array.isArray(current)) {
      return loaded as T;
    }
    return Object.assign({}, current, loaded);
  }

  subscribe(subscriber: (data: T) => void): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  protected notify(): void {
    for (const subscriber of this.subscribers) {
      subscriber(this.data);
    }
  }
}
