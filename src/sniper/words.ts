/**
 * How a person's sound is written at their mouth: the syllable they are on, its vowel drawn out
 * the longer it is held ("AGH", "AAAAGH"). A word that is not one of these cries is written as it is.
 */

/** each cry as what comes before its vowel, the vowel (a letter, and how many to start with), and what follows */
const SPELL: Record<string, [string, string, number, string]> = {
  oh: ["", "O", 1, "H"],
  ah: ["", "A", 1, "H"],
  uh: ["", "U", 1, "H"],
  ugh: ["", "U", 1, "GH"],
  oof: ["", "O", 2, "F"],
  agh: ["", "A", 1, "GH"],
  huh: ["H", "U", 1, "H"],
};
/** the vowel gains a letter for each of these it is held (s), up to MOST more */
const PER_LETTER = 0.24, MOST = 6;

/** A sound as written after being held for `held` seconds. */
export function spell(word: string, held: number): string {
  const s = SPELL[word];
  if (!s) return word.toUpperCase();
  const more = Math.max(0, Math.min(MOST, Math.floor(held / PER_LETTER)));
  return s[0] + s[1].repeat(s[2] + more) + s[3];
}
