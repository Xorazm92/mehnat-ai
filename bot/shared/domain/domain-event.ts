/**
 * Base class for all domain events.
 *
 * Domain events are the ONLY thing that crosses bounded-context boundaries
 * (monitoring → kpi → notifications, etc.). Each concrete event lives in its
 * context's `domain/events` folder and defines a stable `eventName` used as the
 * channel on the DomainEventBus.
 *
 * The domain layer stays framework-free: this file has zero Next/Prisma/BullMQ
 * imports on purpose, so it can be unit-tested with no DB and no I/O.
 */
export abstract class DomainEvent {
  /** When the event happened (not when it was dispatched). */
  readonly occurredAt: Date;

  constructor(occurredAt: Date = new Date()) {
    this.occurredAt = occurredAt;
  }

  /** Stable channel name, e.g. `monitoring.response_window_breached`. */
  abstract readonly eventName: string;
}
