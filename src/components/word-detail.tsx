interface Word {
  word: string;
  start: number;
  end: number;
  score: number;
  speaker?: string;
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "bg-accent-green/20";
  if (score >= 0.5) return "bg-accent-yellow/20";
  return "bg-error/20";
}

export function WordDetail({ word }: { word: Word }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] tracking-[0.04em] ${confidenceColor(word.score)}`}
      title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s | confidence: ${(word.score * 100).toFixed(0)}%`}
    >
      {word.word}
    </span>
  );
}
