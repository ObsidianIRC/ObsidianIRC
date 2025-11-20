export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
}

export const fuzzyMatch = (query: string, target: string): FuzzyMatchResult => {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (queryLower === targetLower) {
    return { matches: true, score: 100 };
  }

  if (targetLower.includes(queryLower)) {
    const startIndex = targetLower.indexOf(queryLower);
    const score = 80 - startIndex * 2;
    return { matches: true, score: Math.max(score, 50) };
  }

  let queryIndex = 0;
  let targetIndex = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;
  const matchedIndices: number[] = [];

  while (queryIndex < queryLower.length && targetIndex < targetLower.length) {
    if (queryLower[queryIndex] === targetLower[targetIndex]) {
      matchedIndices.push(targetIndex);
      queryIndex++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    } else {
      consecutiveMatches = 0;
    }
    targetIndex++;
  }

  if (queryIndex !== queryLower.length) {
    return { matches: false, score: 0 };
  }

  const avgPosition =
    matchedIndices.reduce((a, b) => a + b, 0) / matchedIndices.length;
  const positionScore = Math.max(0, 100 - avgPosition * 2);
  const consecutiveScore = (maxConsecutive / queryLower.length) * 50;
  const lengthScore = (queryLower.length / targetLower.length) * 20;

  const score = Math.round(
    positionScore * 0.5 + consecutiveScore * 0.3 + lengthScore * 0.2,
  );

  return { matches: true, score: Math.max(score, 10) };
};
