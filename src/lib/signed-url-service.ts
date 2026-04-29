import { AwsClient } from "aws4fetch";

/**
 * Generate a presigned URL for an R2 object using aws4fetch.
 * aws4fetch is ~4KB — avoids bundling @aws-sdk/* on Cloudflare Workers.
 */
export async function createSignedUrl(
  env: {
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
  },
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", expiresIn.toString());

  const signed = await client.sign(url, {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}
