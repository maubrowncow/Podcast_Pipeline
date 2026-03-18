import { db } from "@/lib/db";
import { jobLogs } from "@/lib/db/schema";

export function logJob(
  jobId: number,
  message: string,
  level: "info" | "warn" | "error" = "info"
) {
  db.insert(jobLogs)
    .values({ jobId, message, level })
    .run();
  console.log(`[Job #${jobId}] [${level.toUpperCase()}] ${message}`);
}
