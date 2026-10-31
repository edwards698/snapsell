import { EventEmitter } from 'node:events';
import { Global, Injectable, Module } from '@nestjs/common';

/** In-process domain events. Phase 5 forwards these to the admin over Socket.IO. */
export interface DomainEvents {
  'stock.changed': { variantIds: string[] };
  'catalog.changed': { productId: string };
}

@Injectable()
export class EventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void) {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}

@Global()
@Module({ providers: [EventBus], exports: [EventBus] })
export class EventsModule {}
