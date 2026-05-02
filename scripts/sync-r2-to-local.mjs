/**
 * Sync all objects from remote R2 bucket into wrangler's local R2 state.
 * Run once before `npm run dev:cf` to work with real photo data locally.
 *
 * Usage: node scripts/sync-r2-to-local.mjs
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

// Parse .env file
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

const ACCOUNT_ID = env.R2_ACCOUNT_ID;
const ACCESS_KEY = env.R2_ACCESS_KEY_ID;
const SECRET_KEY = env.R2_SECRET_ACCESS_KEY;
const BUCKET = env.R2_BUCKET_NAME || "film-library";

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing R2 credentials in .env / .dev.vars");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

const TMP = join(tmpdir(), "r2-sync-tmp");
mkdirSync(TMP, { recursive: true });

async function sync() {
  console.log(`Syncing remote R2 bucket "${BUCKET}" → local wrangler state...\n`);

  let token;
  let total = 0;
  let skipped = 0;

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token })
    );

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      process.stdout.write(`  ${key} ... `);

      try {
        const get = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const bytes = await get.Body.transformToByteArray();

        // Use a flat tmp filename (replace / with __ to avoid nested dirs)
        const tmpFile = join(TMP, key.replace(/\//g, "__"));
        writeFileSync(tmpFile, Buffer.from(bytes));

        execSync(
          `npx wrangler r2 object put "${BUCKET}/${key}" --local --file "${tmpFile}"`,
          { cwd: ROOT, stdio: "pipe" }
        );

        console.log(`✓ (${(bytes.length / 1024).toFixed(1)} KB)`);
        total++;
      } catch (err) {
        console.log(`✗ ${err.message}`);
        skipped++;
      }
    }

    token = res.NextContinuationToken;
  } while (token);

  // Clean up tmp files
  rmSync(TMP, { recursive: true, force: true });

  console.log(`\nDone: ${total} synced, ${skipped} failed.`);
  console.log('Now run: npm run dev:cf');
}

sync().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
