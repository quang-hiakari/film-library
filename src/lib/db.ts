import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db-schema";

/** Wrap a D1Database binding in a typed Drizzle client. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof getDb>;
