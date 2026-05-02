const RESEND_URL = "https://api.resend.com/emails";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(apiKey: string, from: string, args: SendEmailArgs): Promise<void> {
  if (!apiKey || !from) {
    console.error("[email] missing RESEND_API_KEY or RESEND_FROM_EMAIL");
    throw new Error("email_misconfigured");
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[email] Resend failed", res.status, err);
    throw new Error("email_send_failed");
  }
}

export function buildVerificationEmail(name: string, url: string) {
  const safeName = escapeHtml(name || "there");
  const safeUrl = escapeHtml(url);
  return {
    subject: "Verify your Film Library account",
    text: `Hi ${safeName},\n\nVerify your email:\n${url}\n\nExpires in 24 hours.\n\n— Film Library`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="font-weight:400;margin:0 0 16px">Verify your account</h2>
      <p>Hi ${safeName},</p>
      <p>Click the button below to activate your Film Library account.</p>
      <p style="margin:28px 0">
        <a href="${safeUrl}" style="display:inline-block;background:#C9A96E;color:#0d0d0d;padding:10px 18px;text-decoration:none;border-radius:2px;letter-spacing:.04em">Verify email</a>
      </p>
      <p style="font-size:12px;color:#666">Or paste this link:<br/><span style="word-break:break-all">${safeUrl}</span></p>
      <p style="font-size:12px;color:#999;margin-top:24px">Expires in 24 hours. If you didn't sign up, ignore this email.</p>
    </div>`,
  };
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
