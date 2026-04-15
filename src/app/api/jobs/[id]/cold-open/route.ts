import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jobs, transcriptSegments, coldOpenScripts } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { toCondensedText } from "@/lib/transcript-condenser";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const COLD_OPEN_SYSTEM_PROMPT = `You are an expert video editor and showrunner who creates viral YouTube cold opens for long-form interview podcasts.

You will receive a timecoded transcript. Your job: craft THREE cold open variations, each using a different emotional strategy but all following proven retention methodology.

## Core Rules

1. **ONLY use VERBATIM quotes** from the transcript — word for word, no paraphrasing. This is critical because these quotes will be fuzzy-matched back to timecodes for automated editing.
2. **Target 30-45 seconds total** per variation (3-5 quotes each).
3. **Each quote must stand alone** — no dangling pronouns, no "he said" without knowing who "he" is.

## Hook Layering Structure (every variation must follow this)

- **Beat 1 (0-5 seconds): Pattern Interrupt** — The single most striking statement. Stop the scroll. This is the 3-second hook that determines if the viewer stays.
- **Beat 2 (5-15 seconds): Promise Confirmation** — Why this episode is worth the viewer's time. Context, stakes, or a bold claim.
- **Beat 3 (15-30+ seconds): Story Arc** — An emotional journey following Kurt Vonnegut's "Man in a Hole" shape (stable → fall → hint at rise) or another appropriate shape. Build tension.
- **Beat 4 (final beat): Open Loop** — The last quote MUST be cut mid-thought, mid-revelation, or leave a question unanswered. This unresolved tension bridges the viewer into the main episode. The Zeigarnik Effect — humans fixate on unfinished thoughts.

## Emotional Contrast Rule

No two consecutive quotes should have the same emotional register. Alternate between: surprise, vulnerability, curiosity, humor, controversy, conviction. Flat emotional tone causes viewer habituation — the "wallpaper effect."

## Three Strategies

### Variation 1: "The Hot Take" (controversy-led)
Open with the most provocative, counterintuitive, or polarizing statement. The kind of quote that makes someone stop scrolling and think "wait, what?" Follow with context that deepens the controversy, then an emotional turn.

### Variation 2: "The Vulnerable Moment" (vulnerability-led)
Open with raw honesty, personal revelation, or emotional exposure. The moment the guest drops their guard. Follow with stakes (what was at risk), then a surprising turn.

### Variation 3: "The Mystery" (curiosity-led)
Open with a teased revelation or incomplete story — something that creates immediate "I need to know more." Follow with escalating hints, then cut before the payoff.

## Clip Selection Criteria (prioritized)

1. Counterintuitive claims that contradict common wisdom
2. Specific numbers, dates, or stakes (concrete details signal credibility)
3. Incomplete narratives where the payoff comes later
4. Raw vulnerability or emotional admission
5. Humor or unexpected lightness after tension

## Output Format

Return ONLY a JSON object — no markdown, no prose, no explanation:

{
  "variations": [
    {
      "strategy": "hot_take",
      "strategyLabel": "The Hot Take",
      "storyShape": "man_in_a_hole",
      "hook": "exact verbatim quote from transcript",
      "quotes": [
        {
          "text": "exact verbatim quote",
          "beat": "promise",
          "emotion": "vulnerability",
          "reason": "one sentence on why this lands here"
        }
      ],
      "openLoop": "Brief description of why the final quote creates unresolved tension",
      "totalEstimatedSeconds": 38
    }
  ]
}

The "beat" field must be one of: "promise", "arc", "open_loop".
The "emotion" field must be one of: "surprise", "vulnerability", "curiosity", "humor", "controversy", "conviction".`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const [job] = db.select().from(jobs).where(eq(jobs.id, jobId)).all();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed") {
    return NextResponse.json({ error: "Transcript not ready" }, { status: 400 });
  }

  // Load condensed segments (manageable token count)
  const segments = db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.jobId, jobId))
    .orderBy(asc(transcriptSegments.segmentIndex))
    .all();

  if (segments.length === 0) {
    return NextResponse.json(
      { error: "No segments indexed — upload transcript first" },
      { status: 400 }
    );
  }

  const condensedText = toCondensedText(segments);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  let scriptJson: string;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: COLD_OPEN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the timecoded transcript. Create three cold open variations following the methodology in your instructions.\n\n---TRANSCRIPT---\n${condensedText}`,
        },
      ],
    });

    const block = message.content.find(b => b.type === "text");
    if (!block || block.type !== "text") {
      return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
    }
    scriptJson = block.text.trim();

    // Strip markdown code fences if model wrapped it
    scriptJson = scriptJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // Validate it parses and has the expected shape
    const parsed = JSON.parse(scriptJson);
    if (!parsed.variations || !Array.isArray(parsed.variations)) {
      throw new Error("Response missing 'variations' array");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Claude call failed: ${msg}` }, { status: 500 });
  }

  // Persist the script
  db.insert(coldOpenScripts).values({
    jobId,
    scriptJson,
    createdAt: new Date(),
  }).run();

  return NextResponse.json({ script: JSON.parse(scriptJson) });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);

  // Return most recent script for this job
  const rows = db
    .select()
    .from(coldOpenScripts)
    .where(eq(coldOpenScripts.jobId, jobId))
    .all();

  if (rows.length === 0) return NextResponse.json({ script: null });

  const latest = rows[rows.length - 1];
  const parsed = JSON.parse(latest.scriptJson);

  // Backward compatibility: wrap old single-script format in variations array
  if (!parsed.variations) {
    return NextResponse.json({
      script: {
        variations: [{
          strategy: "classic",
          strategyLabel: "Classic",
          storyShape: "unknown",
          hook: parsed.hook,
          quotes: (parsed.quotes ?? []).map((q: { text: string; reason: string }) => ({
            ...q,
            beat: "arc",
            emotion: "unknown",
          })),
          openLoop: "",
          totalEstimatedSeconds: parsed.totalEstimatedSeconds ?? 45,
        }],
      },
      selectedIndex: latest.selectedIndex,
    });
  }

  return NextResponse.json({
    script: parsed,
    selectedIndex: latest.selectedIndex,
  });
}
