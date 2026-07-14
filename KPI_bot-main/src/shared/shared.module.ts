import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './events/domain-event-bus';

/**
 * Shared kernel: cross-context primitives (domain event bus, value objects, base
 * classes). Global so any context can inject DomainEventBus without re-importing.
 *
 * NOTE: EventEmitterModule.forRoot() must be registered once in AppModule so that
 * EventEmitter2 is injectable here.
 */
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class SharedModule {}
