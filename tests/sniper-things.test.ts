/**
 * The sniper game's loose things (src/sniper/things.ts): the hat, the glasses, the cigar, the glass
 * and the phone as bodies that fall. What they do is not scripted, so this checks what must come
 * out of the step: nothing gains energy, everything ends up lying on the ground, a glass breaks on
 * stone and not on earth, a hat floats.
 */
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { G, Things, thingOf, thrown, type Ground, type Loose, type Shape, type ThingEvent } from "../src/sniper/things.ts";
import type { Trait } from "../src/sniper/place.ts";

const HEAD = 0.0145;
const KINDS: Trait[] = ["hat", "glasses", "cigar", "drink", "phone", "crown", "sword", "skull"];
const shape = (kind: Trait): Shape => thingOf(kind, 1, HEAD)!;
const STONE: Ground = { floor: () => 0, water: () => null, soft: false };
const EARTH: Ground = { floor: () => 0, water: () => null, soft: true };
/** a pool a metre deep, its surface at 0 */
const POOL: Ground = { floor: () => -1, water: () => 0, soft: false };
/** the same numbers every run */
function seeded(seed: number): () => number {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tilted = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.2, 0.7));

/** let one go and run it: what was told of it, and the most its energy ever rose in a step */
function run(kind: Trait, ground: Ground, y: number, v: THREE.Vector3, w: THREE.Vector3, seconds: number) {
  const events: ThingEvent["what"][] = [];
  const things = new Things((e) => events.push(e.what), seeded(7));
  const t: Loose = things.release(shape(kind), v3(0, y, 0), tilted(), v, w);
  let rise = 0, e = things.energy(t);
  for (let i = 0; i < seconds * 240 && !t.gone; i++) {
    things.update(1 / 240, ground);
    const now = things.energy(t);
    rise = Math.max(rise, now - e);
    e = now;
  }
  return { t, events, rise, things };
}

describe("the sniper game's loose things", () => {
  test("every trait but the tie is a thing, with lines to draw and points to land on", () => {
    for (const worn of ["tie", "cape", "sing"] as const) expect(thingOf(worn, 1, HEAD)).toBeNull();
    for (const kind of KINDS) {
      const s = shape(kind);
      expect(s.segs.length).toBe(6 * s.color.length);
      expect(s.pts.length).toBeGreaterThanOrEqual(6);
      expect(s.dry).toBeLessThanOrEqual(s.color.length);
    }
  });

  test("nothing gains energy as it falls, strikes the ground and tumbles", () => {
    for (const kind of KINDS) {
      const { rise } = run(kind, EARTH, 1.7, v3(2.5, 1.5, -1), v3(4, -6, 3), 6);
      // (a step may give back the little height the ground took, and no more)
      expect(rise).toBeLessThan(0.02);
    }
  });

  test("on earth each of them comes to rest lying on the ground, not far from where it left", () => {
    for (const kind of KINDS) {
      const { t, events } = run(kind, EARTH, 1.7, v3(2.5, 1.5, -1), v3(4, -6, 3), 8);
      expect(t.rest).toBe(true);
      expect(t.pos.y).toBeGreaterThan(-0.01);
      expect(t.pos.y).toBeLessThan(0.25);
      expect(Math.hypot(t.pos.x, t.pos.z)).toBeLessThan(6);
      expect(events).toContain("knock");
      expect(events).not.toContain("break");
    }
  });

  test("a glass dropped from the hand breaks on stone, and not if it is set down from a hand's breadth", () => {
    expect(run("drink", STONE, 1.1, v3(), v3(), 3).events).toContain("break");
    const low = run("drink", STONE, 0.12, v3(), v3(), 3);
    expect(low.events).not.toContain("break");
    expect(low.t.rest).toBe(true);
    // nothing else breaks, from any height a person has
    for (const kind of KINDS.filter((k) => k !== "drink")) expect(run(kind, STONE, 2, v3(0, -3, 0), v3(), 6).events).not.toContain("break");
  });

  test("a tipped glass lets its drink go before it lands", () => {
    const { t, events } = run("drink", EARTH, 1.2, v3(1, 2, 0), v3(9, 0, 4), 4);
    expect(events.filter((e) => e === "spill").length).toBe(14);
    expect(t.liquid).toBe(0);
  });

  test("a hat falls slowly: it reaches the speed its drag allows and no more", () => {
    const { t } = run("hat", STONE, 60, v3(), v3(), 5);
    const terminal = Math.sqrt(G / shape("hat").drag);
    expect(-t.v.y).toBeGreaterThan(0.9 * terminal);
    expect(-t.v.y).toBeLessThan(1.02 * terminal);
  });

  test("in a pool a hat and a cigar float at the surface; a phone, a glass and glasses go to the bottom", () => {
    for (const kind of KINDS) {
      const { t, events } = run(kind, POOL, 1.2, v3(1, 0, 0), v3(2, 3, 1), 12);
      expect(events.filter((e) => e === "splash").length).toBe(1);
      expect(events).not.toContain("break");
      if (shape(kind).floats) expect(Math.abs(t.pos.y + 0.03)).toBeLessThan(0.05);
      else expect(t.pos.y).toBeLessThan(-0.75);
    }
  });

  test("on a flight of steps a thing stops; it does not slide away down them", () => {
    // the game's steps: 9 m of rise in 30
    const steps: Ground = { floor: (_x, z) => 0.3 * z, water: () => null, soft: false };
    for (const kind of KINDS.filter((k) => k !== "drink")) {
      const events: ThingEvent["what"][] = [], things = new Things((e) => events.push(e.what), seeded(3));
      const t = things.release(shape(kind), v3(0, 1.7, 0), tilted(), v3(0, 0, -1), v3(3, 1, 2));
      for (let i = 0; i < 10 * 240; i++) things.update(1 / 240, steps);
      expect(t.rest).toBe(true);
      expect(Math.abs(t.pos.z)).toBeLessThan(8);
      expect(t.pos.y - 0.3 * t.pos.z).toBeLessThan(0.25);
    }
  });

  test("a bullet through a thing throws it along its way; one that passes a metre off hardly moves it", () => {
    const d = v3(0, 0, -1), o = v3(0, 1.8, 10), random = seeded(5);
    const near = v3(), far = v3(), w = v3();
    thrown(o, d, v3(0, 1.85, 0), 5, near, w, random);
    thrown(o, d, v3(0, 2.8, 0), 5, far, v3(), random);
    expect(near.length()).toBeGreaterThan(3.5);
    expect(near.length()).toBeLessThanOrEqual(5);
    // along the bullet's way, and out from its line (here: up)
    expect(near.z).toBeLessThan(-2);
    expect(near.y).toBeGreaterThan(1);
    expect(far.length()).toBeLessThan(0.1);
    expect(w.length()).toBeGreaterThan(0);
  });
});
