---
name: episode-marketing
description: Generate YouTube titles, thumbnail text, show notes with timestamps, Substack newsletter posts, and subtitles for podcast episodes. Use this skill whenever the user asks to create marketing copy, titles, descriptions, show notes, or newsletter content for a podcast episode. Also use when the user mentions promoting an episode, writing a YouTube description, creating a thumbnail, drafting a newsletter, preparing an episode for publishing, episode launch prep, or YouTube metadata. Triggers on phrases like "write titles for this episode", "create show notes", "newsletter post", "YouTube description", "thumbnail text", "promote this episode", "publish this episode", or "episode launch".
---

# Episode Marketing Copy

Generate publication-ready marketing copy for podcast episodes across YouTube and Substack. All copy follows the Diary of a CEO (DOAC) methodology and anti-wallpaper principles.

## Core Principle: Anti-Wallpaper

Steven Bartlett's concept of "wallpaper" describes language the brain has habituated to and automatically tunes out. Terms like "game-changer," "revolutionary," "you won't believe," "here's why," and "the truth about" have been used so many times that audiences are neurologically blind to them. The brain's habituation filter exists to conserve attention - it treats familiar patterns as safe to ignore.

Three things slow habituation and break through the filter:
- **Specificity** - "A personal injury lawyer won the global Claude Code hackathon" vs. "A surprising person built amazing AI software"
- **Incongruity** - Two familiar things colliding in an unexpected way: "The 4-day work week is coming like Ozempic"
- **Threat/fear** - The brain prioritizes survival-relevant information: "99% of people don't see it"

When evaluating any line of copy, ask: "Has the audience seen this phrasing a thousand times?" If the answer is even "maybe," rewrite it.

## Inputs

Before generating any copy, gather these:

1. **Transcript** - Read the episode transcript (check `data/transcripts/` for `.txt` and `.json` files). The `.txt` file gives you the content. The `.json` file gives you word-level timestamps for chapter markers.
2. **Guest info** - Full name, title, company. Ask if not provided.
3. **Voice** - All copy is written in first person from the host's perspective unless told otherwise.

## Workflow

When the user asks for "episode marketing" or "all the copy" without specifying a type, work through the outputs in order (title first, since the thumbnail and newsletter depend on it). Present each one for feedback before moving to the next - don't dump all five at once, because the title choice influences everything downstream.

If the user asks for a specific type, generate only that one.

---

### 1. YouTube Title

**Formula:** "Lead-in credential" + "Direct quote or magazine-style headline"

The lead-in establishes why the viewer should care about the speaker. The quote or headline creates an open loop - an unresolved tension the viewer needs to click to resolve. Together they answer two questions in under 70 characters: "Why should I trust this person?" and "What did they say that I need to hear?"

**Guidance:**
- Aim for 50-70 characters. YouTube truncates titles around 60 characters on desktop and 50 on mobile, so the hook needs to land in the first 50 characters even if the rest gets cut off.
- Frame the guest with universal authority rather than niche company names. "AI's Top Investor" means something to everyone; "a16z General Partner" means something to VCs. The audience for a YouTube video is broad - someone's mom might see this in their feed. Descriptive framing ("The Man Who Funds AI's Biggest Companies") outperforms insider shorthand ("Andreessen Horowitz Partner") every time.
- The strongest quotes from the transcript are usually not the ones that sound the smartest - they're the ones that make you stop and say "wait, what?" Look for surprising claims, specific numbers, emotional confessions, and unexpected analogies.

**Process:**
1. Read the full transcript
2. Identify the 5-8 strongest moments: surprising claims, specific numbers, emotional stories, provocative quotes, unexpected analogies
3. For each moment, draft a title using the formula
4. Check character count on every title
5. Present 6-8 options ranked by strength
6. Explain why the top picks work

**Examples:**

Strong: `AI's Top Investor: "1% Have Seen God. 99% Are Oblivious"` (57 chars)
- Why: Universal authority framing + visceral quote with specific numbers that creates an us-vs-them tension

Strong: `The Solo Founder With $5M ARR: "I Code 16 Hours a Day Alone"` (60 chars)
- Why: Specific credential ($5M ARR) + quote that's both impressive and slightly alarming

