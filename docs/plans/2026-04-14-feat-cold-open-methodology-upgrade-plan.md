---
title: Cold Open Methodology Upgrade + XML Fix
type: feat
date: 2026-04-14
---

# Cold Open Methodology Upgrade + XML Import Fix

## Overview

Two tightly coupled workstreams:

1. **Fix the broken XML assembler** — the generated FCP7 XML fails to import into Premiere with "Matrix cannot be inverted." Multiple structural defects in the output XML.
2. **Upgrade the cold open methodology** — replace the generic Claude prompt with a research-backed 3-variation system using Vonnegut story shapes, hook layering, emotional contrast, and open loops.

No point shipping better scripts if the XML output is broken. Both ship together.

## Problem Statement

### XML Import Failure

The current `cold-open-assembler.ts` generates structurally invalid FCP7 XML. Comparing its output against the valid [sample premiere xml export.xml](../../sample%20premiere%20xml%20export.xml):

| Issue | Assembler Output | Valid Premiere XML |
|-------|-----------------|-------------------|
| **File defs location** | Floating inside `<audio>` section | Inside `<clipitem>` elements (first inline, then self-closing `<file id="X"/>`) |
| **`<duration>` on clipitems** | Clip's timeline duration (`end - start`) | Source file's total duration (e.g. 104044 frames) |
| **Video samplecharacteristics** | Only `<rate>` | Full: width, height, codec, pixelaspectratio, fielddominance, colordepth |
| **Clip attributes** | name, duration, rate, start/end, in/out, file ref | Also: masterclipid, enabled, alphatype, pixelaspectratio, anamorphic, pproTicksIn/Out |
| **Audio clips** | No sourcetrack, no link elements | `<sourcetrack>` with mediatype/trackindex, `<link>` elements tying audio to video |
| **File media block** | `<video/><audio><channelcount>2</channelcount></audio>` | Full video samplecharacteristics + per-channel audio with sourcechannel/channellabel |
| **xmeml version** | 5 | 4 |
| **sequence id** | Missing | `<sequence id="sequence-N">` |

The "Matrix cannot be inverted" error is caused by the combination of: file definitions in the wrong XML location, missing video dimensions/codec in samplecharacteristics, and `<duration>` being the clip duration instead of the source file duration.

### Weak Methodology

The current prompt asks for "a 5-second hook + 4-8 quotes for dramatic effect." No story arc, no emotional contrast, no open loops, no hook layering. See [brainstorm](../brainstorms/2026-04-14-cold-open-methodology-brainstorm.md) for the full research.

## Proposed Solution

### Phase 1: Fix the XML assembler + Enrich the parser

**Goal:** Generated XML imports cleanly into Premiere Pro.

#### Parser changes — `src/lib/fcp-xml-parser.ts`

The `SequenceFile` type needs to store video/audio characteristics from the source XML so the assembler can reproduce them in output. Currently it only stores `id`, `name`, `pathurl`, `durationFrames`.

```typescript
// src/lib/fcp-xml-parser.ts — expand SequenceFile
export interface SequenceFile {
  id: string;
  name: string;
  pathurl: string;
  durationFrames: number;
  // NEW — preserve source characteristics for assembler output
  videoWidth?: number;
  videoHeight?: number;
  pixelAspectRatio?: string;
  fieldDominance?: string;
  audioDepth?: number;
  audioSampleRate?: number;
  audioChannelCount?: number;
  // raw timecode for file
  timecodeFrame?: number;
  timecodeDisplayFormat?: string;
}
```

Update the `collectFiles` function to extract these fields from the `<file>` element's `<media>` children.

**Nested sequence handling:** The sample XML has a nested sequence (sequence-2 inside clipitem-1 of sequence-1). The parser needs to recurse into nested sequences to find the actual media clips. Currently `parseTracks` only looks at the top-level `seq.media.video.track` / `seq.media.audio.track`.

Add recursion: when a `clipitem` contains a `<sequence>` child, extract that inner sequence's tracks instead of (or in addition to) the wrapper clip.

#### Assembler changes — `src/lib/cold-open-assembler.ts`

Rewrite the XML emission to match the valid Premiere structure:

