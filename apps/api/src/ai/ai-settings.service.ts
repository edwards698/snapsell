import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  aiActivityLogs,
  aiSettings,
  businessSettings,
  type DatabaseHandle,
  presetResponses,
} from '@snapsell/db';
import {
  type AiActivityItem,
  type AiSettingsDto,
  type AiSettingsInput,
  AiResponseStyle,
  AiTone,
  formatMoney,
  parseAiFeatures,
  type PresetKey,
  type PresetSetting,
} from '@snapsell/shared';
import { desc, eq } from 'drizzle-orm';
import { AI_PROVIDER, type AiProvider } from './ai.provider.js';
import { DATABASE } from '../database/database.module.js';

const PRESET_ORDER: PresetKey[] = ['greeting', 'hours', 'location', 'delivery', 'payment'];

/** Reads and updates the singleton AI settings, presets and the activity list. */
@Injectable()
export class AiSettingsService implements OnApplicationBootstrap {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  onApplicationBootstrap() {
    const { db } = this.handle;
    const existing = db.select({ key: presetResponses.key }).from(presetResponses).all();
    if (existing.length > 0) return;
    const shop = db.select().from(businessSettings).get();
    const texts = defaultPresets(
      shop ?? {
        name: 'SnapSell Shop',
        address: null,
        deliveryEnabled: true,
        deliveryFeeMinor: 0,
        currency: 'ZMW',
        collectionEnabled: true,
      },
    );
    for (const key of PRESET_ORDER) {
      db.insert(presetResponses).values({ key, text: texts[key], enabled: true }).run();
    }
  }

  get(): AiSettingsDto {
    const row = this.row();
    const features = parseAiFeatures(row.features);
    const style = AiResponseStyle.safeParse(row.responseStyle);
    const tone = AiTone.safeParse(row.tone);
    return {
      enabled: row.enabled,
      mode: row.mode,
      responseStyle: style.success ? style.data : 'conversational',
      tone: tone.success ? tone.data : 'friendly',
      language: row.language,
      features: {
        productEnquiries: features.productEnquiries,
        stockEnquiries: features.stockEnquiries,
        showExactStock: features.showExactStock,
        voiceNotes: features.voiceNotes,
        imageUnderstanding: features.imageUnderstanding,
        orderAssistance: features.orderAssistance,
        draftOrders: features.draftOrders,
        paymentAutoSend: features.paymentAutoSend,
      },
      confidenceThreshold: row.confidenceThreshold,
      escalationTopics: row.escalationTopics,
      afterHoursMessage: row.afterHoursMessage,
      configured: this.ai.configured,
    };
  }

  update(input: AiSettingsInput): AiSettingsDto {
    const current = parseAiFeatures(this.row().features);
    this.handle.db
      .update(aiSettings)
      .set({
        enabled: input.enabled,
        mode: input.mode,
        responseStyle: input.responseStyle,
        tone: input.tone,
        language: input.language,
        features: { ...current, ...input.features },
        confidenceThreshold: input.confidenceThreshold,
        escalationTopics: input.escalationTopics,
        afterHoursMessage: input.afterHoursMessage?.trim() ? input.afterHoursMessage.trim() : null,
      })
      .where(eq(aiSettings.id, 1))
      .run();
    return this.get();
  }

  presets(): PresetSetting[] {
    const rows = this.handle.db.select().from(presetResponses).all();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return PRESET_ORDER.map((key) => {
      const row = byKey.get(key);
      return { key, text: row?.text ?? '', enabled: row?.enabled ?? false };
    });
  }

  updatePresets(presets: PresetSetting[]): PresetSetting[] {
    const { db } = this.handle;
    db.transaction((tx) => {
      for (const preset of presets) {
        tx.insert(presetResponses)
          .values(preset)
          .onConflictDoUpdate({
            target: presetResponses.key,
            set: { text: preset.text, enabled: preset.enabled },
          })
          .run();
      }
    });
    return this.presets();
  }

  activity(limit = 30): AiActivityItem[] {
    return this.handle.db
      .select()
      .from(aiActivityLogs)
      .orderBy(desc(aiActivityLogs.createdAt))
      .limit(limit)
      .all()
      .map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        interpretation: row.interpretation,
        response: row.response,
        outcome: row.outcome,
        toolCalls: row.toolCalls,
        model: row.model,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  private row() {
    return this.handle.db.select().from(aiSettings).get()!;
  }
}

function defaultPresets(shop: {
  name: string;
  address: string | null;
  deliveryEnabled: boolean;
  deliveryFeeMinor: number;
  currency: string;
  collectionEnabled: boolean;
}): Record<PresetKey, string> {
  const fee = formatMoney(shop.deliveryFeeMinor, shop.currency, { trimZeros: true });
  const delivery = !shop.deliveryEnabled
    ? 'Collection only — we are not delivering at the moment.'
    : shop.deliveryFeeMinor > 0
      ? `Delivery is ${fee}.${shop.collectionEnabled ? ' Collection is free.' : ''}`
      : `Delivery is free.${shop.collectionEnabled ? ' Collection is free too.' : ''}`;
  return {
    greeting: `Hello, welcome to ${shop.name}. How can I help you today?`,
    hours: `Thanks for messaging ${shop.name}. Tell us when you’d like to visit and we’ll confirm we’re open.`,
    location: shop.address?.trim()
      ? `${shop.name} is at ${shop.address.trim()}.`
      : `Message us and we’ll share the ${shop.name} collection point.`,
    delivery,
    payment:
      'After you confirm an order we send a secure payment link. An order is paid only when the payment provider confirms it.',
  };
}
