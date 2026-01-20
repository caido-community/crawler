/**
 * Event Bus - Centralized event management for the crawler backend
 *
 * Provides pub/sub pattern for decoupled communication between components.
 */

import type { EventPayload, EventType } from "./types";

type AnyHandler = (event: unknown) => void;

/**
 * Event subscription
 */
interface Subscription {
  handler: AnyHandler;
  once: boolean;
}

/**
 * Event bus class for managing event subscriptions and publishing
 */
class EventBusClass {
  private subscribers: Map<string, Set<Subscription>> = new Map();

  /**
   * Subscribes to an event type
   * @param type - Event type to subscribe to
   * @param handler - Handler function to call when event occurs
   * @returns Unsubscribe function
   */
  on<T extends EventType>(
    type: T,
    handler: (event: EventPayload<T>) => void,
  ): () => void {
    const subscription: Subscription = {
      handler: handler as AnyHandler,
      once: false,
    };
    this.addSubscription(type, subscription);
    return () => this.removeHandler(type, handler as AnyHandler);
  }

  /**
   * Subscribes to an event type for a single occurrence
   * @param type - Event type to subscribe to
   * @param handler - Handler function to call once when event occurs
   * @returns Unsubscribe function
   */
  once<T extends EventType>(
    type: T,
    handler: (event: EventPayload<T>) => void,
  ): () => void {
    const subscription: Subscription = {
      handler: handler as AnyHandler,
      once: true,
    };
    this.addSubscription(type, subscription);
    return () => this.removeHandler(type, handler as AnyHandler);
  }

  /**
   * Unsubscribes from an event type
   * @param type - Event type to unsubscribe from
   * @param handler - Handler function to remove
   */
  off<T extends EventType>(
    type: T,
    handler: (event: EventPayload<T>) => void,
  ): void {
    this.removeHandler(type, handler as AnyHandler);
  }

  /**
   * Publishes an event to all subscribers
   * @param event - Event object to publish
   */
  emit<T extends EventType>(event: EventPayload<T>): void {
    const subs = this.subscribers.get(event.type);
    if (subs === undefined) return;

    const toRemove: Subscription[] = [];

    for (const sub of subs) {
      try {
        sub.handler(event);
        if (sub.once) {
          toRemove.push(sub);
        }
      } catch (error) {
        console.error(
          `Error in event handler for ${event.type}: ${String(error)}`,
        );
      }
    }

    for (const sub of toRemove) {
      subs.delete(sub);
    }
  }

  /**
   * Checks if an event type has any subscribers
   * @param type - Event type to check
   * @returns true if there are subscribers
   */
  hasSubscribers(type: EventType): boolean {
    const subs = this.subscribers.get(type);
    return subs !== undefined && subs.size > 0;
  }

  /**
   * Gets the count of subscribers for an event type
   * @param type - Event type to count subscribers for
   * @returns Number of subscribers
   */
  subscriberCount(type: EventType): number {
    return this.subscribers.get(type)?.size ?? 0;
  }

  /**
   * Removes all subscribers
   */
  clear(): void {
    this.subscribers.clear();
  }

  private addSubscription(type: string, subscription: Subscription): void {
    let subs = this.subscribers.get(type);
    if (subs === undefined) {
      subs = new Set();
      this.subscribers.set(type, subs);
    }
    subs.add(subscription);
  }

  private removeHandler(type: string, handler: AnyHandler): void {
    const subs = this.subscribers.get(type);
    if (subs === undefined) return;

    for (const sub of subs) {
      if (sub.handler === handler) {
        subs.delete(sub);
        break;
      }
    }

    if (subs.size === 0) {
      this.subscribers.delete(type);
    }
  }
}

/**
 * Singleton event bus instance
 */
export const EventBus = new EventBusClass();
