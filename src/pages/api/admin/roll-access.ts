import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { rollAccess, user as userTable } from "../../../lib/db-schema";
import { and, eq } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const currentUser = locals.user;
  if (!currentUser || currentUser.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { rollSlug, userEmail, action } = await request.json();
  if (!rollSlug || !userEmail || !["add", "remove"].includes(action)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
  }

  const db = getDb(locals.runtime.env.DB);

  // Look up user by email
  const found = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, userEmail))
    .limit(1);

  if (found.length === 0) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  const userId = found[0].id;

  if (action === "add") {
    await db
      .insert(rollAccess)
      .values({ rollSlug, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(rollAccess)
      .where(and(eq(rollAccess.rollSlug, rollSlug), eq(rollAccess.userId, userId)));
  }

  return new Response(JSON.stringify({ ok: true }));
};
