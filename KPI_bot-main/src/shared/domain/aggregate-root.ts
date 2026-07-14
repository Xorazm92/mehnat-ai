import { DomainEvent } from './domain-event';

/**
 * Base class for aggregate roots. Aggregates record domain events as they mutate
 * state; the application layer pulls and publishes them via the DomainEventBus
 * after the aggregate is persisted (so events reflect committed facts).
 */
export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Returns and clears the pending events (call after successful persistence). */
  pullDomainEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }
}
