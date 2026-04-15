import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull().default("pending"),
    originalFilename: text("original_filename").notNull(),
    filePath: text("file_path").notNull(),
    whisperModel: text("whisper_model").notNull().default("small"),
    numSpeakers: integer("num_speakers"),
    transcriptPath: text("transcript_path"),
    transcriptTextPath: text("transcript_text_path"),
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

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id").notNull(),
    speaker: text("speaker"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    segmentIndex: integer("segment_index").notNull(),
  },
  (table) => [index("idx_transcript_segments_job_id").on(table.jobId)]
);

export type TranscriptSegment = typeof transcriptSegments.$inferSelect;

// Parsed Premiere FCP7 XML — stored as JSON blob (SequenceModel)
export const premiereSequences = sqliteTable("premiere_sequences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().unique(),
  sequenceName: text("sequence_name").notNull(),
  timebase: integer("timebase").notNull(),
  ntsc: integer("ntsc", { mode: "boolean" }).notNull().default(false),
  startTimecodeFrame: integer("start_timecode_frame").notNull().default(0),
  durationFrames: integer("duration_frames").notNull(),
  modelJson: text("model_json").notNull(), // full SequenceModel as JSON
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type PremiereSequence = typeof premiereSequences.$inferSelect;

// Cold open scripts — Opus output + resolved timecodes
export const coldOpenScripts = sqliteTable("cold_open_scripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  scriptJson: text("script_json").notNull(), // ColdOpenScript as JSON
  selectedIndex: integer("selected_index"), // which variation the user picked (0-2)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ColdOpenScript = typeof coldOpenScripts.$inferSelect;
