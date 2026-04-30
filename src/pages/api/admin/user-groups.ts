import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../lib/db";
import { user as userTable, userGroups } from "../../../lib/db-schema";

export const prerender = false;

const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
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

  if (body.action === "add" || body.action === "remove") {
    const { userId, groupId } = body;
    if (!userId || !groupId) return bad("userId + groupId required");
    if (body.action === "add") {
      await db.insert(userGroups).values({ userId, groupId }).onConflictDoNothing();
    } else {
      await db
        .delete(userGroups)
        .where(and(eq(userGroups.userId, userId), eq(userGroups.groupId, groupId)));
    }
    return ok();
  }

  if (body.action === "set-role") {
    const { userId, role } = body;
    if (!userId || !["user", "admin"].includes(role)) return bad("Invalid input");
    // Prevent demoting any admin when they are the last one
    if (role === "user") {
      const admins = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.role, "admin"))
        .limit(2);
      if (admins.length <= 1) return bad("Cannot demote last admin", 400);
    }
    await db
      .update(userTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(userTable.id, userId));
    return ok();
  }

  return bad("Invalid action");
};
