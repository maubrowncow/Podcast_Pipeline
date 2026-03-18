import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jobLogs } from "@/lib/db/schema";
import { and, eq, gt, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return new Response("Invalid job ID", { status: 400 });
  }

  const afterParam = req.nextUrl.searchParams.get("after");
  const afterId = afterParam ? parseInt(afterParam, 10) : 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let lastId = afterId;
      let closed = false;

      const poll = () => {
        if (closed) return;

        try {
          const conditions = [eq(jobLogs.jobId, jobId)];
          if (lastId > 0) {
            conditions.push(gt(jobLogs.id, lastId));
          }

          const logs = db
            .select()
            .from(jobLogs)
            .where(and(...conditions))
            .orderBy(asc(jobLogs.id))
            .all();

          for (const log of logs) {
            const data = JSON.stringify({
              id: log.id,
              level: log.level,
              message: log.message,
              createdAt: log.createdAt,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            lastId = log.id;
          }
        } catch {
          // DB might be busy, skip this poll
        }
      };

      // Send existing logs immediately
      poll();

      // Then poll for new ones
      const interval = setInterval(poll, 1000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
