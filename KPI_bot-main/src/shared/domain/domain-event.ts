/**
 * Base class for all domain events.
 *
 * Domain events are the ONLY thing that crosses bounded-context boundaries
 * (monitoring → kpi-engine → notifications, etc.). Each concrete event lives in
 * its context's `domain/events` folder and defines a stable `eventName` used as
 * the channel on the event bus.
 *
 * The domain layer must stay framework-free: this file has zero Nest/Telegraf/
 * TypeORM imports on purpose.
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
