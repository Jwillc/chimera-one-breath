/**
 * The condo: a tower across the street at night, one lit room in it behind four panes of glass,
 * and the city round it. The rifle lies on the roof opposite, looking down −z at the tower's face.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Glass, Scene, rayBox, traffic, type Box, type Crossing, type Impact, type Spot, rng } from "./place.ts";

/** from the rifle to the glass */
const D = 105;
/** the scope's eye, on the roof opposite */
const EYE = new THREE.Vector3(0, 41, 0);
/** the condo: its floor and ceiling, half its width, how far back it goes */
const FLOOR = 34, CEIL = 37.1, HALF = 7, DEPTH = 8;
/** the way out: a door in the back wall */
const DOOR = { x: 0.3, z: -D - DEPTH };
const STOREY = 3.4, BAY = 3.5, BAYS = 14, STOREYS = 17;
const TOWER_W = BAY * BAYS, TOWER_H = STOREY * STOREYS;
const GLASS_LO = FLOOR + 0.06, GLASS_HI = CEIL - 0.12;

const room = (x0: number, x1: number, zr0: number, zr1: number, h: number, y0 = 0): Box => ({ x0, x1, y0: FLOOR + y0, y1: FLOOR + h, z0: -D + zr0, z1: -D + zr1 });
/** what a bullet stops in: the sofa's seat and back, the low table, the kitchen island */
const SEAT = room(-5.6, -2.4, -5.5, -4.6, 0.45), BACK = room(-5.6, -2.4, -5.9, -5.5, 0.95), TABLE = room(-4.9, -3.1, -3.7, -3.0, 0.42), ISLAND = room(2.2, 4.8, -5.0, -4.0, 0.95);
const SOLID = [SEAT, BACK, TABLE, ISLAND];
const WALL = V.blueMid, LAMP = V.amber;
/** places to be: across the room (x) and back from the glass (zr, negative) */
const spot = (x: number, zr: number, th: number, more: Partial<Spot> = {}): Spot => ({ x, z: -D + zr, th, ...more });

export class Condo extends Scene {
  readonly name = "THE CONDO";
  readonly intro = "intro";
  readonly lost = { banner: "OUT BY THE DOOR", card: "The target got out by the door." };
  readonly yaw: [number, number] = [-0.45, 0.45];
  readonly pitch: [number, number] = [-0.42, 0.24];
  readonly home = { yaw: 0, pitch: -0.052 };
  readonly hear = 55;
  readonly spots: Spot[] = [
    spot(-4.75, -5.05, Math.PI / 2, { sit: true }),
    spot(-3.25, -5.05, Math.PI / 2, { sit: true }),
    spot(-5.3, -1.5, 1.25, { open: true }),
    spot(-1.6, -2.3, 1.9, { open: true }),
    spot(0.6, -3.5, 1.35, { open: true }),
    spot(1.9, -1.7, 1.6, { open: true }),
    spot(4.6, -1.6, 1.75, { open: true }),
    spot(3.1, -5.5, Math.PI / 2),
    spot(5.6, -4.4, 2.5),
    spot(-0.5, -6.4, 1.45),
  ];
  private readonly pane = new Glass(-D, -HALF, HALF, GLASS_LO, GLASS_HI);

