import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull().default("pending"),
    originalFilename: text("original_filename").notNull(),
    filePath: text("file_path").notNull(),
    whisperModel: text("whisper_model").notNull().default("small"),
    transcriptPath: text("transcript_path"),
    error: text("error"),
    language: text("language"),
    durationSeconds: real("duration_seconds"),
    processingSeconds: real("processing_seconds"),
    fileSizeBytes: integer("file_size_bytes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [index("idx_jobs_status").on(table.status)]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export const jobLogs = sqliteTable(
  "job_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_job_logs_job_id").on(table.jobId)]
);

export type JobLog = typeof jobLogs.$inferSelect;
