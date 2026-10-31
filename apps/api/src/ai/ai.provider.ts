export interface AiPart {
  text?: string;
  media?: { mimeType: string; data: Buffer };
}

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ToolCallRecord {
  name: string;
  args: unknown;
  result: unknown;
}

export interface GenerateWithToolsInput {
  system: string;
  contents: Array<{ role: 'user' | 'model'; parts: AiPart[] }>;
  tools: ToolDeclaration[];
  /** Runs a business tool. `finish` is not passed here; its arguments are the reply. */
  execute: (name: string, args: unknown) => Promise<unknown> | unknown;
  maxSteps?: number;
  temperature?: number;
}

export interface GenerateWithToolsResult {
  text: string | null;
  /** Arguments of the model's `finish` call, when it made one. */
  finish: unknown | null;
  toolCalls: ToolCallRecord[];
  latencyMs: number;
  tokens: number | null;
}

/** The model interface the app depends on (BUILD_PLAN D10). */
export interface AiProvider {
  readonly configured: boolean;
  readonly model: string;
  /** Sends text + media and returns JSON matching `schema` (a JSON Schema object). */
  generateJson(
    parts: AiPart[],
    schema: Record<string, unknown>,
    opts?: { temperature?: number },
  ): Promise<unknown>;
  /** Tool loop, at most `maxSteps` model calls (default 6). Stops when the model calls `finish`. */
  generateWithTools(input: GenerateWithToolsInput): Promise<GenerateWithToolsResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export class AiUnavailableError extends Error {}

/**
 * The object Nest injects. Tests swap `inner` for a scripted model so nothing calls Gemini.
 */
export class AiClient implements AiProvider {
  constructor(public inner: AiProvider) {}

  use(next: AiProvider) {
    this.inner = next;
  }

  get configured() {
    return this.inner.configured;
  }

  get model() {
    return this.inner.model;
  }

  generateJson(
    parts: AiPart[],
    schema: Record<string, unknown>,
    opts?: { temperature?: number },
  ) {
    return this.inner.generateJson(parts, schema, opts);
  }

  generateWithTools(input: GenerateWithToolsInput) {
    return this.inner.generateWithTools(input);
  }
}
