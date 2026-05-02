/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  DB: D1Database;
  R2: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}>;

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null | undefined;
} | null;

type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
} | null;

declare namespace App {
  interface Locals extends Runtime {
    user: AuthUser;
    session: AuthSession;
  }
}