Weak: `Shocking Truth About AI That Will Change Everything`
- Why: Pure wallpaper. Every word has been used a million times in this exact configuration.

Weak: `a16z Partner Reveals the Future of Consumer Tech`
- Why: Niche name + "reveals" and "the future of" are habituated phrases.

---

### 2. Thumbnail Text

The thumbnail and title are seen together in the YouTube feed but serve different roles. The title provides context and searchability. The thumbnail stops the scroll. Together they form a system - if they say the same thing, one is wasted. If they contradict or complement each other, they create a curiosity gap that demands a click.

**Guidance:**
- Keep it to 6 words or fewer. Thumbnails display small, especially on mobile. Long text becomes illegible and cluttered.
- The text needs to communicate a complete idea on its own. Someone scrolling YouTube sees the thumbnail before their eye moves to the title. If the thumbnail text is a fragment ("THE 1% CLUB") or requires the title to make sense, it fails as a scroll-stopper. It should land as a complete sentence or statement.
- Look for a complementary angle. If the title quotes the guest, the thumbnail might address the viewer directly. If the title names a statistic, the thumbnail might name the emotion. The two should feel like they're telling different parts of the same story.

**Process:**
1. Write the YouTube title first - the thumbnail depends on it
2. Identify what emotional or informational gap the title leaves open
3. Write thumbnail text that fills a different gap or adds a new dimension
4. Test: read the thumbnail text alone, with no other context. Does it communicate a complete idea? If not, rewrite.
5. Test: read the thumbnail text next to the title. Do they say the same thing? If yes, rewrite.

**Examples:**

Strong pair:
- Title: `AI's Top Investor: "1% Have Seen God. 99% Are Oblivious"`
- Thumbnail: `99% OF PEOPLE DON'T SEE IT`
- Why: "Don't see it" mirrors "Seen God" (seeing vs. not seeing) without repeating. Complete sentence on its own. Directly challenges the viewer.

Strong pair:
- Title: `The Solo Founder With $5M ARR: "I Code 16 Hours a Day Alone"`
- Thumbnail: `NO EMPLOYEES. NO INVESTORS.`
- Why: Adds new information (no team, no funding) that deepens the intrigue of the title. Complete thought. Two punchy statements.

Weak pair:
- Title: `AI's Top Investor: "1% Have Seen God. 99% Are Oblivious"`
- Thumbnail: `THE 1% CLUB`
- Why: Fragment. Means nothing without the title. Someone scrolling past this with no context would have no idea what it's about.

---

### 3. YouTube Show Notes

YouTube shows the first ~160 characters of the description before the "Show more" fold. This above-the-fold text is the most important part of the description - it's what appears in search results and recommendations. Everything below the fold is still valuable for SEO and viewer navigation, but fewer people see it.

**Structure (in this order):**

```
[Above-the-fold hook - first 160 characters. Core tension of the episode + primary keyword.]

[Episode summary - 100-200 words. First person. Natural keyword placement. Name the 4-6 most compelling topics with enough specificity to intrigue. Use hyphens, not m-dashes.]

[Timestamps - pulled from the .json transcript file]

[Guest social links - one per person]
```

**Timestamps:**

Timestamps serve two purposes: they help viewers navigate long episodes, and they rank as Google "Key Moments" - individual segments that appear as separate search results. This means chapter titles should read like search queries real people would actually type.

- First timestamp is always `0:00`
- Typically 12-18 chapters for a long-form episode (minimum 3 for YouTube to recognize them)
- Chapter titles are specific claims or questions, never generic labels
  - Good: `Why I'll never look at code again` - someone might search this
  - Bad: `Coding discussion` - nobody searches this

**Timestamp process:**
1. Read the `.json` transcript file
2. For each chapter topic, grep for the key phrase to find the segment's `start` time in seconds
3. Convert seconds to timestamp format. YouTube is strict about this - wrong formatting breaks chapters entirely:
   - Episodes under 1 hour: use `M:SS` (e.g. `0:00`, `14:47`, `52:40`)
   - Episodes over 1 hour: use `H:MM:SS` (e.g. `0:00:00`, `1:14:47`). Every timestamp in the description must use this format once any timestamp crosses 60 minutes - you can't mix `M:SS` and `H:MM:SS` in the same description.
