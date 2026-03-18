# Diggnation Show Notes Pipeline: Master Overview

## What This Is

This is a multi-phase LLM agent pipeline that takes a transcript JSON file and sponsor documentation as inputs and produces publish-ready YouTube show notes as output. The pipeline is broken into four phases, each with its own instruction file. An orchestrator runs the phases in sequence, passing structured output from each phase as input to the next.

## Where This Pipeline Picks Up

The transcription service has already done its work before this pipeline runs. By the time we get the JSON file, the following has already happened upstream via Python scripts:

- Audio extraction from the video file
- Speech-to-text transcription (e.g., Whisper)
- Segment-level timestamping
- Word-level confidence scoring
- Laughter, applause, and non-speech audio have been merged or stripped
- Silence gaps have been normalized

The JSON structure we receive looks like this:

```json
{
  "duration_seconds": 4255.51,
  "segments": [
    {
      "start": 48.5,
      "end": 52.6,
      "text": "Hello, everybody, and welcome to Dignation, episode number 28.",
      "words": [
        { "start": 48.5, "end": 48.9, "word": "Hello,", "score": 0.95 }
      ]
    }
  ]
}
```

The `start` field in each segment is our timestamp source. The `text` field is the transcribed speech. Word-level data exists but is primarily useful for the upstream pipeline. Our agent work uses segment-level data.

## Data Size Context

For a typical 70-minute Diggnation episode:

- Raw JSON: ~2MB (mostly word-level data we don't need)
- Compact transcript (timestamps + text): ~83K chars / ~21K tokens
- Text only (no timestamps): ~70K chars / ~18K tokens

This fits comfortably within Opus 4.6's context window in a single pass. For episodes up to ~3 hours, we may need to split into chunks for some phases, but standard Diggnation episodes (60-90 minutes) should process in one shot.

## Model Recommendation

Use **Claude Opus 4.6** for all four phases.

Reasoning:

- Phase 1 (Episode Understanding) requires reading the full transcript and producing a nuanced, tone-aware summary. Opus handles the full ~21K token transcript in context and is strong at inferring emotional register and distinguishing between casual banter and substantive discussion.
- Phase 2 (Sponsor Identification) requires cross-referencing transcript content against sponsor documentation. Opus is reliable at catching discrepancies in URLs, promo codes, and product names across long documents.
- Phase 3 (Chapter Markers) is the most judgment-intensive phase. It requires understanding complete thoughts, identifying natural topic boundaries, and deciding what is substantive enough to warrant a chapter vs. what is a brief tangent. Opus's reasoning at scale is the right tool here.
- Phase 4 (Assembly and QA) requires holding all prior outputs in context while formatting, compressing, and quality-checking. Opus handles this cleanly.

A smaller model like Sonnet could handle Phases 2 and 4 if cost is a concern, but Phases 1 and 3 benefit significantly from Opus's ability to reason over the full transcript at once.

## Pipeline Architecture

```
[Transcript JSON] ──> PHASE 1: Episode Understanding
                         ├── episode_summary.json
                         ├── tone_assessment.json
                         └── entity_extraction.json
                                    │
[Sponsor Docs] ────────> PHASE 2: Sponsor Processing
                         └── sponsors.json
                                    │
[Transcript JSON] ──> PHASE 3: Chapter Markers
(+ Phase 1 output)       └── chapters.json
                                    │
[All Phase Outputs] ──> PHASE 4: Assembly and QA
                         ├── youtube_description.txt (≤5000 chars)
                         ├── pinned_comment.txt
                         └── full_show_notes.json
```

## Phase Instruction Files

Each phase has its own markdown file with complete agent instructions:

1. `phase1_episode_understanding.md` - Read transcript, assess tone, generate SEO summary, extract people and products
2. `phase2_sponsor_processing.md` - Identify sponsor segments, cross-reference documentation, validate URLs/codes/disclaimers
3. `phase3_chapter_markers.md` - Identify topic boundaries, generate timestamped chapters, enforce formatting rules
4. `phase4_assembly_qa.md` - Concatenate all outputs, enforce YouTube constraints, compress description, final QA pass

## Output Destinations

YouTube has a 5,000 character limit on video descriptions. Based on our experience, the sections break down roughly as:

- Section 1 (Description): ~600-800 chars
- Section 2 (Sponsors): ~800-1200 chars depending on sponsor count
- Section 3 (Chapters): ~1500-2000 chars depending on chapter count with line breaks

That puts us at ~3000-4000 chars for the description, leaving some headroom.

Sections 4 (People Mentioned) and 5 (Products Mentioned) should go in:
- A pinned comment on the YouTube video
- And/or a companion page (blog post, Notion page, etc.) linked from the description

## Show-Specific Constants

These are specific to Diggnation and should be treated as configuration:

- Show name: Diggnation
- Platform: Digg (always spelled with two G's: "Digg")
- Hosts: Kevin Rose, Alex Albrecht
- Known production team: Mau, Justin, Forest, Ethan, Jennifer
- Default promo code across sponsors: DIGG (all caps)
- Default tone: Casual, fun, good-natured. Serious tone is the exception and must be detected per-episode.
- Typical episode length: 60-90 minutes
- Content style: Conversational with tangents. Tangents over ~2 minutes that are substantive get their own chapters.