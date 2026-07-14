import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '../domain/domain-event';

/**
 * Thin wrapper over Nest's EventEmitter2 that publishes domain events on their
 * `eventName` channel. Subscribers in other contexts react with `@OnEvent(name)`.
 *
 * This is the seam that keeps bounded contexts decoupled: publishers depend only
 * on this bus + their own event classes, never on the subscribing context.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  publish(event: DomainEvent): void {
    this.logger.debug(`Publishing ${event.eventName}`);
    this.emitter.emit(event.eventName, event);
  }

  publishAll(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.publish(event);
    }
  }
}
