/**
 * Upload film rolls from a local directory to Cloudflare R2.
 *
 * Expected local structure:
 *   /path/to/rolls/
 *     Roll-Name-1/
 *       photo1.jpg
 *       photo2.jpg
 *     Roll-Name-2/
 *       ...
 *
 * What it does:
 *   1. Reads each subfolder as a roll
 *   2. Slugifies the folder name
 *   3. Uses the first image as cover.jpg
 *   4. Generates _config.json with title + date (from file mtime)
 *   5. Uploads everything to R2 under rolls/{slug}/
 *
 * Usage:
 *   node scripts/upload-rolls.mjs /path/to/your/rolls
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { config } from "dotenv";

config({ path: new URL("../.env", import.meta.url).pathname });

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME;

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"]);

/** Convert folder name to URL-safe slug */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Get MIME type from extension */
function mimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
  };
  return map[ext] || "application/octet-stream";
}

/** Upload a single file to R2 */
async function upload(key, body, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function main() {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error("Usage: node scripts/upload-rolls.mjs /path/to/rolls");
    process.exit(1);
  }

  const folders = readdirSync(sourceDir).filter((f) =>
    statSync(join(sourceDir, f)).isDirectory()
  );

  if (folders.length === 0) {
    console.error("No subfolders found in", sourceDir);
    process.exit(1);
  }

  console.log(`Found ${folders.length} roll(s) to upload.\n`);

  for (const folder of folders) {
    const slug = slugify(folder);
    const folderPath = join(sourceDir, folder);
    const files = readdirSync(folderPath)
      .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
      .sort();

    if (files.length === 0) {
      console.log(`  Skipping "${folder}" — no images found`);
      continue;
    }

    console.log(`Uploading "${folder}" → rolls/${slug}/ (${files.length} photos)`);

    // Upload cover (first image)
    const coverFile = files[0];
    const coverBody = readFileSync(join(folderPath, coverFile));
    await upload(`rolls/${slug}/cover.jpg`, coverBody, "image/jpeg");
    console.log(`  ✓ cover.jpg`);

    // Upload all photos with zero-padded names
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const paddedName = `${String(i + 1).padStart(2, "0")}${extname(filename)}`;
      const body = readFileSync(join(folderPath, filename));
      await upload(`rolls/${slug}/${paddedName}`, body, mimeType(filename));
      console.log(`  ✓ ${paddedName} (${filename})`);
    }

    // Generate and upload _config.json
    const folderStat = statSync(folderPath);
    const dateStr = folderStat.mtime.toISOString().split("T")[0];
    const rollConfig = {
      title: folder,
      date: dateStr,
      frames: files.length,
      private: false,
    };
    await upload(
      `rolls/${slug}/_config.json`,
      JSON.stringify(rollConfig, null, 2),
      "application/json"
    );
    console.log(`  ✓ _config.json`);
    console.log();
  }

  console.log("Done! All rolls uploaded to R2.");
}

main().catch((err) => {
  console.error("Upload failed:", err.message);
  process.exit(1);
});
