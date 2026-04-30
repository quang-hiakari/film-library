import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------- Better Auth tables ----------
// Schema matches Better Auth's expected shape for the Drizzle adapter.
// `role` is a custom field (user | admin) — first registered user becomes admin.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ---------- Film library tables ----------

/**
 * Rolls — one row per film roll folder in R2.
 * visibility: public (anyone) | registered (logged-in) | private (invited)
 */
export const rolls = sqliteTable("rolls", {
  slug: text("slug").primaryKey(),
  visibility: text("visibility", {
    enum: ["public", "registered", "private"],
  })
    .notNull()
    .default("registered"),
});

/** Grants a specific user access to a private roll. */
export const rollAccess = sqliteTable(
  "roll_access",
  {
    rollSlug: text("roll_slug")
      .notNull()
      .references(() => rolls.slug, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.rollSlug, table.userId] }),
  }),
);

// ---------- Group tables ----------

/** Named user groups (e.g. "Family", "Clients"). */
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Many-to-many: which users belong to which groups. */
export const userGroups = sqliteTable(
  "user_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.groupId] }) }),
);

/** Grants an entire group access to a private roll. */
export const rollGroupAccess = sqliteTable(
  "roll_group_access",
  {
    rollSlug: text("roll_slug")
      .notNull()
      .references(() => rolls.slug, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.rollSlug, t.groupId] }) }),
);

export type User = typeof user.$inferSelect;
export type Roll = typeof rolls.$inferSelect;
export type NewRoll = typeof rolls.$inferInsert;
export type RollAccess = typeof rollAccess.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type UserGroup = typeof userGroups.$inferSelect;
export type RollGroupAccess = typeof rollGroupAccess.$inferSelect;
