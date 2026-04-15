import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coldOpenScripts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const body = await req.json();
  const index = body.index;
  if (typeof index !== "number" || index < 0 || index > 2) {
    return NextResponse.json({ error: "index must be 0, 1, or 2" }, { status: 400 });
  }

  // Find the most recent cold open script for this job
  const [latest] = db
    .select()
    .from(coldOpenScripts)
    .where(eq(coldOpenScripts.jobId, jobId))
    .orderBy(desc(coldOpenScripts.id))
    .limit(1)
    .all();

  if (!latest) {
    return NextResponse.json({ error: "No cold open script found" }, { status: 404 });
  }

  db.update(coldOpenScripts)
    .set({ selectedIndex: index })
    .where(eq(coldOpenScripts.id, latest.id))
    .run();

  return NextResponse.json({ success: true, selectedIndex: index });
}
