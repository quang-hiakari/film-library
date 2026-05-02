import type { APIRoute } from "astro";

export const prerender = false;

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const secret = locals.runtime?.env?.TURNSTILE_SECRET_KEY;
  if (!secret) return json({ ok: false, error: "captcha_misconfigured" }, 500);

  let body: { token?: string };
  try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const token = body.token?.trim();
  if (!token) return json({ ok: false, error: "missing_token" }, 400);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: clientAddress }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return json({ ok: false, error: "verify_request_failed" }, 502);
  const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
  if (!data.success) return json({ ok: false, error: "captcha_failed", codes: data["error-codes"] ?? [] }, 400);

  return json({ ok: true });
};
