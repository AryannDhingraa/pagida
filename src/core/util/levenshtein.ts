/**
 * Damerau-Levenshtein edit distance with an early exit.
 *
 * Used to catch typosquats: `paypa1.com` is one substitution away from
 * `paypal.com`, `gogole.com` is one transposition away from `google.com`.
 * The transposition case is why we use Damerau rather than plain Levenshtein —
 * swapped adjacent letters are one of the most common typosquat forms.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two rolling rows plus the row before them (needed for transpositions).
  let prevPrev: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2]! + 1); // transposition
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Every remaining path can only get longer, so we can stop early.
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = curr;
    curr = new Array(b.length + 1).fill(0);
  }
  return prev[b.length]!;
}
