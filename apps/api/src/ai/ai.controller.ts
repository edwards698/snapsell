import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  aiSettingsSchema,
  type AiSettingsInput,
  presetSettingsSchema,
  sandboxMessageSchema,
  sendMessageSchema,
} from '@snapsell/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AiSettingsService } from './ai-settings.service.js';
import { AiTurnService } from './turn.service.js';

@Controller('admin')
export class AiController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly turns: AiTurnService,
  ) {}

  @Get('ai-settings')
  get() {
    return this.settings.get();
  }

  @Patch('ai-settings')
  @HttpCode(200)
  update(@Body(new ZodPipe(aiSettingsSchema)) body: AiSettingsInput) {
    return this.settings.update(body);
  }

  @Get('ai-settings/presets')
  presets() {
    return this.settings.presets();
  }

  @Put('ai-settings/presets')
  savePresets(@Body(new ZodPipe(presetSettingsSchema)) body: z.infer<typeof presetSettingsSchema>) {
    return this.settings.updatePresets(body.presets);
  }

  @Get('ai/activity')
  activity() {
    return this.settings.activity();
  }

  @Post('ai/sandbox')
  @HttpCode(200)
  sandbox(@Body(new ZodPipe(sandboxMessageSchema)) body: z.infer<typeof sandboxMessageSchema>) {
    return this.turns.sandbox(body.message);
  }

  @Post('conversations/:id/drafts/:messageId/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Param('messageId') messageId: string) {
    return this.turns.approveDraft(id, messageId);
  }

  @Post('conversations/:id/drafts/:messageId/edit')
  @HttpCode(200)
  edit(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body(new ZodPipe(sendMessageSchema)) body: z.infer<typeof sendMessageSchema>,
  ) {
    return this.turns.approveDraft(id, messageId, body.body);
  }

  @Post('conversations/:id/drafts/:messageId/discard')
  @HttpCode(200)
  discard(@Param('id') id: string, @Param('messageId') messageId: string) {
    return this.turns.discardDraft(id, messageId);
  }
}