4. Check the last segment's start time first to determine which format the entire description needs
5. Verify timestamps are in ascending order

Skip hashtags, resource link sections, and multiple CTAs - they add clutter without meaningful engagement lift.

---

### 4. Substack Newsletter Post

The newsletter exists to drive listens/views, not to summarize the episode. It should tease enough to create interest without satisfying it. Think movie trailer, not Wikipedia summary.

**Guidance:**
- 100-200 words total. This is a teaser, not a recap. The long version of what we discussed was the mistake - the short, punchy version that leaves you wanting more is the goal.
- First person throughout.
- Bold title at the top (reuse the YouTube title or a variation).
- The guest intro should combine their credential with a personal connection if one exists ("We worked together at Google years ago"). This establishes both authority and relationship in one breath.
- The topic summary paragraph is the core of the newsletter. List 4-6 specific topics with enough detail to hook but not enough to satisfy. One funny or personal moment from the episode works well here - it signals the conversation was real, not scripted.

**Tone:** Conversational, enthusiastic but not breathless. Write like you're texting a smart friend about a conversation you just had that got you fired up.

**Structure:**
```
**[Title]**

New episode just dropped.

I sat down with [Guest Name], [credential]. [1-2 sentences of personal context or why this person matters.]

We got into all of it: [specific topic], [specific topic], [specific topic with a detail that hooks], and [specific topic]. [Optional: one funny/personal moment from the episode.]

Whether you're [audience A] or [audience B], this one's for you.

Listen or watch the full episode [here].
```

---

### 5. Substack Subtitle

The subtitle sits directly below the title on Substack. A good subtitle does double duty: it tells you who the guest is (context) and what you'll learn (reason to click). A subtitle that only provides context ("A conversation with John Smith") wastes the space. A subtitle that only teases content ("The shocking truth about AI") is wallpaper.

The strongest subtitles name the guest, then tease 2-3 specific topics that create curiosity through their combination.

**Examples:**

Strong: `Anish Acharya on the AI divide, the death of SaaS, and the Ozempic theory of the 4-day work week`
- Context (who) + reason to click (three specific, intriguing topics). The juxtaposition of Ozempic and the 4-day work week is unexpected enough to break through habituation.

Strong: `Ben Cera on building a $5M company with zero employees, 16-hour coding days, and why SaaS founders should be terrified`
- Specific number + specific detail + emotional hook.

Weak: `A conversation with Anish Acharya, Partner at Andreessen Horowitz`
- Context only. No reason to click. No information about what's discussed.

---

## Audience Framing

The audience for this content is anyone interested in the topics discussed - not just industry insiders. Tech jargon, company names, and insider references act as gatekeepers that exclude curious people who would otherwise engage. Translate insider shorthand into descriptive language that communicates the same authority without requiring prior knowledge.

| Niche framing | Broad framing |
|---|---|
| a16z General Partner | AI's Top Investor |
| YC-backed founder | Solo founder |
| Series A round | First round of funding |
| PMF | product-market fit |

This isn't about dumbing things down. "AI's Top Investor" communicates more authority to a general audience than "a16z General Partner" does, because the audience actually understands what it means.

## Iteration

When the user pushes back on any copy, don't start from scratch. Diagnose what specifically isn't working:

- **"Too long"** - Trim to the constraint. Check character counts.
- **"Too niche"** - The framing uses insider language. Broaden to descriptive authority.
- **"Doesn't hook me"** - The moment chosen from the transcript isn't the strongest one. Go back and find a more surprising, specific, or emotionally charged moment.
- **"Out of context"** - The copy isn't communicating a complete thought on its own. It relies on information the reader doesn't have yet. Rewrite so it stands alone.
- **"Wallpaper"** - The language is habituated. The audience has seen this phrasing too many times. Find unsaturated words and unexpected framings.

Ask clarifying questions when feedback is ambiguous rather than guessing at what the user means.
