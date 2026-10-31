import { GoogleGenAI } from '@google/genai';
import { type AiPart, type AiProvider, AiUnavailableError } from './ai.provider.js';

const TIMEOUT_MS = 45_000;

export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenAI | null;

  constructor(
    apiKey: string | undefined,
    readonly model: string,
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get configured() {
    return this.client !== null;
  }

  async generateJson(
    parts: AiPart[],
    schema: Record<string, unknown>,
    opts: { temperature?: number } = {},
  ) {
    if (!this.client) throw new AiUnavailableError('GEMINI_API_KEY is not set');
    let text: string | undefined;
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: parts.map((p) =>
              p.media
                ? {
                    inlineData: {
                      mimeType: p.media.mimeType,
                      data: p.media.data.toString('base64'),
                    },
                  }
                : { text: p.text ?? '' },
            ),
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: opts.temperature ?? 0.2,
          httpOptions: { timeout: TIMEOUT_MS },
        },
      });
      text = res.text;
    } catch (err) {
      throw new AiUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (!text) throw new AiUnavailableError('Empty response from the model');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiUnavailableError('The model did not return valid JSON');
    }
  }
}
