import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db-schema";

/**
 * Create a Better Auth instance bound to a specific D1 database.
 * Must be called per-request because the D1 binding only exists in `Astro.locals.runtime`.
 */
export function createAuth(d1: D1Database, secret: string, baseURL?: string) {
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
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
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
          input: false, // never set from user input
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // First registered user becomes admin.
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
