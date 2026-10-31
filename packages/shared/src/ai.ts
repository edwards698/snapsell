import { z } from 'zod';
import { AiGlobalMode, AiOutcome } from './enums.js';

export const AiResponseStyle = z.enum(['conversational', 'concise', 'structured', 'preset']);
export const AiTone = z.enum(['professional', 'friendly', 'casual']);
export const PresetKey = z.enum(['greeting', 'hours', 'location', 'delivery', 'payment']);

export type AiResponseStyle = z.infer<typeof AiResponseStyle>;
export type AiTone = z.infer<typeof AiTone>;
export type PresetKey = z.infer<typeof PresetKey>;

/** Feature toggles stored in `ai_settings.features`. Missing keys use these defaults. */
export const aiFeaturesSchema = z.object({
  productEnquiries: z.boolean().default(true),
  stockEnquiries: z.boolean().default(true),
  showExactStock: z.boolean().default(false),
  voiceNotes: z.boolean().default(true),
  imageUnderstanding: z.boolean().default(true),
  /** Owner may let the assistant prepare WhatsApp orders through the controlled tools. */
  orderAssistance: z.boolean().default(true),
  /** create_draft_order / update_draft_order are allowed. */
  draftOrders: z.boolean().default(true),
  /**
   * After confirm, send the DevDraft URL automatically. When false the link is created but
   * the owner must approve sending it (recommended for the first weeks).
   */
  paymentAutoSend: z.boolean().default(false),
  /** An owner reply switches the conversation to human until they hand it back. */
  ownerReplySetsHuman: z.boolean().default(true),
});
export type AiFeatures = z.infer<typeof aiFeaturesSchema>;

export const aiFeatureDefaults: AiFeatures = aiFeaturesSchema.parse({});

export function parseAiFeatures(raw: unknown): AiFeatures {
  const extra = raw && typeof raw === 'object' ? raw : {};
  return aiFeaturesSchema.parse({ ...aiFeatureDefaults, ...extra });
}

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: AiGlobalMode,
  responseStyle: AiResponseStyle,
  tone: AiTone,
  language: z.string().trim().min(1).max(20),
  features: z.object({
    productEnquiries: z.boolean(),
    stockEnquiries: z.boolean(),
    showExactStock: z.boolean(),
    voiceNotes: z.boolean(),
    imageUnderstanding: z.boolean(),
    orderAssistance: z.boolean(),
    draftOrders: z.boolean(),
    paymentAutoSend: z.boolean(),
  }),
  confidenceThreshold: z.number().int().min(0).max(100),
  escalationTopics: z.array(z.string().trim().min(1).max(80)).max(20),
  afterHoursMessage: z.string().trim().max(2000).nullable(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export interface AiSettingsDto extends AiSettingsInput {
  /** Whether a Gemini API key is configured. The key itself is never sent. */
  configured: boolean;
}

export const presetSettingsSchema = z.object({
  presets: z
    .array(
      z.object({
        key: PresetKey,
        text: z.string().trim().min(1).max(2000),
        enabled: z.boolean(),
      }),
    )
    .length(5),
});
export type PresetSetting = z.infer<typeof presetSettingsSchema>['presets'][number];

export const sandboxMessageSchema = z.object({
  message: z.string().trim().min(1, 'Write a message first.').max(2000),
});

export interface SandboxToolCall {
  name: string;
  args: unknown;
  result: unknown;
}

export interface SandboxResult {
  reply: string;
  interpretation: string;
  confidence: number;
  toolCalls: SandboxToolCall[];
  outcome: z.infer<typeof AiOutcome>;
}

export interface AiActivityItem {
  id: string;
  conversationId: string | null;
  interpretation: string | null;
  response: string | null;
  outcome: z.infer<typeof AiOutcome>;
  toolCalls: unknown[];
  model: string | null;
  latencyMs: number | null;
  createdAt: string;
}