  constructor() {
    super();
    this.build(() => {
      this.sky(1983);
      this.skyline();
      this.tower();
      this.condo();
      this.ledge(EYE);
    });
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: Math.min(6, 3 + 2 * lap), strollers: Math.min(3, 2 * lap) };
  }

  override reset(): void {
    this.pane.mend();
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** somewhere up the tower */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() - 0.5) * 0.24, pitch: 0.03 + Math.random() * 0.07 };
  }

  /** blood and glass fall to the condo's floor; anywhere else there is nothing under them */
  floor(x: number, z: number): number {
    return Math.abs(x) < HALF + 0.5 && z < -D + 0.3 && z > -D - DEPTH - 0.5 ? FLOOR : -1e4;
  }

  /** to the door, without walking through the furniture */
  wayOut(p: { x: number; z: number; sit: number }): { x: number; z: number }[] {
    const zr = p.z + D, door = { x: DOOR.x, z: DOOR.z + 0.2 };
    if (p.sit > 0.5) return [{ x: p.x, z: -D - 4.15 }, { x: -1.9, z: -D - 4.15 }, door];
    if (p.x > 4.8 && zr > -5.2) return [{ x: 5.4, z: -D - 5.7 }, door];
    if (zr > -5 && (p.x < -1.8 || p.x > 1.6)) return [{ x: Math.max(-1.8, Math.min(1.6, p.x)), z: -D + Math.min(zr, -2.6) }, door];
    return [door];
  }

  override glass(o: THREE.Vector3, d: THREE.Vector3): Crossing | null {
    return d.z < -1e-6 ? this.pane.cross(o, d) : null;
  }

  override shatter(c: Crossing): void {
    this.pane.shatter(c.x, c.y);
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    const far = 420;
    const street = d.y < -1e-6 ? -o.y / d.y : Infinity;
    const out: Impact = street < far ? { t: street, what: "street", heard: false } : { t: far, what: null, heard: false };
    if (d.z >= -1e-6) return out;
    if (!this.glass(o, d)) {
      // the tower's face, or past it into the night
      const t = (-D - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
      return Math.abs(x) < TOWER_W / 2 && y > 0 && y < TOWER_H ? { t, what: "tower", heard: true } : out;
    }
    // inside: the walls, floor and ceiling, or the furniture before them
    let t = (-D - DEPTH - o.z) / d.z;
    if (d.x > 1e-9) t = Math.min(t, (HALF - o.x) / d.x);
    if (d.x < -1e-9) t = Math.min(t, (-HALF - o.x) / d.x);
    if (d.y < -1e-9) t = Math.min(t, (FLOOR - o.y) / d.y);
    if (d.y > 1e-9) t = Math.min(t, (CEIL - o.y) / d.y);
    let what = "room";
    for (const b of SOLID) {
      const tb = rayBox(o, d, b);
      if (tb > 0 && tb < t) {
        t = tb;
        what = "furniture";
      }
    }
    return { t, what, heard: true };
  }

  /** the glass and the street, into this frame's lines */
  override draw(B: Beams): void {
    // each pane: a glint or two, so there is something there to break
    const z = -D + 0.02;
    for (let i = 0; i < 4; i++) {
      const x0 = -HALF + i * BAY + 0.1;
      for (const [u, len] of [[0.18, 0.55], [0.3, 0.3]] as const) {
        const gx = x0 + u * BAY + 0.25 * Math.sin(this.clock * 0.13 + i);
        B.seg(gx, GLASS_HI - 0.25, z, gx - len * 0.45, GLASS_HI - 0.25 - len, z, V.white, 0.6, 0.16);
      }
    }
    this.pane.draw(B);
    traffic(B, this.clock, 0, -52);
  }

  /** other towers: boxes with a few lit windows, behind and beside the one that matters */
  private skyline(): void {
    const r = rng(77);
    for (const [cx, cz, w, dp, h] of [[-78, -150, 34, 30, 92], [-44, -210, 26, 26, 120], [52, -190, 30, 30, 76], [86, -140, 28, 34, 104], [-120, -120, 30, 30, 60], [128, -200, 36, 30, 132], [4, -260, 44, 30, 150]]) this.block(r, cx, cz, w, dp, h);
    // the street: kerbs and lane marks between here and there
    for (const z of [-44, -68]) this.path([-200, 0, z, 200, 0, z], V.blueDim, 0.85, 0.6);
    for (let x = -196; x < 200; x += 8) this.seg(x, 0, -56, x + 3.5, 0, -56, V.blueDim, 0.85, 0.5);
    for (let x = -180; x <= 180; x += 36) {
      // street lamps
      this.path([x, 0, -45, x, 7, -45, x, 7.4, -47], V.blueDim, 0.85, 0.7);
      this.seg(x - 0.3, 7.4, -47, x + 0.3, 7.4, -47, V.amber, 1.6, 0.8);
    }
  }

  private tower(): void {
    const r = rng(404), x0 = -TOWER_W / 2, x1 = TOWER_W / 2, z = -D;
    this.rect(x0, 0, x1, TOWER_H, z, WALL, 1.3, 0.9);
    for (let f = 1; f < STOREYS; f++) this.path([x0, f * STOREY, z, x1, f * STOREY, z], V.blueDim, 0.85, 0.5);
    for (let f = 0; f < STOREYS; f++) {
      for (let b = 0; b < BAYS; b++) {
        const wx = x0 + b * BAY, wy = f * STOREY;
        // the condo's own bays are its glass
        if (wy === FLOOR && wx >= -HALF - 0.01 && wx < HALF - 0.01) continue;
        const a = wx + 0.4, c = wx + BAY - 0.4, lo = wy + 0.9, hi = wy + 2.9, kind = r();
        if (kind < 0.5) this.rect(a, lo, c, hi, z, V.blueDim, 0.6, 0.5);
        else if (kind < 0.78) {
          // curtains drawn
          this.rect(a, lo, c, hi, z, V.blueDim, 0.85, 0.6);
          for (let i = 1; i < 6; i++) this.seg(a + ((c - a) * i) / 6, lo, z, a + ((c - a) * i) / 6 + (r() - 0.5) * 0.1, hi, z, V.blueDim, 0.6, 0.45);
        } else if (kind < 0.92) {
          // blinds
          this.rect(a, lo, c, hi, z, V.blueDim, 0.85, 0.6);
          for (let i = 1; i < 7; i++) this.seg(a, lo + ((hi - lo) * i) / 7, z, c, lo + ((hi - lo) * i) / 7, z, V.blueDim, 0.6, 0.45);
        } else {
          // somebody is home: a lit frame and a lamp
          this.rect(a, lo, c, hi, z, mix(LAMP, "#000000", 0.35), 1.05, 0.8);
          const lx = a + 0.5 + r() * (c - a - 1);
          this.path([lx, lo, z, lx, lo + 0.8, z], mix(LAMP, "#000000", 0.35), 0.85, 0.7);
          this.path([lx - 0.25, lo + 0.8, z, lx + 0.25, lo + 0.8, z, lx + 0.15, lo + 1.15, z, lx - 0.15, lo + 1.15, z], LAMP, 0.85, 0.7, true);
        }
      }
    }
    // the tower's sides going back, and what stands on its roof
    for (const x of [x0, x1]) {
      this.path([x, 0, z, x, 0, z - 30, x, TOWER_H, z - 30, x, TOWER_H, z], V.blueDim, 0.85, 0.6);
      for (let f = 4; f < STOREYS; f += 4) this.path([x, f * STOREY, z, x, f * STOREY, z - 30], V.blueDim, 0.6, 0.4);
    }
    this.path([x0, TOWER_H, z - 30, x1, TOWER_H, z - 30], V.blueDim, 0.85, 0.6);
    this.path([x0, TOWER_H + 1.1, z, x1, TOWER_H + 1.1, z], WALL, 1.05, 0.8);
    for (const y of [TOWER_H + 1.5, TOWER_H + 5]) this.ringXZ(-13, y, z - 8, 2.4, V.blueDim, 0.85, 0.7, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.path([-13 + Math.cos(a) * 2.4, TOWER_H + 1.5, z - 8 + Math.sin(a) * 2.4, -13 + Math.cos(a) * 2.4, TOWER_H + 5, z - 8 + Math.sin(a) * 2.4, -13, TOWER_H + 6.2, z - 8], V.blueDim, 0.85, 0.7);
    }
    this.path([15, TOWER_H, z - 6, 15, TOWER_H + 13, z - 6], WALL, 1.05, 0.8);
    for (const y of [5, 9]) this.seg(13.8, TOWER_H + y, z - 6, 16.2, TOWER_H + y, z - 6, WALL, 0.85, 0.7);
    this.seg(15, TOWER_H + 13, z - 6, 15, TOWER_H + 13.5, z - 6, V.red, 2.1, 1);
  }

  /** the lit room behind the glass */
  private condo(): void {
    const z0 = -D - DEPTH, z1 = -D, at = (zr: number) => -D + zr;
    // the glass wall's frame and mullions
    this.rect(-HALF, FLOOR, HALF, CEIL, z1, V.blue, 1.6);
    for (let i = 1; i < 4; i++) this.path([-HALF + i * BAY, FLOOR, z1, -HALF + i * BAY, CEIL, z1], V.blue, 1.3);
    // floor boards, walls, ceiling
    for (let x = -HALF + 1; x < HALF; x += 1) this.path([x, FLOOR, z0, x, FLOOR, z1], V.blueDim, 0.6, 0.55);
    for (let zr = -DEPTH + 1; zr < 0; zr += 1) this.path([-HALF, FLOOR, at(zr), HALF, FLOOR, at(zr)], V.blueDim, 0.6, 0.4);
    this.rect(-HALF, FLOOR, HALF, CEIL, z0, WALL, 1.3);
    for (const x of [-HALF, HALF]) for (const y of [FLOOR, CEIL]) this.path([x, y, z0, x, y, z1], WALL, 1.05, 0.9);
    // the door, and a picture of a wave beside it
    this.path([DOOR.x - 0.6, FLOOR, z0, DOOR.x - 0.6, FLOOR + 2.15, z0, DOOR.x + 0.6, FLOOR + 2.15, z0, DOOR.x + 0.6, FLOOR, z0], V.blue, 1.3);
    this.seg(DOOR.x + 0.42, FLOOR + 1.05, z0, DOOR.x + 0.5, FLOOR + 1.05, z0, LAMP, 1.6);
    this.rect(-5.4, FLOOR + 1.35, -2.6, FLOOR + 2.55, z0, V.pink, 1.05, 0.8);
    const wave: number[] = [];
    for (let i = 0; i <= 24; i++) wave.push(-5.2 + (i / 24) * 2.4, FLOOR + 1.95 + 0.32 * Math.sin(i * 0.8) * Math.sin((i / 24) * Math.PI), z0);
    this.path(wave, V.pink, 0.85, 0.8);
    // shelves on the right wall
    for (const y of [0.8, 1.3, 1.8]) this.path([HALF, FLOOR + y, at(-7.2), HALF, FLOOR + y, at(-5.2)], WALL, 0.85, 0.8);
    for (let i = 0; i < 9; i++) this.path([HALF, FLOOR + 1.3, at(-7.1 + i * 0.2), HALF, FLOOR + 1.3 + 0.26 + 0.1 * Math.sin(i * 2.1), at(-7.1 + i * 0.2)], V.green, 0.85, 0.6);

    // the sofa (facing the glass), its arms, the rug and the low table
    const sofa = mix(V.blue, V.pink, 0.25);
    this.box(SEAT, sofa, 1.05);
    this.box(BACK, sofa, 1.05);
    for (const x of [SEAT.x0, SEAT.x1]) this.box({ ...SEAT, x0: x - 0.12, x1: x + 0.12, y1: FLOOR + 0.66, z0: BACK.z0 }, sofa, 0.85, 0.85);
    this.path([(SEAT.x0 + SEAT.x1) / 2, FLOOR + 0.45, SEAT.z0, (SEAT.x0 + SEAT.x1) / 2, FLOOR + 0.45, SEAT.z1], sofa, 0.85, 0.7);
    this.path([-5.9, FLOOR + 0.01, at(-4.3), -2.1, FLOOR + 0.01, at(-4.3), -2.1, FLOOR + 0.01, at(-2.3), -5.9, FLOOR + 0.01, at(-2.3)], V.pink, 0.85, 0.5, true);
    this.box({ ...TABLE, y0: TABLE.y1 - 0.05 }, V.blue, 1.05);
    for (const x of [TABLE.x0 + 0.08, TABLE.x1 - 0.08]) for (const z of [TABLE.z0 + 0.08, TABLE.z1 - 0.08]) this.path([x, FLOOR, z, x, TABLE.y1, z], V.blue, 0.85, 0.8);
    // the island, bottles on it, stools before it, lamps hanging over it
    this.box(ISLAND, V.blue, 1.3);
    this.path([ISLAND.x0, ISLAND.y1 - 0.08, ISLAND.z1, ISLAND.x1, ISLAND.y1 - 0.08, ISLAND.z1], V.blue, 0.85, 0.7);
    for (const [bx, bh, color] of [[2.6, 0.32, V.green], [2.8, 0.26, LAMP], [3.02, 0.34, V.green], [4.4, 0.2, V.white]] as const) {
      this.ringXZ(bx, ISLAND.y1, at(-4.6), 0.04, color, 0.85, 0.9, 6);
      this.path([bx, ISLAND.y1, at(-4.6), bx, ISLAND.y1 + bh, at(-4.6)], color, 1.05, 0.9);
    }
    for (const sx of [2.9, 4.1]) {
      this.ringXZ(sx, FLOOR + 0.68, at(-3.5), 0.19, V.blueMid, 0.85, 0.9, 8);
      for (let i = 0; i < 3; i++) this.path([sx + Math.cos(i * 2.1) * 0.16, FLOOR + 0.68, at(-3.5) + Math.sin(i * 2.1) * 0.16, sx + Math.cos(i * 2.1) * 0.24, FLOOR, at(-3.5) + Math.sin(i * 2.1) * 0.24], V.blueMid, 0.85, 0.8);
    }
    for (const lx of [2.8, 3.5, 4.2]) {
      this.path([lx, CEIL, at(-4.5), lx, CEIL - 0.75, at(-4.5)], WALL, 0.6, 0.8);
      this.ringXZ(lx, CEIL - 0.75, at(-4.5), 0.05, LAMP, 0.85, 1, 6);
      this.ringXZ(lx, CEIL - 1.0, at(-4.5), 0.2, LAMP, 1.05, 1, 8);
      for (let i = 0; i < 4; i++) this.path([lx + Math.cos(i * 1.57) * 0.05, CEIL - 0.75, at(-4.5) + Math.sin(i * 1.57) * 0.05, lx + Math.cos(i * 1.57) * 0.2, CEIL - 1.0, at(-4.5) + Math.sin(i * 1.57) * 0.2], LAMP, 0.85, 0.9);
    }
    // a standing lamp by the sofa, and a plant in the corner by the glass
    const px = -6.3, pz = at(-6.4);
    this.path([px, FLOOR, pz, px, FLOOR + 1.6, pz], WALL, 1.05);
    this.ringXZ(px, FLOOR, pz, 0.2, WALL, 0.85, 0.9, 8);
    this.ringXZ(px, FLOOR + 1.6, pz, 0.14, LAMP, 1.05, 1, 8);
    this.ringXZ(px, FLOOR + 1.95, pz, 0.26, LAMP, 1.05, 1, 8);
    for (let i = 0; i < 4; i++) this.path([px + Math.cos(i * 1.57) * 0.14, FLOOR + 1.6, pz + Math.sin(i * 1.57) * 0.14, px + Math.cos(i * 1.57) * 0.26, FLOOR + 1.95, pz + Math.sin(i * 1.57) * 0.26], LAMP, 0.85, 0.9);
    const gx = 6.3, gz = at(-0.7), q = rng(9);
    this.ringXZ(gx, FLOOR + 0.5, gz, 0.24, WALL, 0.85, 0.9, 8);
    this.ringXZ(gx, FLOOR, gz, 0.17, WALL, 0.85, 0.9, 8);
    for (let i = 0; i < 9; i++) {
      const a = q() * 6.28, reach = 0.3 + 0.4 * q(), top = 1.2 + 0.9 * q();
      this.path([gx, FLOOR + 0.5, gz, gx + Math.cos(a) * reach * 0.5, FLOOR + top * 0.75, gz + Math.sin(a) * reach * 0.5, gx + Math.cos(a) * reach, FLOOR + top, gz + Math.sin(a) * reach], V.green, 0.85, 0.8);
    }
  }
}
