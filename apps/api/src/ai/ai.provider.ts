export interface AiPart {
  text?: string;
  media?: { mimeType: string; data: Buffer };
}

/** The model interface the app depends on (BUILD_PLAN D10); Phase 6 adds tool calling. */
export interface AiProvider {
  readonly configured: boolean;
  readonly model: string;
  /** Sends text + media and returns JSON matching `schema` (a JSON Schema object). */
  generateJson(
    parts: AiPart[],
    schema: Record<string, unknown>,
    opts?: { temperature?: number },
  ): Promise<unknown>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export class AiUnavailableError extends Error {}
