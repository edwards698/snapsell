import type { ConversationMode } from '@snapsell/shared';

export interface GateInput {
  enabled: boolean;
  globalMode: 'MANUAL' | 'SUGGEST' | 'AUTO';
  /** Mode captured at the start of the turn. A handover we just applied must not be passed as HUMAN. */
  conversationMode: ConversationMode;
  generationAtStart: number;
  generationNow: number;
  withinHours: boolean;
  hasAfterHoursMessage: boolean;
  confidence: number;
  confidenceThreshold: number;
  duplicate: boolean;
  /** The turn asked to hand the chat to the owner. */
  handover: boolean;
}

export interface GateResult {
  action: 'send' | 'draft' | 'drop';
  reason: string | null;
  outcome: 'AUTO_SENT' | 'SUGGESTED' | 'DROPPED' | 'ESCALATED';
}

function drop(reason: string): GateResult {
  return { action: 'drop', reason, outcome: 'DROPPED' };
}

/**
 * The only decision that turns a reply into a WhatsApp message, a draft, or nothing.
 * Global MANUAL and the master switch stop everything. Global SUGGEST caps every
 * conversation at a draft. A handover is saved for the owner even though it changes generation.
 */
export function decideSend(input: GateInput): GateResult {
  if (!input.enabled) return drop('The assistant is switched off');
  if (input.globalMode === 'MANUAL') return drop('The assistant is set to manual');
  if (!input.handover && input.conversationMode === 'HUMAN') {
    return drop('The owner has taken over');
  }
  if (!input.handover && input.conversationMode === 'PAUSED') {
    return drop('This conversation is paused');
  }
  if (input.handover) {
    return { action: 'draft', reason: 'Handed to the owner', outcome: 'ESCALATED' };
  }
  if (input.generationNow !== input.generationAtStart) {
    return drop('The conversation changed while the reply was being written');
  }
  if (input.duplicate) return drop('Same as the last message');
  if (!input.withinHours && !input.hasAfterHoursMessage) return drop('Outside opening hours');

  const suggest =
    input.globalMode === 'SUGGEST' || input.conversationMode === 'AI_SUGGEST';
  const lowConfidence = input.confidence < input.confidenceThreshold;
  if (suggest || lowConfidence) {
    return {
      action: 'draft',
      reason: lowConfidence && !suggest ? 'Below the confidence threshold' : null,
      outcome: 'SUGGESTED',
    };
  }
  return { action: 'send', reason: null, outcome: 'AUTO_SENT' };
}

/** Reasons to skip the model entirely. Hours and confidence still need a turn. */
export function skipModel(input: Pick<GateInput, 'enabled' | 'globalMode' | 'conversationMode'>): string | null {
  if (!input.enabled) return 'The assistant is switched off';
  if (input.globalMode === 'MANUAL') return 'The assistant is set to manual';
  if (input.conversationMode === 'HUMAN') return 'The owner has taken over';
  if (input.conversationMode === 'PAUSED') return 'This conversation is paused';
  return null;
}
