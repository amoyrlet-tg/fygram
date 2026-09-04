import { transliterate } from "./artists";

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(Math.min(currRow[j - 1] + 1, prevRow[j] + 1, prevRow[j - 1] + cost));
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

function fuzzyMaxDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

export function fuzzyTextMatches(haystackLower: string, queryLower: string): boolean {
  const words = queryLower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystackT = transliterate(haystackLower);
  let haystackWords: string[] | null = null;

  return words.every((word) => {
    if (haystackLower.includes(word)) return true;

    const wordT = transliterate(word);
    if (haystackT.includes(wordT)) return true;

    const maxDist = fuzzyMaxDistance(wordT.length);
    if (maxDist === 0) return false;
    haystackWords ??= haystackT.split(/[^a-z0-9]+/).filter(Boolean);
    return haystackWords.some((hw) => levenshtein(hw, wordT) <= maxDist);
  });
}
