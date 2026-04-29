import { and, eq } from "drizzle-orm";
import { rollAccess, rolls } from "./db-schema";
import type { DB } from "./db";

export type Visibility = "public" | "registered" | "private";

export interface AuthUser {
  id: string;
  role?: string;
}

/** Fetch a roll's visibility from D1. Returns "registered" as safe default. */
export async function getRollVisibility(
  db: DB,
  slug: string,
): Promise<Visibility> {
  const row = await db
    .select({ visibility: rolls.visibility })
    .from(rolls)
    .where(eq(rolls.slug, slug))
    .limit(1);
  return (row[0]?.visibility as Visibility) ?? "registered";
}

/**
 * Check whether a user can view a roll.
 * Admins bypass all checks.
 */
export async function canAccessRoll(
  db: DB,
  user: AuthUser | null,
  slug: string,
  visibility: Visibility,
): Promise<boolean> {
  if (user?.role === "admin") return true;
  if (visibility === "public") return true;
  if (!user) return false;
  if (visibility === "registered") return true;

  // private: must have explicit grant in roll_access
  const grant = await db
    .select()
    .from(rollAccess)
    .where(
      and(eq(rollAccess.rollSlug, slug), eq(rollAccess.userId, user.id)),
    )
    .limit(1);
  return grant.length > 0;
}

/** Bulk visibility lookup — returns a map of slug → visibility. */
export async function getVisibilityMap(
  db: DB,
): Promise<Map<string, Visibility>> {
  const rows = await db
    .select({ slug: rolls.slug, visibility: rolls.visibility })
    .from(rolls);
  return new Map(rows.map((r) => [r.slug, r.visibility as Visibility]));
}

/** Bulk access lookup for a single user — returns set of private roll slugs they can see. */
export async function getPrivateGrants(
  db: DB,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ slug: rollAccess.rollSlug })
    .from(rollAccess)
    .where(eq(rollAccess.userId, userId));
  return new Set(rows.map((r) => r.slug));
}
