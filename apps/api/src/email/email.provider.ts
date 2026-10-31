import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resend } from 'resend';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: 'resend' | 'log';
  /** `idempotencyKey` makes retries safe: the provider sends at most one email per key. */
  send(email: OutgoingEmail, idempotencyKey: string): Promise<{ id: string | null }>;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(email: OutgoingEmail, idempotencyKey: string) {
    const { data, error } = await this.client.emails.send(
      { from: this.from, to: email.to, subject: email.subject, html: email.html, text: email.text },
      { idempotencyKey },
    );
    if (error) throw new Error(`Resend: ${error.message}`);
    return { id: data?.id ?? null };
  }
}

/** Development/test provider: writes each email to `data/logs/emails/` instead of sending it. */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log' as const;
  readonly sent: Array<OutgoingEmail & { file: string }> = [];

  constructor(private readonly dir: string) {}

  async send(email: OutgoingEmail, idempotencyKey: string) {
    await mkdir(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(this.dir, `${stamp}-${idempotencyKey}.html`);
    const header = `<!-- to: ${email.to}\n     subject: ${email.subject} -->\n`;
    await writeFile(file, header + email.html, { mode: 0o600 });
    this.sent.push({ ...email, file });
    return { id: null };
  }
}
