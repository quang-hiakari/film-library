import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { rolls } from "../../../lib/db-schema";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const env = locals.runtime.env;
  const db = getDb(env.DB);

  // List all roll folders in R2
  const listing = await env.R2.list({ prefix: "rolls/", delimiter: "/" });
  const r2Slugs = listing.delimitedPrefixes.map((p: string) =>
    p.replace("rolls/", "").replace(/\/$/, ""),
  );

  // Upsert each — existing rows keep their visibility, new ones get "registered"
  let added = 0;
  for (const slug of r2Slugs) {
    const result = await db
      .insert(rolls)
      .values({ slug, visibility: "registered" })
      .onConflictDoNothing();
    if (result.meta?.changes && result.meta.changes > 0) added++;
  }

  return new Response(JSON.stringify({ ok: true, added, total: r2Slugs.length }));
};
