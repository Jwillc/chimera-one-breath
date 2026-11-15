/**
 * Going home (src/sniper/ending.ts): that the eyes stay inside the corridor and the room, going
 * from one to the other only by the door; that the picture comes out of the dark and goes back
 * into it, with the eyes shut where the view changes; and that there is a voice, with a mouth's
 * movements, for what is said at the end.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { Ending, HOME } from "../src/sniper/ending.ts";

const home = new Ending();
const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 2000);
const at = (t: number) => {
  home.camera(cam, t);
  return cam.position.clone();
};

describe("going home", () => {
  test("the eyes are in the corridor, then through their own door, then in the room, and never in a wall", () => {
    let entered = 0;
    for (let t = 0; t < HOME; t += 0.05) {
      const p = at(t);
      const corridor = Math.abs(p.x) < 0.9 && p.z < 3 && p.z > -14, doorway = p.x >= 0.9 && p.x <= 1.0 && p.z > -7.95 && p.z < -7.05;
      const room = p.x > 1.0 && p.x < 5.8 && p.z > -10.6 && p.z < -5.2;
      expect(corridor || doorway || room).toBe(true);
      expect(p.y).toBeGreaterThan(0.6);
      expect(p.y).toBeLessThan(2.5);
      if (room && !entered) entered = t;
    }
    // down the corridor first, and in before the rifle is laid on the table
    expect(entered).toBeGreaterThan(8);
    expect(entered).toBeLessThan(11);
    // they do not walk through the table or the bed's far wall on the way
    for (let t = 9; t < 22; t += 0.05) expect(at(t).x).toBeLessThan(4.6);
  });

  test("it comes out of the dark and goes back into it; the eyes shut once, on the pillow", () => {
    expect(home.shade(0).dark).toBe(1);
    expect(home.shade(3).dark).toBe(0);
    expect(home.shade(HOME).dark).toBe(1);
    const shut = [];
    for (let t = 0; t < HOME; t += 0.01) if (home.shade(t).lids > 0.98) shut.push(t);
    expect(shut.length).toBeGreaterThan(0);
    expect(shut[0]).toBeGreaterThan(23);
    expect(shut[shut.length - 1] - shut[0]).toBeLessThan(0.3);
    // at that moment the eyes are low, on the bed, looking up
    home.camera(cam, shut[0] - 0.05);
    expect(cam.position.y).toBeLessThan(1);
    expect(cam.getWorldDirection(new THREE.Vector3()).y).toBeGreaterThan(0.9);
    // and after it the picture is from across the room
    expect(at(shut[shut.length - 1] + 0.5).y).toBeGreaterThan(1.4);
  });

  test("what is said at the end has a voice, and a mouth to move with it", () => {
    const clips = JSON.parse(readFileSync("public/shows/sniper/manifest.json", "utf8")).clips as { id: string; tele?: string; start: number; end: number }[];
    const line = clips.find((c) => c.id === "male-home-day")!;
    expect(line).toBeDefined();
    expect(line.tele).toBe("male-home-day.tele");
    // (said, and over, before the dark)
    expect(25.6 + (line.end - line.start)).toBeLessThan(28.3);
  });
});
