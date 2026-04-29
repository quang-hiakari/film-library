import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { rolls } from "../../../lib/db-schema";
import { eq } from "drizzle-orm";

export const prerender = false;

const VALID_VISIBILITY = ["public", "registered", "private"];

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { slug, visibility } = await request.json();
  if (!slug || !VALID_VISIBILITY.includes(visibility)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
  }

  const db = getDb(locals.runtime.env.DB);

  await db
    .insert(rolls)
    .values({ slug, visibility })
    .onConflictDoUpdate({ target: rolls.slug, set: { visibility } });

  return new Response(JSON.stringify({ ok: true }));
};
