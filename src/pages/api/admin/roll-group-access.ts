import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../lib/db";
import { rollGroupAccess } from "../../../lib/db-schema";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const u = locals.user;
  if (!u || u.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const { action, rollSlug, groupId } = body;
  if (!rollSlug || !groupId || !["add", "remove"].includes(action)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb(locals.runtime.env.DB);

  if (action === "add") {
    await db
      .insert(rollGroupAccess)
      .values({ rollSlug, groupId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(rollGroupAccess)
      .where(
        and(
          eq(rollGroupAccess.rollSlug, rollSlug),
          eq(rollGroupAccess.groupId, groupId),
        ),
      );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
