export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Shared, email-client-safe layout: tables and inline styles only. */
function layout(opts: { shopName: string; preheader: string; body: string }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(opts.shopName)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="padding:0 8px 16px;font-size:15px;font-weight:600;color:#059669;">${escape(opts.shopName)}</td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">${opts.body}</td></tr>
      <tr><td style="padding:16px 8px;font-size:12px;line-height:18px;color:#71717a;">You're receiving this because of activity on your ${escape(opts.shopName)} admin account.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:#059669;">
<a href="${escape(href)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(label)}</a>
</td></tr></table>`;
}

export function passwordResetEmail(data: {
  shopName: string;
  name: string;
  url: string;
  expiresMinutes: number;
}): RenderedEmail {
  const body = `
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px;">Reset your password</h1>
<p style="margin:0;font-size:15px;line-height:24px;color:#3f3f46;">Hi ${escape(data.name)}, we received a request to reset the password for your admin account.</p>
${button(data.url, 'Choose a new password')}
<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#52525b;">This link expires in ${data.expiresMinutes} minutes and can only be used once.</p>
<p style="margin:0;font-size:14px;line-height:22px;color:#52525b;">If you didn't ask for this, you can ignore this email. Your password won't change.</p>`;
  return {
    subject: `Reset your ${data.shopName} admin password`,
    html: layout({
      shopName: data.shopName,
      preheader: 'Use this link to choose a new password.',
      body,
    }),
    text: `Hi ${data.name},\n\nReset your ${data.shopName} admin password here (expires in ${data.expiresMinutes} minutes):\n${data.url}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function passwordChangedEmail(data: {
  shopName: string;
  name: string;
  when: string;
}): RenderedEmail {
  const body = `
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px;">Your password was changed</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#3f3f46;">Hi ${escape(data.name)}, the password for your admin account was changed on ${escape(data.when)}. All other devices have been signed out.</p>
<p style="margin:0;font-size:14px;line-height:22px;color:#52525b;">If this wasn't you, reset your password immediately and check your server access.</p>`;
  return {
    subject: `Your ${data.shopName} admin password was changed`,
    html: layout({ shopName: data.shopName, preheader: 'Your admin password was changed.', body }),
    text: `Hi ${data.name},\n\nThe password for your ${data.shopName} admin account was changed on ${data.when}. If this wasn't you, reset it immediately.`,
  };
}

export const templates = {
  'password-reset': passwordResetEmail,
  'password-changed': passwordChangedEmail,
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
