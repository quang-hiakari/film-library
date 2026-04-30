import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../lib/db";
import { groups } from "../../../lib/db-schema";

export const prerender = false;

const ok = (data: object = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { "Content-Type": "application/json" },
  });
const bad = (error: string, status = 400) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ locals, request }) => {
  const u = locals.user;
  if (!u || u.role !== "admin") return bad("Forbidden", 403);

  let body: any;
  try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const db = getDb(locals.runtime.env.DB);

  if (body.action === "create") {
    const name = (body.name ?? "").trim();
    if (!name) return bad("Name required");
    const id = crypto.randomUUID();
    try {
      await db.insert(groups).values({ id, name, createdAt: new Date() });
    } catch {
      return bad("Name already exists", 409);
    }
    return ok({ id, name });
  }

  if (body.action === "delete") {
    if (!body.id) return bad("id required");
    await db.delete(groups).where(eq(groups.id, body.id));
    return ok();
  }

  return bad("Invalid action");
};
