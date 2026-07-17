import { DomainEvent } from "../domain/domain-event";

/** A subscriber reacting to a published domain event. May be async. */
export type DomainEventHandler<E extends DomainEvent = DomainEvent> = (
  event: E,
) => void | Promise<void>;

/**
 * A tiny, framework-free in-process publish/subscribe bus for domain events.
 *
 * This is the seam that keeps bounded contexts decoupled *within a single
 * worker process*: publishers depend only on this bus + their own event
 * classes, never on the subscribing context. Cross-process fan-out (the real
 * backbone at scale) is done through BullMQ queues, not this bus — use this
 * only for same-process, same-transaction reactions.
 *
 * Deliberately does NOT depend on NestJS or any DI container: the integrated
 * bot runs as a plain `tsx bot/main.ts` process alongside Next.js, so we keep
 * the domain layer free of framework weight (see bot/README.md, decision D1).
 */
export class DomainEventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  /** Subscribe to a channel. Returns an unsubscribe function. */
  subscribe<E extends DomainEvent>(
    eventName: string,
    handler: DomainEventHandler<E>,
  ): () => void {
    const set = this.handlers.get(eventName) ?? new Set();
    set.add(handler as DomainEventHandler);
    this.handlers.set(eventName, set);
    return () => set.delete(handler as DomainEventHandler);
  }

  /**
   * Publish one event to every subscriber of its channel. Awaits all handlers;
   * a throwing handler rejects the returned promise but does not stop the
   * others (errors are aggregated).
   */
  async publish(event: DomainEvent): Promise<void> {
    const set = this.handlers.get(event.eventName);
    if (!set || set.size === 0) return;
    const results = await Promise.allSettled(
      [...set].map((h) => Promise.resolve(h(event))),
    );
    const errors = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((e) => e.reason),
        `${errors.length} handler(s) failed for "${event.eventName}"`,
      );
    }
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
