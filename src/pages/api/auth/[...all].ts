import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";

export const prerender = false;

const handler: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const auth = createAuth(
    env.DB,
    env.BETTER_AUTH_SECRET,
    env.BETTER_AUTH_URL,
    env.RESEND_API_KEY,
    env.RESEND_FROM_EMAIL,
  );
  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
