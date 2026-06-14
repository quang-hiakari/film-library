import { eq } from "drizzle-orm";
import {
  canAccessRoll,
  getPrivateGrants,
  type AuthUser,
  type Visibility,
} from "./access-control";
import type { DB } from "./db";
import { rolls as rollsTable } from "./db-schema";
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
  gated?: boolean;
  createdAt?: Date | null;
  showOnHome?: boolean;
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
  const dateMatch = slug.match(/(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3] ?? "01"}`
    : new Date().toISOString().slice(0, 10);
  const title =
    slug
      .replace(/-\d{4}-\d{2}(?:-\d{2})?$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || slug;
  return { title, date };
}

async function listRollSlugs(r2: R2Bucket): Promise<string[]> {
  const listing = await r2.list({ prefix: "rolls/", delimiter: "/" });
  return listing.delimitedPrefixes
    .map((p) => p.replace("rolls/", "").replace(/\/$/, ""))
    .filter(Boolean);
}

async function fetchConfig(r2: R2Bucket, slug: string): Promise<AlbumConfig> {
  try {
    const obj = await r2.get(`rolls/${slug}/_config.json`);
    if (obj) return JSON.parse(await obj.text()) as AlbumConfig;
  } catch {
    // fall through
  }
  return configFromSlug(slug);
}

async function listPhotoFiles(r2: R2Bucket, slug: string): Promise<string[]> {
  const listing = await r2.list({ prefix: `rolls/${slug}/` });
  return listing.objects
    // Depth 3 = rolls/{slug}/{file} — excludes thumbs/ subfolder (depth 4)
    .filter((obj) => obj.key.split("/").length === 3 && !obj.key.endsWith("_config.json"))
    .map((obj) => obj.key.split("/").pop() ?? "")
    .sort();
}

/**
 * Resolve the cover key: admin-chosen DB key takes priority,
 * then cover.jpg in R2, then first photo.
 */
async function resolveCoverKey(
  r2: R2Bucket,
  slug: string,
  photoFilenames: string[],
  dbCoverKey?: string | null,
): Promise<string | null> {
  if (dbCoverKey) return dbCoverKey;
  const head = await r2.head(`rolls/${slug}/cover.jpg`);
  if (head) return `rolls/${slug}/cover.jpg`;
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

  // Single query for all roll rows (visibility + metadata)
  const rollRows = await db.select().from(rollsTable);
  const rollMap = new Map(rollRows.map((r) => [r.slug, r]));

  const privateGrants = user ? await getPrivateGrants(db, user.id) : new Set<string>();
  const isAdmin = user?.role === "admin";

  const albums: Album[] = [];

  for (const slug of slugs) {
    const dbRow = rollMap.get(slug);
    const visibility = (dbRow?.visibility ?? "registered") as Visibility;

    if (!isAdmin) {
      // private: only granted users
      if (visibility === "private" && !privateGrants.has(slug)) continue;
      // registered: show to everyone as gated teaser (removed the skip)
    }

    const [config, photoFilenames] = await Promise.all([
      fetchConfig(env.R2, slug),
      listPhotoFiles(env.R2, slug),
    ]);

    const coverKey = await resolveCoverKey(env.R2, slug, photoFilenames, dbRow?.coverPhotoKey);
    if (!coverKey) continue;

    // DB values override _config.json values when set (conditional spreads avoid undefined with exactOptionalPropertyTypes)
    albums.push({
      ...config,
      slug,
      visibility,
      coverUrl: await createSignedUrl(env, coverKey),
      gated: visibility === "registered" && !user,
      showOnHome: dbRow?.showOnHome ?? false,
      ...(dbRow?.createdAt ? { createdAt: dbRow.createdAt } : {}),
      ...(dbRow?.title?.trim() ? { title: dbRow.title.trim() } : {}),
      ...(dbRow?.description?.trim() ? { description: dbRow.description.trim() } : {}),
      ...(dbRow?.camera ? { camera: dbRow.camera } : {}),
      ...(dbRow?.filmStock ? { filmStock: dbRow.filmStock } : {}),
      ...(dbRow?.frames != null ? { frames: dbRow.frames } : {}),
      ...(dbRow?.date ? { date: `${dbRow.date}-01` } : {}),
    } as Album);
  }

  return albums.sort((a, b) => {
    if (a.createdAt && b.createdAt) return b.createdAt.getTime() - a.createdAt.getTime();
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return b.date.localeCompare(a.date);
  });
}

/** Get a single album with signed photo URLs. Enforces access control. */
export async function getAlbum(
  env: R2Env,
  db: DB,
  user: AuthUser | null,
  slug: string,
): Promise<(Album & { photos: string[]; thumbUrls: string[] }) | null> {
  const rollRows = await db.select().from(rollsTable).where(eq(rollsTable.slug, slug)).limit(1);
  const dbRow = rollRows[0];
  const visibility = (dbRow?.visibility ?? "registered") as Visibility;

  const allowed = await canAccessRoll(db, user, slug, visibility);
  if (!allowed) return null;

  const [config, photoFilenames] = await Promise.all([
    fetchConfig(env.R2, slug),
    listPhotoFiles(env.R2, slug),
  ]);

  const coverKey = await resolveCoverKey(env.R2, slug, photoFilenames, dbRow?.coverPhotoKey);
  if (!coverKey) return null;

  // Exclude cover.jpg from frame list (dedicated cover file, not a shot)
  const frameFilenames = photoFilenames.filter((f) => f !== "cover.jpg");

  // Check which frames have pre-generated thumbnails
  const thumbListing = await env.R2.list({ prefix: `rolls/${slug}/thumbs/` });
  const thumbSet = new Set(
    thumbListing.objects.map((o) => o.key.split("/").pop() ?? "").filter(Boolean),
  );

  const [coverUrl, ...fullAndThumbUrls] = await Promise.all([
    createSignedUrl(env, coverKey),
    // Interleave: full URL then thumb URL per frame
    ...frameFilenames.flatMap((f) => [
      createSignedUrl(env, `rolls/${slug}/${f}`),
      thumbSet.has(f)
        ? createSignedUrl(env, `rolls/${slug}/thumbs/${f}`)
        : createSignedUrl(env, `rolls/${slug}/${f}`), // fallback to full
    ]),
  ]);

  // De-interleave into photos[] and thumbUrls[]
  const photos: string[] = [];
  const thumbUrls: string[] = [];
  for (let i = 0; i < fullAndThumbUrls.length; i += 2) {
    photos.push(fullAndThumbUrls[i]);
    thumbUrls.push(fullAndThumbUrls[i + 1]);
  }

  return {
    ...config,
    slug,
    visibility,
    coverUrl,
    photos,
    thumbUrls,
    ...(dbRow?.title?.trim() ? { title: dbRow.title.trim() } : {}),
    ...(dbRow?.description?.trim() ? { description: dbRow.description.trim() } : {}),
    ...(dbRow?.camera ? { camera: dbRow.camera } : {}),
    ...(dbRow?.filmStock ? { filmStock: dbRow.filmStock } : {}),
    ...(dbRow?.frames != null ? { frames: dbRow.frames } : {}),
    // date stored as YYYY-MM, padded to YYYY-MM-01 for sort/display consistency
    ...(dbRow?.date ? { date: `${dbRow.date}-01` } : {}),
  } as Album & { photos: string[]; thumbUrls: string[] };
}
