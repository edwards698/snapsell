import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type Part,
} from '@google/genai';
import {
  type AiPart,
  type AiProvider,
  AiUnavailableError,
  type GenerateWithToolsInput,
  type GenerateWithToolsResult,
  type ToolCallRecord,
} from './ai.provider.js';

const TIMEOUT_MS = 45_000;

const SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));

function toPart(p: AiPart): Part {
  return p.media
    ? { inlineData: { mimeType: p.media.mimeType, data: p.media.data.toString('base64') } }
    : { text: p.text ?? '' };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value ?? null };
}

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
    const text = await this.withRetry(async () => {
      const res = await this.client!.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: parts.map(toPart) }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: opts.temperature ?? 0.2,
          httpOptions: { timeout: TIMEOUT_MS },
          safetySettings: SAFETY,
        },
      });
      if (!res.text) throw new AiUnavailableError('Empty response from the model');
      return res.text;
    });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiUnavailableError('The model did not return valid JSON');
    }
  }

  async generateWithTools(input: GenerateWithToolsInput): Promise<GenerateWithToolsResult> {
    if (!this.client) throw new AiUnavailableError('GEMINI_API_KEY is not set');
    const contents: Content[] = input.contents.map((c) => ({
      role: c.role,
      parts: c.parts.map(toPart),
    }));
    const tools = [
      {
        functionDeclarations: input.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ];
    const started = Date.now();
    const toolCalls: ToolCallRecord[] = [];
    let tokens = 0;
    let finish: unknown = null;
    let text: string | null = null;
    const maxSteps = input.maxSteps ?? 6;

    for (let step = 0; step < maxSteps; step++) {
      const res = await this.withRetry(() =>
        this.client!.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: input.system,
            tools,
            temperature: input.temperature ?? 0.4,
            httpOptions: { timeout: TIMEOUT_MS },
            safetySettings: SAFETY,
          },
        }),
      );
      tokens += res.usageMetadata?.totalTokenCount ?? 0;
      const calls = (res.functionCalls ?? []).filter((c) => c.name);
      if (calls.length === 0) {
        text = res.text ?? null;
        break;
      }
      const modelContent = res.candidates?.[0]?.content;
      contents.push(
        modelContent?.parts?.length
          ? modelContent
          : {
              role: 'model',
              parts: calls.map((c) => ({
                functionCall: { name: c.name, args: c.args, id: c.id },
              })),
            },
      );
      const responseParts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? '';
        const args = call.args ?? {};
        if (name === 'finish') {
          finish = args;
          responseParts.push({
            functionResponse: { name, id: call.id, response: { ok: true } },
          });
          continue;
        }
        let result: unknown;
        try {
          result = await input.execute(name, args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : 'Tool failed' };
        }
        toolCalls.push({ name, args, result });
        responseParts.push({
          functionResponse: { name, id: call.id, response: asRecord(result) },
        });
      }
      if (finish) break;
      contents.push({ role: 'user', parts: responseParts });
    }

    return {
      text,
      finish,
      toolCalls,
      latencyMs: Date.now() - started,
      tokens: tokens || null,
    };
  }

  /** One retry with jitter. The caller sees a single AiUnavailableError if both attempts fail. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiUnavailableError && err.message === 'Empty response from the model') {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));
      try {
        return await fn();
      } catch (err2) {
        throw new AiUnavailableError(err2 instanceof Error ? err2.message : String(err2));
      }
    }
  }
}
