import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../lib/db";
import { user as userTable } from "../../../lib/db-schema";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ locals, request }) => {
  const me = locals.user;
  if (!me || me.role !== "admin") return json({ error: "Forbidden" }, 403);

  let body: { userId?: string; active?: boolean };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const userId = body.userId?.trim();
  if (!userId) return json({ error: "userId required" }, 400);

  const active = body.active ?? true; // default true for backwards compat

  if (active === false && userId === me.id) {
    return json({ error: "Cannot deactivate yourself" }, 400);
  }

  const db = getDb(locals.runtime.env.DB);
  await db
    .update(userTable)
    .set({ emailVerified: active, updatedAt: new Date() })
    .where(eq(userTable.id, userId));

  return json({ ok: true, active });
};