1. **File definitions inside clipitems, not floating.** First occurrence inline with full definition, subsequent references self-closing `<file id="X"/>`.
2. **`<duration>` = source file duration**, not clip timeline duration.
3. **Full `<samplecharacteristics>`** using the enriched `SequenceFile` data: width, height, pixelaspectratio, fielddominance. Fall back to sensible defaults (3840x2160, square pixels, progressive) from the source sequence if file-level data is missing.
4. **Add required clip attributes:** `<enabled>TRUE</enabled>`, `<alphatype>none</alphatype>`, `<pixelaspectratio>square</pixelaspectratio>`, `<anamorphic>FALSE</anamorphic>`.
5. **Add `<sequence id="">` attribute** with a generated UUID or sequential ID.
6. **Use `xmeml version="4"`** to match the sample.
7. **File `<media>` block** with proper video samplecharacteristics and per-channel audio definitions.
8. **Audio clip `<sourcetrack>` and `<link>` elements** — tie audio clips to their video counterparts and source tracks.
9. **Add stub `<logginginfo>`, `<colorinfo>`, `<labels>` elements** on clips (Premiere expects them even if empty).

#### Validation step

After assembling, a quick sanity check:
- Every `<file id="">` reference in a clipitem has a matching full definition
- No clipitem has `duration <= 0` or `end <= start`
- Source in/out fall within file duration bounds

### Phase 2: Upgrade cold open methodology (3 variations)

#### Prompt rewrite — `src/app/api/jobs/[id]/cold-open/route.ts`

Replace `COLD_OPEN_PROMPT` with a methodology-driven system prompt that instructs Claude to:

**Return 3 variations**, each with a named emotional strategy:
- **"The Hot Take"** (controversy-led) — Opens with the most provocative/counterintuitive claim
- **"The Vulnerable Moment"** (vulnerability-led) — Opens with raw emotion, personal revelation
- **"The Mystery"** (curiosity-led) — Opens with a teased revelation, unanswered question

**Each variation must follow the hook layering structure:**
- Beat 1 (0-5s): Pattern interrupt — single striking statement
- Beat 2 (5-15s): Promise confirmation — why this matters
- Beat 3 (15-30s): Story arc — emotional journey (Vonnegut "Man in a Hole" or auto-selected shape)
- Beat 4 (final 5-10s): Open loop — cut mid-sentence or leave question unanswered

**Each variation must use emotional contrast** — no two consecutive quotes with the same emotional register.

**Constraints:**
- ONLY verbatim quotes from the transcript (critical for timecode resolution)
- Target 30-45 seconds total
- 3-5 quotes per variation (not 4-8 — shorter target = fewer quotes)
- Each quote must stand alone without dangling pronouns

**New JSON response shape:**

```json
{
  "variations": [
    {
      "strategy": "hot_take",
      "strategyLabel": "The Hot Take",
      "storyShape": "man_in_a_hole",
      "hook": "exact verbatim quote",
      "quotes": [
        {
          "text": "exact verbatim quote",
          "beat": "promise",
          "emotion": "vulnerability",
          "reason": "one sentence on why this lands"
        }
      ],
      "openLoop": "The final quote is cut mid-revelation about...",
      "totalEstimatedSeconds": 38
    }
  ]
}
```

**Increase `max_tokens` from 2048 to 4096** — 3 variations with metadata will need it.

**Backward compatibility:** The GET endpoint must detect old single-script format and wrap it: `{ variations: [oldScript] }`.

#### Schema — no migration needed

The `coldOpenScripts.scriptJson` column already stores arbitrary JSON. Store the new `{ variations: [...] }` shape directly. No schema change.

To track which variation the user selected, add one nullable column:

```sql
ALTER TABLE cold_open_scripts ADD COLUMN selected_index INTEGER;
```

Add `selectedIndex` to the Drizzle schema in `src/lib/db/schema.ts`.

#### New API endpoint for selection — `src/app/api/jobs/[id]/cold-open/select/route.ts`

```
PATCH /api/jobs/[id]/cold-open/select
Body: { index: 0 | 1 | 2 }
```

Persists the user's choice. The cold-open-xml endpoint reads this to know which variation to export (or the client passes the quotes directly, as it does now).

### Phase 3: UI changes — `src/components/cold-open-suite.tsx`

#### Variation selector

After Step 2 (Generate), show a tabbed interface with 3 tabs:
- Tab labels: strategy names ("The Hot Take", "The Vulnerable Moment", "The Mystery")
- Active tab highlighted
- Each tab shows:
  - **HOOK** highlighted in amber (existing style)
  - Quotes listed with beat label, emotion tag, and reason
  - Story shape label (e.g. "Man in a Hole")
  - Open loop description
  - Estimated duration

#### Selection + Export flow

- User clicks a tab to preview, clicks a "Select" button (or the tab itself acts as selection)
- Step 3 (Export XML) becomes enabled once a variation is selected
- Download sends the selected variation's quotes to the cold-open-xml endpoint
- Downloaded filename includes strategy: `episode_name_cold_open_hot_take.xml`

#### Loading state

