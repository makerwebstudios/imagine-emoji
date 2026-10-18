/**
 * Is a typed guess the right movie?
 *
 * Exact string matching rejected obviously-right answers: "the lord of the rings", "spiderman",
 * "et", "fast & furious", "the incredible hulk", one-letter typos on a phone keyboard.
 * Rules, in order: normalise both sides (case, accents, punctuation, "&", a leading the/a/an),
 * compare with and without spaces, accept a puzzle's listed alternatives, then allow a small
 * typo budget that grows with the title's length.
 */
export function normalize(s = "") {
  return s
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

function distance(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function typoBudget(len) {
  if (len >= 12) return 2;
  if (len >= 5) return 1;
  return 0; // "jaws", "et": must be exact
}

export function isCorrect(guess, puzzle) {
  const g = normalize(guess);
  if (!g) return false;
  const targets = [puzzle.answer, puzzle.title, ...(puzzle.also || [])].filter(Boolean).map(normalize);
  return targets.some((t) => {
    if (g === t || g.replace(/ /g, "") === t.replace(/ /g, "")) return true;
    // A different number is a different movie ("rocky 2"), never a typo.
    if ((g.match(/\d+/g) || []).join() !== (t.match(/\d+/g) || []).join()) return false;
    return distance(g.replace(/ /g, ""), t.replace(/ /g, "")) <= typoBudget(t.replace(/ /g, "").length);
  });
}
