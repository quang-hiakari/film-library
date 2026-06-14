import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

interface Env {
  R2: R2Bucket;
}

const THUMB_WIDTH = 800;
const THUMB_QUALITY = 75;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(generateMissingThumbs(env));
  },
};

async function generateMissingThumbs(env: Env): Promise<void> {
  const listing = await env.R2.list({ prefix: "rolls/", delimiter: "/" });
  const slugs = (listing.delimitedPrefixes ?? [])
    .map((p: string) => p.replace("rolls/", "").replace(/\/$/, ""))
    .filter(Boolean);

  let generated = 0;
  for (const slug of slugs) {
    generated += await processRoll(env, slug);
  }

  console.log(`Cron complete: ${generated} thumbnails generated.`);
}

async function processRoll(env: Env, slug: string): Promise<number> {
  const [photoListing, thumbListing] = await Promise.all([
    env.R2.list({ prefix: `rolls/${slug}/` }),
    env.R2.list({ prefix: `rolls/${slug}/thumbs/` }),
  ]);

  const photos = photoListing.objects
    .filter((o) => {
      const parts = o.key.split("/");
      // Only direct children (depth 3), exclude _config.json and cover.jpg
      return (
        parts.length === 3 &&
        !o.key.endsWith("_config.json") &&
        !o.key.endsWith("cover.jpg") &&
        /\.(jpg|jpeg)$/i.test(o.key)
      );
    })
    .map((o) => o.key.split("/").pop()!);

  const existingThumbs = new Set(
    thumbListing.objects.map((o) => o.key.split("/").pop() ?? "").filter(Boolean),
  );

  let count = 0;
  for (const filename of photos) {
    if (existingThumbs.has(filename)) continue;
    try {
      await generateThumb(env, slug, filename);
      count++;
    } catch (err) {
      console.error(`Failed thumb for ${slug}/${filename}:`, err);
    }
  }

  return count;
}

async function generateThumb(env: Env, slug: string, filename: string): Promise<void> {
  const obj = await env.R2.get(`rolls/${slug}/${filename}`);
  if (!obj) return;

  const bytes = new Uint8Array(await obj.arrayBuffer());

  const image = PhotonImage.new_from_byteslice(bytes);
  const srcWidth = image.get_width();
  const srcHeight = image.get_height();

  const targetWidth = Math.min(THUMB_WIDTH, srcWidth);
  const targetHeight = Math.round(srcHeight * (targetWidth / srcWidth));

  const resized = resize(image, targetWidth, targetHeight, SamplingFilter.Lanczos3);
  const thumbBytes = resized.get_bytes_jpeg(THUMB_QUALITY);

  image.free();
  resized.free();

  await env.R2.put(`rolls/${slug}/thumbs/${filename}`, thumbBytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  console.log(`Thumb: ${slug}/thumbs/${filename} (${targetWidth}×${targetHeight})`);
}
