/**
 * How a crowd of strangers is told apart: each has a head of hair (of some colour, or none, or a
 * hat over it), clothes of one colour, and perhaps something about them (glasses, a tie, a drink,
 * a phone, a cigar, a bag). No two of a crowd are alike in all three, and the handler picks one
 * out by the fewest of those things that nobody else there shares.
 *
 * Nothing here draws or sounds: it is the dressing and the telling.
 */
import { V } from "../ui/colors.ts";
import type { Trait } from "./place.ts";

/** the colours hair comes in (a crowd on a dark street: none of them dark) */
export const HAIR = { blond: "#ffe39a", red: V.red, white: V.white, pink: V.pink, green: V.green } as const;
/** the colours clothes come in */
export const WEAR = { red: V.red, green: V.green, blue: V.blue, pink: V.pink, white: V.white, orange: V.amber } as const;
/** what someone may have about them ("plain": nothing) */
export const HAS: Trait[] = ["hat", "glasses", "tie", "drink", "phone", "cigar", "bag", "plain"];

export type HairName = keyof typeof HAIR | "bald";
export type WearName = keyof typeof WEAR;
export interface Look {
  /** (under a hat it is not seen, and is "bald") */
  hair: HairName;
  wear: WearName;
  has: Trait;
}

/** how each thing that can be said of someone is said: the handler's clip, and the words on the gauges */
export const SAID: Record<string, { id: string; text: string }> = {
  "head:blond": { id: "look-blond", text: "BLOND HAIR" },
  "head:red": { id: "look-red", text: "RED HAIR" },
  "head:white": { id: "look-white", text: "WHITE HAIR" },
  "head:pink": { id: "look-pink", text: "PINK HAIR" },
  "head:green": { id: "look-green", text: "GREEN HAIR" },
  "head:bald": { id: "look-bald", text: "BALD" },
  "head:hat": { id: "look-hat", text: "WEARING A HAT" },
  "wear:red": { id: "look-in-red", text: "DRESSED IN RED" },
  "wear:green": { id: "look-in-green", text: "DRESSED IN GREEN" },
  "wear:blue": { id: "look-in-blue", text: "DRESSED IN BLUE" },
  "wear:pink": { id: "look-in-pink", text: "DRESSED IN PINK" },
  "wear:white": { id: "look-in-white", text: "DRESSED IN WHITE" },
  "wear:orange": { id: "look-in-orange", text: "DRESSED IN ORANGE" },
  "has:glasses": { id: "look-glasses", text: "WEARING GLASSES" },
  "has:tie": { id: "look-tie", text: "WEARING A TIE" },
  "has:drink": { id: "look-drink", text: "HOLDING A DRINK" },
  "has:phone": { id: "look-phone", text: "ON THE PHONE" },
  "has:cigar": { id: "look-cigar", text: "SMOKING" },
  "has:bag": { id: "look-bag", text: "CARRYING A BAG" },
};

/**
 * What can be said of a look, in the order it is said: the head (its hair, or the hat over it), the
 * clothes, and what they have about them (nothing, if that is nothing: nobody is told to look for
 * someone with no bag).
 */
export function clauses(l: Look): (string | null)[] {
  return [`head:${l.has === "hat" ? "hat" : l.hair}`, `wear:${l.wear}`, l.has === "hat" || l.has === "plain" ? null : `has:${l.has}`];
}

/** n looks, no two the same in everything that can be said of them. */
export function dress(n: number, random: () => number = Math.random): Look[] {
  const hair = Object.keys(HAIR) as HairName[], wear = Object.keys(WEAR) as WearName[], out: Look[] = [], seen = new Set<string>();
  const any = <T>(a: readonly T[]): T => a[Math.floor(random() * a.length)];
  for (let tries = 0; out.length < n && tries < 5000; tries++) {
    // (most people have nothing in their hands; a few have no hair)
    const has = random() < 0.3 ? "plain" : any(HAS.filter((h) => h !== "plain"));
    const l: Look = { hair: has === "hat" || random() < 0.1 ? "bald" : any(hair), wear: any(wear), has };
    const key = clauses(l).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/**
 * The fewest things to say of look i that are true of nobody else in the crowd: which of its
 * clauses (0 the head, 1 the clothes, 2 what they have). Null if nothing picks them out (somebody
 * else has all they have, and something more).
 */
export function tell(looks: Look[], i: number, random: () => number = Math.random): number[] | null {
  const mine = clauses(looks[i]), others = looks.filter((_, j) => j !== i).map(clauses);
  const sayable = [0, 1, 2].filter((k) => mine[k] !== null);
  const subsets = [1, 2, 3].map((size) => [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]].filter((s) => s.length === size && s.every((k) => sayable.includes(k))));
  for (const group of subsets) {
    const good = group.filter((s) => !others.some((o) => s.every((k) => o[k] === mine[k])));
    if (good.length) return good[Math.floor(random() * good.length)];
  }
  return null;
}
