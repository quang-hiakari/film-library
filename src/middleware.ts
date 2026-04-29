import { defineMiddleware } from "astro:middleware";
import { createAuth } from "./lib/auth";

/**
 * Attach session + user to Astro.locals on every request.
 * Protected routes are enforced inside each page (simpler than a middleware allowlist).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;

  if (env?.DB && env.BETTER_AUTH_SECRET) {
    try {
      const auth = createAuth(
        env.DB,
        env.BETTER_AUTH_SECRET,
        env.BETTER_AUTH_URL,
      );
      const session = await auth.api.getSession({
        headers: context.request.headers,
      });
      context.locals.user = session?.user ?? null;
      context.locals.session = session?.session ?? null;
    } catch (err) {
      console.warn("auth middleware error:", err);
      context.locals.user = null;
      context.locals.session = null;
    }
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }

  return next();
});
