import { Module } from '@nestjs/common';
import { ConversationControlService } from './conversation-control.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { InternalController } from './internal.controller.js';
import { MessagingService } from './messaging.service.js';
import { WaServiceClient } from './wa-service.client.js';

/** WhatsApp channel: internal endpoints for the WhatsApp service, the inbox and takeover. */
@Module({
  controllers: [ConversationsController, InternalController],
  providers: [ConversationsService, ConversationControlService, MessagingService, WaServiceClient],
  exports: [MessagingService, ConversationControlService, WaServiceClient],
})
export class MessagingModule {}