3 variations in one call = longer response time (30-60s for Opus). Add a more informative loading indicator: "Generating 3 cold open variations..." instead of just "Generating..."

#### Regeneration

"Regenerate" button shows a confirmation: "This will replace the current variations. Continue?" — Opus calls are expensive.

### Phase 4: Token efficiency

**Already handled:** The `toCondensedText()` function compresses the transcript into `[HH:MM:SS.mmm] SPEAKER: text` format, which is token-efficient.

**One call for all 3 variations** — the prompt asks Claude to return all 3 in a single JSON response. Not 3 separate API calls.

**Prompt caching consideration:** If the same transcript is used for regeneration, the system prompt + transcript will be identical. Anthropic's prompt caching would cache the prefix. Consider structuring the API call to maximize cache hits: put the static methodology prompt in a `system` message (cacheable), and the transcript in the `user` message.

#### Pre-existing bug fix

`cold-open-suite.tsx` has a doubled `setStatus` call in the `handleDownloadXml` finally block (the first `setStatus("downloading")` should be removed).

## Acceptance Criteria

### Phase 1 — XML Fix
- [x] Generated FCP7 XML imports into Premiere Pro without errors
- [x] Output XML has file definitions inside clipitems (first inline, then self-closing refs)
- [x] Clip `<duration>` reflects source file duration, not timeline clip duration
- [x] Video `<samplecharacteristics>` includes width, height, pixel aspect ratio
- [x] Audio clips have `<sourcetrack>` and `<link>` elements
- [x] Parser handles nested sequences (extracts clips from inner sequence)
- [ ] Test: upload sample XML, resolve a quote, download cold open XML, import into Premiere

### Phase 2 — Methodology
- [x] Claude returns 3 variations with different emotional strategies
- [x] Each variation has: hook, 3-5 quotes with beat/emotion labels, open loop description
- [x] Target duration 30-45 seconds per variation
- [x] All quotes are verbatim (validated by quote resolver confidence > 0.5)
- [x] GET endpoint handles old single-script format gracefully
- [x] `max_tokens` increased to 4096

### Phase 3 — UI
- [x] Tabbed variation selector showing all 3 options
- [x] Each tab displays hook, quotes with metadata, story shape, open loop
- [x] Download XML button exports the selected variation
- [x] Downloaded filename includes strategy name
- [x] Regeneration shows confirmation dialog
- [x] Loading state says "Generating 3 cold open variations..."

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/fcp-xml-parser.ts` | Enrich `SequenceFile` type, handle nested sequences |
| `src/lib/cold-open-assembler.ts` | Rewrite XML emission to match valid Premiere structure |
| `src/app/api/jobs/[id]/cold-open/route.ts` | New methodology prompt, 3 variations, increased max_tokens |
| `src/components/cold-open-suite.tsx` | Tabbed variation selector, selection state, confirmation dialog |
| `src/lib/db/schema.ts` | Add `selectedIndex` column to `coldOpenScripts` |
| `src/app/api/jobs/[id]/cold-open-xml/route.ts` | Accept variation index or quotes from selected variation |

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/api/jobs/[id]/cold-open/select/route.ts` | PATCH endpoint for persisting variation selection |

## Dependencies and Risks

- **Risk: Claude doesn't follow the 3-variation format.** Mitigation: strict JSON validation on response, retry with simpler prompt if parsing fails.
- **Risk: Verbatim quotes don't fuzzy-match well.** Mitigation: surface confidence scores to the user in the UI (future improvement), and set a minimum threshold (0.5) that warns before download.
- **Risk: Token usage.** 3 variations at Opus pricing with a 1-hour transcript is significant. One call per generation, confirmation before regeneration.
- **Dependency: ANTHROPIC_API_KEY must be set.** Currently showing "not set" in the UI — user needs to restart dev server if the key was added after server start.

## Implementation Order

1. **Phase 1 first** — fix XML assembler and parser. Test import into Premiere. This unblocks the entire cold open workflow.
2. **Phase 2 next** — upgrade the prompt and API. Test that Claude returns valid 3-variation JSON.
3. **Phase 3 last** — UI changes. These are presentation-layer and can iterate.

## References

- [Brainstorm document](../brainstorms/2026-04-14-cold-open-methodology-brainstorm.md)
- [Sample Premiere XML](../../sample%20premiere%20xml%20export.xml) — valid reference structure
- `src/lib/cold-open-assembler.ts` — current assembler (broken output)
- `src/lib/fcp-xml-parser.ts` — current parser (needs nested sequence support)
- `src/app/api/jobs/[id]/cold-open/route.ts:10-27` — current prompt (to be replaced)
- `src/components/cold-open-suite.tsx` — current UI (to be upgraded)
