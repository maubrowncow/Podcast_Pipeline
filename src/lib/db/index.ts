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

  // FTS5 virtual table for full-text search over transcript segments
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments_fts
    USING fts5(text, content=transcript_segments, content_rowid=id);

    CREATE TRIGGER IF NOT EXISTS transcript_segments_ai
    AFTER INSERT ON transcript_segments BEGIN
      INSERT INTO transcript_segments_fts(rowid, text) VALUES (new.id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS transcript_segments_ad
    AFTER DELETE ON transcript_segments BEGIN
      INSERT INTO transcript_segments_fts(transcript_segments_fts, rowid, text)
      VALUES ('delete', old.id, old.text);
    END;
  `);

  return drizzle({ client: sqlite, schema });
}

export const db = globalForDb.__db ?? (globalForDb.__db = createDb());
