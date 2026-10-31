import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  type ConversationListQuery,
  conversationListQuerySchema,
  sendMessageSchema,
  setModeSchema,
  takeoverSchema,
} from '@snapsell/shared';
import { z } from 'zod';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { ApiError } from '../common/errors.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ConversationControlService } from './conversation-control.service.js';
import { ConversationsService } from './conversations.service.js';
import { MessagingService } from './messaging.service.js';

const beforeSchema = z.object({ before: z.iso.datetime({ offset: true }).optional() });

@Controller('admin')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messaging: MessagingService,
    private readonly control: ConversationControlService,
  ) {}

  @Get('conversations')
  list(@Query(new ZodPipe(conversationListQuerySchema)) query: ConversationListQuery) {
    return this.conversations.list(query);
  }

  @Get('conversations/unread')
  unread() {
    return this.conversations.unreadTotal();
  }

  @Get('conversations/:id')
  get(@Param('id') id: string) {
    return this.conversations.get(id);
  }

  @Get('conversations/:id/messages')
  messages(
    @Param('id') id: string,
    @Query(new ZodPipe(beforeSchema)) q: z.infer<typeof beforeSchema>,
  ) {
    return this.conversations.messages(id, q.before ? new Date(q.before) : undefined);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@Param('id') id: string) {
    return this.conversations.markRead(id);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id') id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: z.infer<typeof sendMessageSchema>,
    @Auth() auth: AuthContext,
  ) {
    return this.messaging.sendOwnerMessage(id, body.body, { id: auth.user.id });
  }

  @Post('conversations/:id/takeover')
  @HttpCode(200)
  takeover(
    @Param('id') id: string,
    @Body(new ZodPipe(takeoverSchema)) body: z.infer<typeof takeoverSchema>,
    @Auth() auth: AuthContext,
  ) {
    this.conversations.get(id);
    this.control.takeover(id, body.until ? new Date(body.until) : null, {
      type: 'OWNER',
      id: auth.user.id,
    });
    return this.conversations.get(id);
  }

  @Post('conversations/:id/release')
  @HttpCode(200)
  release(@Param('id') id: string, @Auth() auth: AuthContext) {
    this.conversations.get(id);
    this.control.release(id, { type: 'OWNER', id: auth.user.id });
    return this.conversations.get(id);
  }

  @Post('conversations/:id/mode')
  @HttpCode(200)
  mode(
    @Param('id') id: string,
    @Body(new ZodPipe(setModeSchema)) body: z.infer<typeof setModeSchema>,
    @Auth() auth: AuthContext,
  ) {
    this.conversations.get(id);
    this.control.setMode(id, body.mode, { type: 'OWNER', id: auth.user.id });
    return this.conversations.get(id);
  }

  @Post('messages/:id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.messaging.retry(id);
  }

  @Get('presets')
  presets() {
    return this.conversations.presets();
  }

  // --- WhatsApp integration ------------------------------------------------------

  @Get('integrations/whatsapp')
  whatsapp() {
    return this.messaging.liveStatus();
  }

  @Post('integrations/whatsapp/acknowledge')
  @HttpCode(200)
  acknowledge(@Auth() auth: AuthContext) {
    return this.messaging.acknowledgeRisk({ type: 'OWNER', id: auth.user.id });
  }

  @Post('integrations/whatsapp/:command')
  @HttpCode(200)
  command(@Param('command') command: string, @Auth() auth: AuthContext) {
    const parsed = z.enum(['connect', 'reconnect', 'disconnect']).safeParse(command);
    if (!parsed.success) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found.');
    return this.messaging.runCommand(parsed.data, { id: auth.user.id });
  }
}
