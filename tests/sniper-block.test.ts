/**
 * The block (src/sniper/block.ts) and the looks its crowd is told by (src/sniper/looks.ts): that no
 * two of a crowd are alike, that what the handler says of the target is true of nobody else and is
 * something there is a voice for; and that everyone in the square can be seen and shot from the
 * roof, can walk where they are sent, and has a way out that goes through nothing.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { Block } from "../src/sniper/block.ts";
import { HAIR, HAS, SAID, WEAR, clauses, dress, tell, type Look } from "../src/sniper/looks.ts";
import { rng } from "../src/sniper/place.ts";

const block = new Block();
const eye = block.eye(new THREE.Vector3());

describe("a crowd's looks", () => {
  test("twenty people, no two alike in what can be said of them; a hat hides the hair", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const looks = dress(20, rng(seed));
      expect(looks.length).toBe(20);
      expect(new Set(looks.map((l) => clauses(l).join("|"))).size).toBe(20);
      for (const l of looks) if (l.has === "hat") expect(clauses(l)[0]).toBe("head:hat");
    }
  });

  test("what is said of the target is true of nobody else, and nothing shorter would do", () => {
    let told = 0, hard = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const r = rng(seed * 7), looks = dress(20, r);
      looks.forEach((_, i) => {
        const t = tell(looks, i, r);
        if (!t) return;
        told++;
        if (t.length > 1) hard++;
        const mine = clauses(looks[i]), same = (ks: number[]) => looks.filter((o, j) => j !== i && ks.every((k) => clauses(o)[k] === mine[k])).length;
        expect(t.every((k) => mine[k] !== null)).toBe(true);
        expect(same(t)).toBe(0);
        // (drop any one thing, and somebody else answers to it)
        if (t.length > 1) for (const k of t) expect(same(t.filter((q) => q !== k))).toBeGreaterThan(0);
      });
      // in every crowd there is somebody who can be told, and somebody it takes two things to tell
      expect(looks.some((_, i) => tell(looks, i, r))).toBe(true);
    }
    expect(told).toBeGreaterThan(900);
    expect(hard).toBeGreaterThan(told / 2);
  });

  test("there is a line from the handler for everything that can be said", () => {
    const ids = new Set((JSON.parse(readFileSync("public/shows/sniper/manifest.json", "utf8")).clips as { id: string }[]).map((c) => c.id));
    const all: Look[] = [];
    for (const hair of [...Object.keys(HAIR), "bald"] as Look["hair"][]) for (const wear of Object.keys(WEAR) as Look["wear"][]) for (const has of HAS) all.push({ hair, wear, has });
    for (const l of all) for (const c of clauses(l)) if (c) {
      expect(SAID[c]).toBeDefined();
      expect(ids.has(SAID[c].id)).toBe(true);
    }
    for (const id of ["look-target", block.intro]) expect(ids.has(id)).toBe(true);
    // and for the time running out, and for the officers who come when it has
    for (const id of ["hurry", "caught", "cop-hands", "cop-still", "cop-arrest"]) expect(ids.has(id)).toBe(true);
  });
});

describe("the block", () => {
  const inKiosk = (x: number, z: number) => x > -31.7 && x < -27.8 && z > -47.2 && z < -43.3;
  const inFountain = (x: number, z: number) => Math.hypot(x, z + 75) < 2.9;
  /** every step of the way from a to b is on open ground */
  const clear = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    for (let i = 1; i < 40; i++) {
      const x = a.x + ((b.x - a.x) * i) / 40, z = a.z + ((b.z - a.z) * i) / 40;
      if (inKiosk(x, z) || inFountain(x, z)) return false;
    }
    return true;
  };

  test("it is a crowd: twenty, fewer on a phone, and room for all of them, walking or not", () => {
    expect(block.looks).toBe(true);
    // forty seconds, and then they come out of the door of the hut at the head of the stairs, behind the rifle
    expect(block.limit.seconds).toBe(40);
    expect(block.limit.door[1]).toBeGreaterThan(3);
    // (from a roof: one voice at a time, a quiet after it, and none of them near enough to be at full level)
    expect(block.talk.at).toBe(1);
    expect(block.talk.gap).toBeGreaterThan(2);
    for (const s of block.spots) expect(Math.hypot(s.x, 24, s.z)).toBeGreaterThan(block.hear * 2.5);
    expect(block.people(0).n).toBe(20);
    expect(block.people(0, true).n).toBeLessThan(20);
    const open = block.spots.filter((s) => s.open), fixed = block.spots.filter((s) => !s.open);
    expect(block.spots.length).toBeGreaterThanOrEqual(30);
    // (everyone on the phone walks, besides those sent walking)
    expect(open.length).toBeGreaterThanOrEqual(block.people(0).strollers + 5);
    expect(fixed.length).toBeGreaterThanOrEqual(20 - block.people(0).strollers);
  });

  test("from the roof, the head and the chest of everyone are in the clear and inside what the scope can turn to", () => {
    for (const s of block.spots) {
      for (const up of s.sit ? [1.3, 0.95] : [1.75, 1.3]) {
        const to = new THREE.Vector3(s.x, up, s.z), dist = to.distanceTo(eye), d = to.sub(eye).normalize();
        expect(block.raycast(eye.clone(), d).t).toBeGreaterThan(dist + 0.2);
        const yaw = Math.atan2(-d.x, -d.z), pitch = Math.asin(d.y);
        expect(yaw).toBeGreaterThan(block.yaw[0]);
        expect(yaw).toBeLessThan(block.yaw[1]);
        expect(pitch).toBeGreaterThan(block.pitch[0]);
        expect(pitch).toBeLessThan(block.pitch[1]);
      }
    }
  });

  test("a walk between any two open places goes through nothing; so does every way out", () => {
    const open = block.spots.filter((s) => s.open);
    for (const a of open) for (const b of open) expect(clear(a, b)).toBe(true);
    for (const s of block.spots) {
      const way = [{ x: s.x, z: s.z }, ...block.wayOut({ x: s.x, z: s.z })];
      for (let i = 0; i < way.length - 1; i++) expect(clear(way[i], way[i + 1])).toBe(true);
      // and ends out of the square: behind the row
      expect(way[way.length - 1].z).toBeLessThan(-100);
    }
  });

  test("the row, the kiosk and the paving stop a bullet; only what lands in the square is heard", () => {
    const at = (x: number, y: number, z: number) => block.raycast(eye.clone(), new THREE.Vector3(x, y, z).sub(eye).normalize());
    expect(at(0, 10, -88).what).toBe("wall");
    expect(at(-29.5, 1.5, -45).what).toBe("wall");
    expect(at(0, 0, -52).what).toBe("street");
    expect(at(0, 0, -52).heard).toBe(true);
    // down an alley: on, past the row, and nobody the wiser
    expect(at(13, 0, -100).what).toBe("street");
    expect(at(13, 0, -100).heard).toBe(false);
    // the road under the roof is not the square
    expect(at(0, 0, -15).heard).toBe(false);
  });
});
