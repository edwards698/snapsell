import { EventEmitter } from 'node:events';
import { Global, Injectable, Module } from '@nestjs/common';
import type { RealtimeEvents } from '@snapsell/shared';

/** In-process domain events. The realtime gateway forwards them to the admin over Socket.IO. */
export type DomainEvents = RealtimeEvents;

export const DOMAIN_EVENTS = [
  'message.new',
  'message.updated',
  'conversation.updated',
  'whatsapp.status',
  'stock.changed',
  'catalog.changed',
] as const satisfies ReadonlyArray<keyof DomainEvents>;

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
