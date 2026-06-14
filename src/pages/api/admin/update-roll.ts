import type { APIRoute } from "astro";
import { ne } from "drizzle-orm";
import { getDb } from "../../../lib/db";
import { rolls } from "../../../lib/db-schema";

export const prerender = false;

const VALID_VISIBILITY = ["public", "registered", "private"];

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: {
    slug?: string;
    visibility?: string;
    title?: string | null;
    description?: string | null;
    coverPhotoKey?: string | null;
    camera?: string | null;
    filmStock?: string | null;
    frames?: number | null;
    date?: string | null;
    showOnHome?: boolean;
  };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { slug } = body;
  if (!slug) return new Response(JSON.stringify({ error: "slug required" }), { status: 400 });
  if (body.visibility && !VALID_VISIBILITY.includes(body.visibility)) {
    return new Response(JSON.stringify({ error: "Invalid visibility" }), { status: 400 });
  }
  if (body.coverPhotoKey) {
    const k = body.coverPhotoKey;
    if (!k.startsWith(`rolls/${slug}/`) || k.includes("..") || !/\.(jpe?g|png|webp)$/i.test(k)) {
      return new Response(JSON.stringify({ error: "Invalid coverPhotoKey" }), { status: 400 });
    }
  }

  const set: Record<string, unknown> = {};
  if (body.visibility !== undefined) set.visibility = body.visibility;
  if (body.title !== undefined) set.title = body.title || null;
  if (body.description !== undefined) set.description = body.description || null;
  if (body.coverPhotoKey !== undefined) set.coverPhotoKey = body.coverPhotoKey;
  if (body.camera !== undefined) set.camera = body.camera || null;
  if (body.filmStock !== undefined) set.filmStock = body.filmStock || null;
  if (body.frames !== undefined) set.frames = body.frames ?? null;
  if (body.date !== undefined) set.date = body.date || null;
  if (body.showOnHome !== undefined) set.showOnHome = body.showOnHome;

  if (Object.keys(set).length === 0) {
    return new Response(JSON.stringify({ error: "no fields to update" }), { status: 400 });
  }

  const db = getDb(locals.runtime.env.DB);

  // Only one roll can be featured at a time
  if (body.showOnHome === true) {
    await db.update(rolls).set({ showOnHome: false }).where(ne(rolls.slug, slug));
  }

  await db
    .insert(rolls)
    .values({ slug, visibility: (body.visibility as "public" | "registered" | "private") ?? "registered", ...set })
    .onConflictDoUpdate({ target: rolls.slug, set });

  return new Response(JSON.stringify({ ok: true }));
};
