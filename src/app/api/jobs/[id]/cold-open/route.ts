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
2. **Each quote must stand alone** — no dangling pronouns, no "he said" without knowing who "he" is.
3. **The "hook" field is the pattern interrupt ONLY.** It must NOT be repeated in the quotes array. The hook and every quote must be different passages from the transcript.

## Duration Targets (CRITICAL — do the math)

People speak at approximately 3 words per second. Target **120-150 total words** across the hook + all quotes per variation. This produces 40-50 seconds of content.

Before finalizing, COUNT the words in your hook and all quotes. If the total is under 120 words, you need more or longer quotes. Each variation should have **5-7 quotes** (not counting the hook). Short single-sentence quotes are fine for the hook and open loop, but the arc beats should be SUBSTANTIAL — 20-40+ words each. Pull multi-sentence passages when the speaker is building a thought. Do not truncate a thought into fragments.

Compute totalEstimatedSeconds as: total word count / 3 (rounded). Do not estimate — calculate.

## Hook Layering Structure (every variation must follow this)

- **Beat 1: Pattern Interrupt (hook)** — The single most striking statement. Stop the scroll. Short and punchy: 5-15 words.
- **Beat 2: Promise** — Why this episode is worth the viewer's time. Context, stakes, or a bold claim. 1-2 quotes.
- **Beat 3: Story Arc** — The emotional core. This is where density lives. Follow Kurt Vonnegut's "Man in a Hole" shape (stable → fall → hint at rise) or another shape. 2-4 quotes building a journey with emotional contrast. Pull LONG passages here — this is where the viewer invests.
- **Beat 4: Open Loop** — The last quote MUST be cut mid-thought, mid-revelation, or leave a question unanswered. Zeigarnik Effect — humans fixate on unfinished thoughts.

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
6. Multi-sentence passages where the speaker builds momentum — these create the arc density a cold open needs

## Output Format

Return ONLY a JSON object — no markdown, no prose, no explanation:

{
  "variations": [
    {
      "strategy": "hot_take",
      "strategyLabel": "The Hot Take",
      "storyShape": "man_in_a_hole",
      "hook": "short punchy verbatim quote — pattern interrupt only",
      "quotes": [
        {
          "text": "verbatim quote — pull long multi-sentence passages for arc beats",
          "beat": "promise",
          "emotion": "vulnerability",
          "reason": "one sentence on why this lands here"
        }
      ],
      "openLoop": "Brief description of why the final quote creates unresolved tension",
      "totalWordCount": 135,
      "totalEstimatedSeconds": 45
    }
  ]
}

The "beat" field must be one of: "promise", "arc", "open_loop".
The "emotion" field must be one of: "surprise", "vulnerability", "curiosity", "humor", "controversy", "conviction".
totalWordCount = sum of words in hook + all quote texts. totalEstimatedSeconds = totalWordCount / 3, rounded.`;

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

  // Read optional creative direction from request body
  let direction = "";
  try {
    const body = await req.json();
    if (body.direction && typeof body.direction === "string") {
      direction = body.direction.trim();
    }
  } catch {
    // No body or invalid JSON — fine, direction stays empty
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const userMessage = direction
    ? `Here is the timecoded transcript. Create three cold open variations following the methodology in your instructions.\n\n**Creative direction from the producer:** ${direction}\n\n---TRANSCRIPT---\n${condensedText}`
    : `Here is the timecoded transcript. Create three cold open variations following the methodology in your instructions.\n\n---TRANSCRIPT---\n${condensedText}`;

  let scriptJson: string;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: COLD_OPEN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
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
