# Cold Open Methodology Upgrade

**Date:** 2026-04-14
**Status:** Ready for planning

## What We're Building

Upgrading the existing cold open generation system with a research-backed creative methodology. The current system asks Claude for "a hook + some quotes" with no structural framework. The upgrade encodes proven YouTube/podcast cold open techniques into the prompt and generation logic.

**The core change:** Replace the generic prompt in `/api/jobs/[id]/cold-open/route.ts` with a methodology-driven system that produces three cold open variations with different emotional strategies.

## Why This Approach

The existing plumbing works: quote-resolver maps text to timecodes, cold-open-assembler builds Premiere FCP7 XML, the 3-step web UI handles the workflow. The weak link is the creative brain — the prompt that decides *which* quotes to select and *how* to arrange them. Research shows specific structural patterns dramatically outperform "pick the best quotes":

- **Man in a Hole** story shape (stable > fall > hint at rise) is the highest-engagement arc across all media
- **Open loops** (unresolved tension) increase watch time by 32%
- **Emotional contrast** between clips prevents viewer habituation
- **30-45 seconds** is the optimal cold open length for long-form podcasts
- **Hook layering** (3s pattern interrupt > 10s promise > 30s arc) mirrors how viewers decide to stay

## Key Decisions

### 1. Interface: Upgrade the web UI
- Modify the existing `/api/jobs/[id]/cold-open` route
- Keep the 3-step flow: upload Premiere XML > generate script > export XML
- No CLI skill needed — the web UI is the interface

### 2. Three variations per generation
- Generate 3 cold opens with different emotional strategies (e.g. controversy-led, vulnerability-led, curiosity-led)
- User previews all three and picks one before exporting XML
- Regenerate available if none land

### 3. Auto-select template
- Claude analyzes the transcript and picks the best structural template:
  - **Single Clip** (15-30s): When one moment dominates
  - **DOAC Montage** (30-45s): Multiple strong beats, rapid-fire
  - **Man in a Hole Arc** (30-40s): Clear transformation narrative
- Different variations may use different templates

### 4. Keep Premiere XML upload
- User exports their timeline from Premiere first
- Assembler conforms clips against the real sequence structure
- Handles multi-track (video + audio) correctly

### 5. Methodology framework

**Hook layering (every cold open):**
- 0-3s: Pattern interrupt — most surprising/controversial single line
- 3-10s: Promise confirmation — why this episode is worth your time
- 10-30s+: Story arc — emotional journey following a Vonnegut shape

**Story shapes to select from:**
- Man in a Hole (stable > fall > rise hint) — default, highest engagement
- Cinderella (low > gifts > setback > triumph) — for rags-to-riches episodes
- From Bad to Worse (bad > worse > worst) — for cautionary/warning content

**Emotional arc requirements:**
- Clips must alternate emotional registers (surprise > vulnerability > curiosity)
- No two consecutive clips with the same emotional tone
- Final beat must be an open loop (cut mid-sentence, unanswered question)

**Clip selection criteria (prioritized):**
1. Counterintuitive claims that contradict common wisdom
2. Specific numbers or stakes (concrete details signal credibility)
3. Incomplete narratives (story begins, payoff comes later)
4. Controversy or bold claims
5. Vulnerability or raw emotion
6. Humor or surprise

## Research Sources

- Diary of a CEO cold open structure (reverse-engineered): 30-45s montage, jaw-dropping quote > backstory tease > rapid questions cut mid-answer
- YouTube retention data: 30-40% of viewers drop in first 30 seconds; below 50% retention at 10-15s = hook failure
- MrBeast production doc: first 60 seconds is "where retention is either won or lost"
- Kurt Vonnegut story shapes validated by 2016 NLP study (arxiv.org/pdf/1606.07772.pdf)
- Zeigarnik Effect: open loops increase watch time by 32% (Retention Rabbit)
- Anti-habituation research (PMC EEG study): mixed emotions increase engagement by mitigating habituation

## Open Questions

- Should the prompt include the Premiere sequence structure so Claude knows what tracks/clips are available? (Probably not — quote resolution handles the mapping after the fact)
- Should we add a "confidence score" to each variation so the user knows which Claude thinks is strongest?
- How to handle episodes where the transcript is genuinely boring (no controversy, no vulnerability, no surprises)?

## Next Step

Run `/workflows:plan` to design the implementation.
