/**
 * The opera (src/sniper/opera.ts): that everyone on the stage and in the boxes can be seen and shot
 * from where the rifle is, and that the aria hides a shot under its one long high note and nowhere
 * else. The song's loudness is read from the rendered files, as the game reads it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { Opera } from "../src/sniper/opera.ts";

const opera = new Opera();
const eye = opera.eye(new THREE.Vector3());
const players = opera.spots.filter((s) => !s.crowd), crowd = opera.spots.filter((s) => s.crowd);
/** the crowd is in two places: the boxes along the walls, and the seats on the floor of the house */
const boxed = crowd.filter((s) => Math.abs(s.x) > 14), seated = crowd.filter((s) => Math.abs(s.x) < 14);

describe("the opera", () => {
  test("the players are on the stage, one of them at the singer's mark; the crowd is in the boxes on both sides and in the seats", () => {
    for (const s of players) expect(opera.floor(s.x, s.z)).toBe(1.6);
    for (const s of boxed) expect(opera.floor(s.x, s.z)).toBe(5.5);
    for (const s of seated) expect(opera.floor(s.x, s.z)).toBe(0);
    expect(players.filter((s) => s.sings).length).toBe(1);
    expect(boxed.some((s) => s.x < 0) && boxed.some((s) => s.x > 0)).toBe(true);
    expect(seated.length).toBeGreaterThanOrEqual(12);
    // somebody sings, and there is something to tell each of the others by
    expect(opera.traits).toContain("sing");
    // room for the most a contract brings, of each
    expect(players.length).toBeGreaterThanOrEqual(opera.people(5).n);
    expect(opera.traits.length).toBeGreaterThanOrEqual(opera.people(5).n);
    expect(crowd.length).toBeGreaterThanOrEqual(opera.crowd(0, false));
    // a crowd, and a smaller one where every head costs
    expect(opera.crowd(0, false)).toBeGreaterThanOrEqual(12);
    expect(opera.crowd(0, true)).toBeLessThan(opera.crowd(0, false));
  });

  test("from the rifle, the head and the chest of everyone are in the clear", () => {
    for (const s of opera.spots) {
      const floor = opera.floor(s.x, s.z);
      // (about where a person's head and chest are, sitting and standing)
      for (const up of s.sit ? [1.3, 0.95] : [1.75, 1.3]) {
        const to = new THREE.Vector3(s.x, floor + up, s.z), dist = to.distanceTo(eye);
        const hit = opera.raycast(eye.clone(), to.sub(eye).normalize());
        expect(hit.t).toBeGreaterThan(dist + 0.2);
      }
    }
  });

  test("the rail of a box and the wall round the stage's opening stop a bullet; every way out is where it should be", () => {
    const at = (x: number, y: number, z: number) => opera.raycast(eye.clone(), new THREE.Vector3(x, y, z).sub(eye).normalize());
    const seat = boxed[0], floor = opera.floor(seat.x, seat.z);
    // at their knees: the rail is in the way
    const knees = at(seat.x, floor + 0.3, seat.z);
    expect(knees.what).toBe("wall");
    expect(knees.t).toBeLessThan(new THREE.Vector3(seat.x, floor + 0.3, seat.z).distanceTo(eye) - 0.3);
    // over the stage's opening: the wall
    expect(at(0, 16, -56).what).toBe("wall");
    expect(at(0, 16, -56).t).toBeLessThan(48);
    // from a seat: along the row to an aisle, and out by the back of the house or the door in the wall
    for (const s of seated) {
      const way = opera.wayOut({ x: s.x, z: s.z });
      expect(way[0].z).toBe(s.z);
      for (const q of way) expect(opera.floor(q.x, q.z)).toBe(0);
      const out = way.at(-1)!;
      expect(out.z > -6 || Math.abs(out.x) > 13).toBe(true);
    }
    // a guest leaves by the back of their own box, a player by the wings
    for (const s of boxed) {
      const door = opera.wayOut({ x: s.x, z: s.z }).at(-1)!;
      expect(opera.floor(door.x, door.z)).toBe(5.5);
      expect(Math.sign(door.x)).toBe(Math.sign(s.x));
      expect(Math.abs(door.z - s.z)).toBeLessThan(2.2);
    }
    for (const s of players) {
      const wing = opera.wayOut({ x: s.x, z: s.z }).at(-1)!;
      expect(opera.floor(wing.x, wing.z)).toBe(1.6);
      expect(Math.abs(wing.x)).toBeGreaterThan(12);
    }
  });

  test("only the aria's long high note is loud enough to hide a shot, and it lasts long enough to take one", () => {
    const dir = "public/shows/sniper/", man = JSON.parse(readFileSync(dir + "manifest.json", "utf8")) as { clips: { id: string; kind: string; wav: string; gain: number }[] };
    const song = man.clips.filter((c) => c.kind === "sing");
    expect(song.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `female-sing-${n}`));
    // each phrase's loudness in steps of 50 ms, at the gain it is played at
    const STEP = 0.05, loud = song.map((c) => {
      const b = readFileSync(dir + c.wav), rate = b.readUInt32LE(24), data = b.indexOf("data") + 8, n = Math.round(STEP * rate), env: number[] = [];
      for (let i = data; i + 2 * n <= b.length; i += 2 * n) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += (b.readInt16LE(i + 2 * k) / 32768) ** 2;
        env.push(Math.sqrt(sum / n) * c.gain);
      }
      return env;
    });
    const top = Math.max(...loud.flat()), need = opera.drown * top;
    const over = loud.map((env) => env.filter((v) => v >= need).length * STEP);
    expect(over[4]).toBeGreaterThan(2.5);
    for (const i of [0, 1, 2, 3, 5]) expect(over[i]).toBe(0);
    // and the phrase before it climbs toward the line, so the note can be seen coming
    expect(Math.max(...loud[3]) / top).toBeGreaterThan(0.6);
  });

  test("the handler has a line for every way a player can be told apart", () => {
    const ids = new Set((JSON.parse(readFileSync("public/shows/sniper/manifest.json", "utf8")) as { clips: { id: string }[] }).clips.map((c) => c.id));
    for (const trait of opera.traits) expect(ids.has(`brief-${trait}`)).toBe(true);
    expect(ids.has(opera.intro)).toBe(true);
  });
});
