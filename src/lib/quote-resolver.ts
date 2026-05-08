/**
 * Resolves a quote string (from Claude cold-open script) to word-level
 * timecodes in the ElevenLabs transcript JSON.
 *
 * Strategy:
 *  1. Normalise both the quote and the word stream (lowercase, strip punctuation).
 *  2. For each position in the transcript, count how many consecutive quote
 *     words match sequentially (allowing small gaps for filler words like
 *     "like", "you know", "um").
 *  3. Pick the position with the longest sequential run, then extend the
 *     window to cover the full quote length.
 *  4. Return {startMs, endMs} from the first/last word in the best window.
 */

import fs from "node:fs";
import type { ElevenLabsResult, ElevenLabsWord } from "./elevenlabs-client";

export interface ResolvedQuote {
  quote: string;
  startMs: number;
  endMs: number;
  matchedText: string;
  confidence: number; // 0–1
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .map(t => t.replace(/^'+|'+$/g, "")); // strip leading/trailing apostrophes
}

/**
 * Sequential matching score: starting at transcript position `start`,
 * walk through the quote tokens in order. For each quote token, allow
 * up to `maxSkip` transcript words to be skipped (filler words the
 * speaker inserted that aren't in the written quote). Returns the
 * count of matched quote tokens and the transcript index of the last
 * matched word.
 */
function sequentialMatch(
  quoteTokens: string[],
  transcriptTokens: string[],
  start: number,
  maxSkip = 6
): { matched: number; endIndex: number } {
  let tIdx = start;
  let matched = 0;
  let lastMatchIdx = start;

  for (let qIdx = 0; qIdx < quoteTokens.length; qIdx++) {
    const target = quoteTokens[qIdx];
    let found = false;

    // Look ahead up to maxSkip words in the transcript for the next quote word
    for (let skip = 0; skip <= maxSkip && tIdx + skip < transcriptTokens.length; skip++) {
      if (transcriptTokens[tIdx + skip] === target) {
        lastMatchIdx = tIdx + skip;
        tIdx = tIdx + skip + 1;
        matched++;
        found = true;
        break;
      }
    }

    if (!found) {
      // Allow the quote to have words the speaker didn't say (minor
      // paraphrasing by Claude). Skip this quote token and try the next
      // one without advancing the transcript cursor.
      continue;
    }
  }

  return { matched, endIndex: lastMatchIdx };
}

export function resolveQuote(
  quoteText: string,
  words: ElevenLabsWord[]
): ResolvedQuote {
  const quoteTokens = tokenize(quoteText);
  const qLen = quoteTokens.length;

  // Only look at actual words (skip audio_event entries)
  const wordTokens = words.filter(w => w.type === "word");
  const normalizedTranscript = wordTokens.map(w =>
    normalize(w.text).replace(/^'+|'+$/g, "")
  );

  let bestMatched = 0;
  let bestStart = 0;
  let bestEnd = 0;

  // Try starting at each position in the transcript
  for (let i = 0; i <= normalizedTranscript.length - Math.floor(qLen * 0.5); i++) {
    // Quick check: does the first quote word appear near this position?
    // (avoids running full sequential match from every position)
    let hasAnchor = false;
    for (let k = 0; k < Math.min(5, normalizedTranscript.length - i); k++) {
      if (normalizedTranscript[i + k] === quoteTokens[0]) {
        hasAnchor = true;
        break;
      }
    }
    if (!hasAnchor) continue;

    const { matched, endIndex } = sequentialMatch(
      quoteTokens,
      normalizedTranscript,
      i
    );

    if (matched > bestMatched) {
      bestMatched = matched;
      bestStart = i;
      bestEnd = endIndex;
    }
  }

  const confidence = qLen > 0 ? bestMatched / qLen : 0;

  const startWord = wordTokens[bestStart];
  const endWord = wordTokens[bestEnd];
  const matchedText = wordTokens
    .slice(bestStart, bestEnd + 1)
    .map(w => w.text)
    .join(" ");

  return {
    quote: quoteText,
    startMs: Math.round(startWord.start * 1000),
    endMs: Math.round(endWord.end * 1000),
    matchedText,
    confidence,
  };
}

export function resolveQuotesFromTranscriptFile(
  transcriptPath: string,
  quotes: string[]
): ResolvedQuote[] {
  const raw = JSON.parse(
    fs.readFileSync(transcriptPath, "utf-8")
  ) as ElevenLabsResult;

  return quotes.map(q => resolveQuote(q, raw.words));
}
