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

/** Derive a fallback config from the slug (e.g. "tokyo-2025-03" → title + date). */
function configFromSlug(slug: string): AlbumConfig {
  // Extract trailing YYYY-MM or YYYY-MM-DD from slug
  const dateMatch = slug.match(/(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3] ?? "01"}`
    : new Date().toISOString().slice(0, 10);

  const title = slug
    .replace(/-\d{4}-\d{2}(?:-\d{2})?$/, "") // strip date suffix
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || slug;

  return { title, date };
}

/** List all roll slug folders in the bucket (non-empty slugs only). */
async function listRollSlugs(r2: R2Bucket): Promise<string[]> {
  const listing = await r2.list({ prefix: "rolls/", delimiter: "/" });
  return listing.delimitedPrefixes
    .map((p) => p.replace("rolls/", "").replace(/\/$/, ""))
    .filter(Boolean);
}

/** Fetch _config.json for a roll, or derive from slug if missing. */
async function fetchConfig(r2: R2Bucket, slug: string): Promise<AlbumConfig> {
  try {
    const obj = await r2.get(`rolls/${slug}/_config.json`);
    if (obj) {
      const body = await obj.text();
      return JSON.parse(body) as AlbumConfig;
    }
  } catch {
    // fall through to slug-derived config
  }
  return configFromSlug(slug);
}

/** List all photo filenames in a roll, sorted. Excludes _config.json. */
async function listPhotoFiles(r2: R2Bucket, slug: string): Promise<string[]> {
  const listing = await r2.list({ prefix: `rolls/${slug}/` });
  return listing.objects
    .map((obj) => obj.key.split("/").pop() ?? "")
    .filter((name) => name && name !== "_config.json")
    .sort();
}

/**
 * Determine the cover key for a roll.
 * Uses cover.jpg if it exists, otherwise falls back to the first photo.
 */
async function resolveCoverKey(
  r2: R2Bucket,
  slug: string,
  photoFilenames: string[],
): Promise<string | null> {
  const coverKey = `rolls/${slug}/cover.jpg`;
  const head = await r2.head(coverKey);
  if (head) return coverKey;
  // Fall back to first photo
  if (photoFilenames.length > 0) return `rolls/${slug}/${photoFilenames[0]}`;
  return null;
}

/** Get all albums visible to the current user. */
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

    if (!isAdmin) {
      if (visibility === "registered" && !user) continue;
      if (visibility === "private" && !privateGrants.has(slug)) continue;
    }

    const [config, photoFilenames] = await Promise.all([
      fetchConfig(env.R2, slug),
      listPhotoFiles(env.R2, slug),
    ]);

    const coverKey = await resolveCoverKey(env.R2, slug, photoFilenames);
    if (!coverKey) continue; // skip empty rolls

    albums.push({
      ...config,
      slug,
      visibility,
      coverUrl: await createSignedUrl(env, coverKey),
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

  const [config, photoFilenames] = await Promise.all([
    fetchConfig(env.R2, slug),
    listPhotoFiles(env.R2, slug),
  ]);

  const coverKey = await resolveCoverKey(env.R2, slug, photoFilenames);
  if (!coverKey) return null;

  // Exclude cover.jpg from the photo list (it's a dedicated cover, not a frame)
  const frameFilenames = photoFilenames.filter((f) => f !== "cover.jpg");

  const [coverUrl, ...photos] = await Promise.all([
    createSignedUrl(env, coverKey),
    ...frameFilenames.map((f) => createSignedUrl(env, `rolls/${slug}/${f}`)),
  ]);

  return { ...config, slug, visibility, coverUrl, photos };
}
