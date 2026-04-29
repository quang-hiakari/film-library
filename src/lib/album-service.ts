import {
  canAccessRoll,
  getPrivateGrants,
  getVisibilityMap,
  type AuthUser,
  type Visibility,
} from "./access-control";
import type { DB } from "./db";
import { createSignedUrl } from "./signed-url-service";

export interface AlbumConfig {
  title: string;
  date: string;
  filmStock?: string;
  camera?: string;
  frames?: number;
  description?: string;
}

export interface Album extends AlbumConfig {
  slug: string;
  visibility: Visibility;
  coverUrl: string;
}

export interface R2Env {
  R2: R2Bucket;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
}

/** List all roll slug folders in the bucket via R2 binding. */
async function listRollSlugs(r2: R2Bucket): Promise<string[]> {
  const listing = await r2.list({ prefix: "rolls/", delimiter: "/" });
  return listing.delimitedPrefixes.map((p) =>
    p.replace("rolls/", "").replace(/\/$/, ""),
  );
}

/** Fetch _config.json for a roll. */
async function fetchConfig(
  r2: R2Bucket,
  slug: string,
): Promise<AlbumConfig | null> {
  try {
    const obj = await r2.get(`rolls/${slug}/_config.json`);
    if (!obj) return null;
    const body = await obj.text();
    return JSON.parse(body) as AlbumConfig;
  } catch {
    console.warn(`Missing or invalid _config.json for roll: ${slug}`);
    return null;
  }
}

/** List photo filenames in a roll (excludes _config.json and cover.jpg). */
export async function listPhotoFiles(
  r2: R2Bucket,
  slug: string,
): Promise<string[]> {
  const listing = await r2.list({ prefix: `rolls/${slug}/` });
  return listing.objects
    .map((obj) => obj.key.split("/").pop() ?? "")
    .filter((name) => name && name !== "_config.json" && name !== "cover.jpg")
    .sort();
}

/**
 * Get all albums visible to the current user.
 * Filters by visibility: public always, registered if logged in, private if granted/admin.
 */
export async function getAllAlbums(
  env: R2Env,
  db: DB,
  user: AuthUser | null,
): Promise<Album[]> {
  const slugs = await listRollSlugs(env.R2);
  const visibilityMap = await getVisibilityMap(db);
  const privateGrants = user ? await getPrivateGrants(db, user.id) : new Set<string>();
  const isAdmin = user?.role === "admin";

  const albums: Album[] = [];

  for (const slug of slugs) {
    const visibility = visibilityMap.get(slug) ?? "registered";

    // Access filter (inline — avoids N db queries)
    if (!isAdmin) {
      if (visibility === "registered" && !user) continue;
      if (visibility === "private" && !privateGrants.has(slug)) continue;
    }

    const config = await fetchConfig(env.R2, slug);
    if (!config) continue;

    albums.push({
      ...config,
      slug,
      visibility,
      coverUrl: await createSignedUrl(env, `rolls/${slug}/cover.jpg`),
    });
  }

  return albums.sort((a, b) => b.date.localeCompare(a.date));
}

/** Get a single album with signed photo URLs. Enforces access control. */
export async function getAlbum(
  env: R2Env,
  db: DB,
  user: AuthUser | null,
  slug: string,
): Promise<(Album & { photos: string[] }) | null> {
  const visibilityMap = await getVisibilityMap(db);
  const visibility = visibilityMap.get(slug) ?? "registered";

  const allowed = await canAccessRoll(db, user, slug, visibility);
  if (!allowed) return null;

  const config = await fetchConfig(env.R2, slug);
  if (!config) return null;

  const filenames = await listPhotoFiles(env.R2, slug);
  const photos = await Promise.all(
    filenames.map((f) => createSignedUrl(env, `rolls/${slug}/${f}`)),
  );

  return {
    ...config,
    slug,
    visibility,
    coverUrl: await createSignedUrl(env, `rolls/${slug}/cover.jpg`),
    photos,
  };
}
