import { and, eq } from "drizzle-orm";
import { rollAccess, rollGroupAccess, rolls, userGroups } from "./db-schema";
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
 * Private rolls: allow via direct grant OR group membership grant.
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

  // private — direct user grant
  const direct = await db
    .select({ rollSlug: rollAccess.rollSlug })
    .from(rollAccess)
    .where(and(eq(rollAccess.rollSlug, slug), eq(rollAccess.userId, user.id)))
    .limit(1);
  if (direct.length > 0) return true;

  // private — via group membership
  const viaGroup = await db
    .select({ rollSlug: rollGroupAccess.rollSlug })
    .from(rollGroupAccess)
    .innerJoin(userGroups, eq(userGroups.groupId, rollGroupAccess.groupId))
    .where(
      and(
        eq(rollGroupAccess.rollSlug, slug),
        eq(userGroups.userId, user.id),
      ),
    )
    .limit(1);
  return viaGroup.length > 0;
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

/**
 * Bulk access lookup for a single user.
 * Returns set of private roll slugs visible to the user
 * via direct grant OR group membership.
 */
export async function getPrivateGrants(
  db: DB,
  userId: string,
): Promise<Set<string>> {
  const [direct, viaGroup] = await Promise.all([
    db
      .select({ slug: rollAccess.rollSlug })
      .from(rollAccess)
      .where(eq(rollAccess.userId, userId)),
    db
      .select({ slug: rollGroupAccess.rollSlug })
      .from(rollGroupAccess)
      .innerJoin(userGroups, eq(userGroups.groupId, rollGroupAccess.groupId))
      .where(eq(userGroups.userId, userId)),
  ]);
  return new Set([
    ...direct.map((r) => r.slug),
    ...viaGroup.map((r) => r.slug),
  ]);
}
