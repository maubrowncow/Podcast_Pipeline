import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __db?: BetterSQLite3Database<typeof schema>;
};

function createDb() {
  const dbPath = process.env.DATABASE_PATH || "data/app.db";
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  return drizzle({ client: sqlite, schema });
}

export const db = globalForDb.__db ?? (globalForDb.__db = createDb());
