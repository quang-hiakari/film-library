import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db-schema";
import { buildVerificationEmail, sendEmail } from "./email-service";

/**
 * Create a Better Auth instance bound to a specific D1 database.
 * Must be called per-request because the D1 binding only exists in `Astro.locals.runtime`.
 */
export function createAuth(
  d1: D1Database,
  secret: string,
  baseURL?: string,
  resendApiKey?: string,
  resendFromEmail?: string,
) {
  const db = getDb(d1);
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret,
    baseURL,
    trustedOrigins: [
      "http://localhost:8788",
      "http://localhost:3000",
      "http://127.0.0.1:8788",
      ...(baseURL ? [baseURL] : []),
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      minPasswordLength: 8,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24h
      sendVerificationEmail: async ({ user, url }) => {
        if (!resendApiKey || !resendFromEmail) {
          console.error("[auth] verification email skipped — Resend not configured");
          return;
        }
        const { subject, html, text } = buildVerificationEmail(user.name, url);
        try {
          await sendEmail(resendApiKey, resendFromEmail, { to: user.email, subject, html, text });
        } catch (err) {
          console.error("[auth] verification email failed", err);
        }
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userData) => {
            const existing = await db
              .select({ count: sql<number>`count(*)` })
              .from(schema.user);
            const isFirst = (existing[0]?.count ?? 0) === 0;
            return {
              data: { ...userData, role: isFirst ? "admin" : "user" },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
