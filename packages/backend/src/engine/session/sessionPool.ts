/**
 * Session Pool - Manages a pool of sessions for distributed crawling
 */

import type { SessionData } from "../types";

import { Session } from "./session";

// ============================================================================
// Types
// ============================================================================

export interface SessionPoolOptions {
  maxPoolSize?: number;
  maxSessionUsageCount?: number;
  maxSessionAgeMs?: number;
  maxSessionErrorScore?: number;
  createSessionFunction?: () => Session;
  persistStateFunction?: (sessions: SessionData[]) => void;
  restoreStateFunction?: () => SessionData[] | undefined;
}

// ============================================================================
// Session Pool Class
// ============================================================================

export class SessionPool {
  private sessions: Map<string, Session> = new Map();
  private options: Required<
    Pick<
      SessionPoolOptions,
      | "maxPoolSize"
      | "maxSessionUsageCount"
      | "maxSessionAgeMs"
      | "maxSessionErrorScore"
    >
  > & {
    createSessionFunction?: () => Session;
    persistStateFunction?: (sessions: SessionData[]) => void;
    restoreStateFunction?: () => SessionData[] | undefined;
  };

  constructor(options: SessionPoolOptions = {}) {
    this.options = {
      maxPoolSize: options.maxPoolSize ?? 10,
      maxSessionUsageCount: options.maxSessionUsageCount ?? 50,
      maxSessionAgeMs: options.maxSessionAgeMs ?? 3600000, // 1 hour
      maxSessionErrorScore: options.maxSessionErrorScore ?? 8,
      createSessionFunction: options.createSessionFunction,
      persistStateFunction: options.persistStateFunction,
      restoreStateFunction: options.restoreStateFunction,
    };

    // Restore state if function provided
    if (this.options.restoreStateFunction !== undefined) {
      const savedSessions = this.options.restoreStateFunction();
      if (savedSessions !== undefined) {
        for (const data of savedSessions) {
          const session = Session.fromJSON(data);
          if (session.isUsable()) {
            this.sessions.set(session.id, session);
          }
        }
      }
    }
  }

  /**
   * Gets an available session from the pool
   * Creates a new one if no usable sessions exist
   */
  getSession(): Session {
    // Clean up expired/blocked sessions
    this.cleanup();

    // Find a usable session
    for (const session of this.sessions.values()) {
      if (session.isUsable()) {
        session.markUsed();
        return session;
      }
    }

    // No usable session, create a new one
    return this.createSession();
  }

  /**
   * Creates a new session and adds it to the pool
   */
  createSession(): Session {
    // If pool is full, remove oldest session
    if (this.sessions.size >= this.options.maxPoolSize) {
      this.removeOldestSession();
    }

    // Create session using custom function or default
    const session =
      this.options.createSessionFunction !== undefined
        ? this.options.createSessionFunction()
        : new Session({ maxUsageCount: this.options.maxSessionUsageCount });

    session.markUsed();
    this.sessions.set(session.id, session);

    return session;
  }

  /**
   * Adds an existing session to the pool
   */
  addSession(session: Session): void {
    if (this.sessions.size >= this.options.maxPoolSize) {
      this.removeOldestSession();
    }
    this.sessions.set(session.id, session);
  }

  /**
   * Gets a session by ID
   */
  getSessionById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Retires a session (marks it as blocked)
   */
  retireSession(session: Session): void {
    session.isBlocked = true;
    this.persistState();
  }

  /**
   * Records an error for a session
   */
  recordError(session: Session, weight: number = 1): void {
    session.recordError(weight);
    if (session.errorScore >= this.options.maxSessionErrorScore) {
      this.retireSession(session);
    }
    this.persistState();
  }

  /**
   * Records a success for a session
   */
  recordSuccess(session: Session, weight: number = 0.5): void {
    session.recordSuccess(weight);
    this.persistState();
  }

  /**
   * Removes a session from the pool
   */
  removeSession(sessionId: string): boolean {
    const result = this.sessions.delete(sessionId);
    if (result) {
      this.persistState();
    }
    return result;
  }

  /**
   * Removes the oldest session
   */
  private removeOldestSession(): void {
    let oldest: Session | undefined;
    let oldestTime = Date.now();

    for (const session of this.sessions.values()) {
      const createdTime = session.createdAt.getTime();
      if (createdTime < oldestTime) {
        oldestTime = createdTime;
        oldest = session;
      }
    }

    if (oldest !== undefined) {
      this.sessions.delete(oldest.id);
    }
  }

  /**
   * Cleans up expired and blocked sessions
   */
  cleanup(): void {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    for (const [id, session] of this.sessions) {
      // Check age
      const age = now - session.createdAt.getTime();
      if (age > this.options.maxSessionAgeMs) {
        sessionsToRemove.push(id);
        continue;
      }

      // Check if blocked or maxed out
      if (session.isBlocked || session.isMaxedOut()) {
        sessionsToRemove.push(id);
        continue;
      }

      // Check if expired
      if (session.isExpired()) {
        sessionsToRemove.push(id);
        continue;
      }
    }

    for (const id of sessionsToRemove) {
      this.sessions.delete(id);
    }

    if (sessionsToRemove.length > 0) {
      this.persistState();
    }
  }

  /**
   * Persists the current state
   */
  private persistState(): void {
    if (this.options.persistStateFunction !== undefined) {
      const sessions = Array.from(this.sessions.values()).map((s) =>
        s.toJSON(),
      );
      this.options.persistStateFunction(sessions);
    }
  }

  /**
   * Gets pool statistics
   */
  getStats(): {
    total: number;
    usable: number;
    blocked: number;
    avgUsageCount: number;
    avgErrorScore: number;
  } {
    let usable = 0;
    let blocked = 0;
    let totalUsage = 0;
    let totalError = 0;

    for (const session of this.sessions.values()) {
      if (session.isUsable()) {
        usable++;
      }
      if (session.isBlocked) {
        blocked++;
      }
      totalUsage += session.usageCount;
      totalError += session.errorScore;
    }

    const total = this.sessions.size;

    return {
      total,
      usable,
      blocked,
      avgUsageCount: total > 0 ? totalUsage / total : 0,
      avgErrorScore: total > 0 ? totalError / total : 0,
    };
  }

  /**
   * Gets all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Gets usable sessions
   */
  getUsableSessions(): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.isUsable());
  }

  /**
   * Clears all sessions
   */
  clear(): void {
    this.sessions.clear();
    this.persistState();
  }

  /**
   * Gets the pool size
   */
  size(): number {
    return this.sessions.size;
  }

  /**
   * Checks if pool is empty
   */
  isEmpty(): boolean {
    return this.sessions.size === 0;
  }

  /**
   * Exports all sessions for persistence
   */
  toJSON(): SessionData[] {
    return Array.from(this.sessions.values()).map((s) => s.toJSON());
  }

  /**
   * Restores sessions from persisted data
   */
  static fromJSON(
    data: SessionData[],
    options?: SessionPoolOptions,
  ): SessionPool {
    const pool = new SessionPool(options);
    for (const sessionData of data) {
      const session = Session.fromJSON(sessionData);
      if (session.isUsable()) {
        pool.sessions.set(session.id, session);
      }
    }
    return pool;
  }
}
