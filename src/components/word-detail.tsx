interface Word {
  word: string;
  start: number;
  end: number;
  score: number;
  speaker?: string;
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 0.5) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function WordDetail({ word }: { word: Word }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${confidenceColor(word.score)}`}
      title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s | confidence: ${(word.score * 100).toFixed(0)}%`}
    >
      {word.word}
    </span>
  );
}
