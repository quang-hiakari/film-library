import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible client for Cloudflare R2.
 * ONLY used by `scripts/upload-rolls.mjs` (local Node upload script).
 * At runtime on Cloudflare Pages, use the R2 binding from `Astro.locals.runtime.env.R2`.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${import.meta.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: import.meta.env.R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKET = import.meta.env.R2_BUCKET_NAME;
