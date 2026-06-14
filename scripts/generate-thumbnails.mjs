/**
 * Generate thumbnails for all rolls in R2.
 * Thumbnails are stored at rolls/{slug}/thumbs/{filename} (800px wide, 75% JPEG).
 * Re-run safe — skips photos that already have a thumbnail.
 *
 * Usage:
 *   node scripts/generate-thumbnails.mjs           # all rolls
 *   node scripts/generate-thumbnails.mjs <slug>    # one roll
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

function loadEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf-8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#") && l.trim())
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(join(ROOT, ".env")), ...loadEnv(join(ROOT, ".dev.vars")) };

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET_NAME;
const THUMB_WIDTH = 800;
const THUMB_QUALITY = 75;

async function listRollSlugs() {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "rolls/", Delimiter: "/" }));
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix.replace("rolls/", "").replace(/\/$/, ""))
    .filter(Boolean);
}

async function listPhotos(slug) {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `rolls/${slug}/` }));
  return (res.Contents ?? [])
    .filter((o) => {
      const parts = o.Key.split("/");
      return parts.length === 3 && /\.(jpg|jpeg)$/i.test(o.Key) && !o.Key.endsWith("cover.jpg");
    })
    .map((o) => o.Key.split("/").pop());
}

async function thumbExists(slug, filename) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `rolls/${slug}/thumbs/${filename}` }));
    return true;
  } catch {
    return false;
  }
}

async function processRoll(slug) {
  console.log(`\n📁 ${slug}`);
  const photos = await listPhotos(slug);
  if (!photos.length) { console.log("  No photos."); return; }

  for (const filename of photos) {
    if (await thumbExists(slug, filename)) {
      console.log(`  - ${filename} (skip)`);
      continue;
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `rolls/${slug}/${filename}` }));
    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const original = Buffer.concat(chunks);

    const thumb = await sharp(original)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, progressive: true })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `rolls/${slug}/thumbs/${filename}`,
      Body: thumb,
      ContentType: "image/jpeg",
    }));

    const saved = Math.round((1 - thumb.length / original.length) * 100);
    console.log(`  ✓ ${filename} — ${Math.round(original.length / 1024)}KB → ${Math.round(thumb.length / 1024)}KB (−${saved}%)`);
  }
}

const targetSlug = process.argv[2];
if (targetSlug) {
  await processRoll(targetSlug);
} else {
  const slugs = await listRollSlugs();
  console.log(`Found ${slugs.length} rolls.`);
  for (const slug of slugs) await processRoll(slug);
}

console.log("\nDone.");
