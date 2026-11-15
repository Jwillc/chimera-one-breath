/**
 * The rooftop pool: a hotel's roof deck at night, a pool in it with people in the water and round
 * it, a bar, a stair hut that is the way down. The rifle is on a taller roof across the street,
 * looking down −z and well below the level at them.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Scene, nearer, rayBox, type Box, type Impact, type Spot, type Trait, rng } from "./place.ts";

const EYE = new THREE.Vector3(0, 78, 0);
/** the deck: how high it is, and its edges */
const DECK = 40, X0 = -13, X1 = 13, Z0 = -103, Z1 = -88;
/** the pool in it, and how deep */
const PX0 = -9, PX1 = 2, PZ0 = -98, PZ1 = -92, DEEP = 1.15, WATER = DECK - 0.12;
const HUT: Box = { x0: 8, x1: 12, y0: DECK, y1: DECK + 2.7, z0: -103, z1: -100 };
const BAR: Box = { x0: -12, x1: -7, y0: DECK, y1: DECK + 1.05, z0: -102.4, z1: -101.5 };
const DOOR = { x: 10, z: -99.8 };
const LAMP = V.amber, WET = mix(V.blue, V.white, 0.35);
const inPool = (x: number, z: number) => x > PX0 && x < PX1 && z > PZ0 && z < PZ1;
/** deck chairs: where, and the way they face */
const CHAIRS: [number, number, number][] = [[-6.5, -90.2, Math.PI / 2], [-3.5, -90.2, Math.PI / 2], [11.6, -93, Math.PI], [11.6, -95.5, Math.PI]];
const STOOLS: [number, number][] = [[-10.5, -100.6], [-8.5, -100.6]];

export class Pool extends Scene {
  readonly name = "THE POOL";
  readonly intro = "intro-pool";
  readonly lost = { banner: "DOWN THE STAIRS", card: "The target got to the stairs." };
  readonly yaw: [number, number] = [-0.5, 0.5];
  readonly pitch: [number, number] = [-0.75, 0.12];
  readonly home = { yaw: 0, pitch: -0.372 };
  readonly hear = 55;
  /** (nobody wears a tie to a pool) */
  override readonly traits: Trait[] = ["hat", "drink", "phone", "glasses", "cigar"];
  readonly spots: Spot[] = [
    // in the water
    { x: -6.5, z: -95, th: 1.2, must: true },
    { x: -2, z: -94, th: 2.0 },
    { x: -4, z: -96.8, th: 1.6 },
    ...CHAIRS.map(([x, z, th]) => ({ x, z, th, sit: true })),
    ...STOOLS.map(([x, z], i) => ({ x, z, th: Math.PI / 2 + (i ? -0.3 : 0.3), sit: true })),
    { x: -6, z: -100.2, th: 1.3 },
    // the open deck on the stairs' side
    { x: 5, z: -90.3, th: 1.4, open: true },
    { x: 4.5, z: -95, th: 2.2, open: true },
    { x: 5, z: -99.3, th: 1.2, open: true },
    { x: 8.5, z: -92, th: 1.9, open: true },
    { x: 8.5, z: -97, th: 1.6, open: true },
  ];

  constructor() {
    super();
    this.build(() => {
      this.sky(2077, 120);
      this.town();
      this.hotel();
      this.deck();
      this.ledge(EYE);
    });
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: Math.min(5, 4 + lap), strollers: Math.min(3, 1 + lap) };
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** on the hotel's face, under the deck */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() - 0.5) * 0.26, pitch: -0.45 - Math.random() * 0.06 };
  }

  floor(x: number, z: number): number {
    return inPool(x, z) ? DECK - DEEP : DECK;
  }

  override water(x: number, z: number): number | null {
    return inPool(x, z) ? WATER : null;
  }

  /** out of the water by the near side, round the pool, to the stair hut's door */
  wayOut(p: { x: number; z: number }): { x: number; z: number }[] {
    if (inPool(p.x, p.z)) return [{ x: PX1 + 0.8, z: Math.max(PZ0 + 0.5, Math.min(PZ1 - 0.5, p.z)) }, DOOR];
    if (p.x < PX1 + 1 && p.z < PZ0) return [{ x: 3.5, z: -99.4 }, DOOR];
    if (p.x < PX1 + 1 && p.z > PZ1) return [{ x: 3.5, z: -90.6 }, DOOR];
    return [DOOR];
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    const far = 700;
    let best: Impact = { t: far, what: null, heard: false };
    if (d.y < -1e-6) {
      best = nearer(best, -o.y / d.y, "street", false);
      const t = (DECK - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
      if (x > X0 && x < X1 && z > Z0 && z < Z1) best = inPool(x, z) ? nearer(best, (DECK - DEEP - o.y) / d.y, "pool") : nearer(best, t, "deck");
    }
    if (d.z < -1e-6) {
      // the hotel's face, under the deck
      const t = (Z1 - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
      if (x > X0 && x < X1 && y > 0 && y < DECK) best = nearer(best, t, "tower");
    }
    for (const b of [HUT, BAR]) best = nearer(best, rayBox(o, d, b), "wall");
    return best;
  }

  /** the water: ripples that drift and catch the light */
  override draw(B: Beams): void {
    const t = this.clock;
    for (let i = 0; i < 22; i++) {
      const u = (i * 0.618) % 1, v = (i * 0.377 + 0.13) % 1, len = 0.5 + 0.9 * ((i * 0.29) % 1);
      const x = PX0 + 0.4 + (((u * 10.2 + t * (0.12 + 0.05 * (i % 3))) % 10.2) + 10.2) % 10.2 - len / 2, z = PZ0 + 0.4 + v * (PZ1 - PZ0 - 0.8);
      const x0 = Math.max(PX0 + 0.1, x), x1 = Math.min(PX1 - 0.1, x + len), bob = 0.03 * Math.sin(t * 1.7 + i);
      if (x1 > x0) B.seg(x0, WATER + bob, z, x1, WATER - bob, z + 0.12 * Math.sin(t * 0.9 + i * 2), i % 4 ? WET : V.white, 0.85, 0.35 + 0.3 * Math.sin(t * 1.3 + i * 1.9) ** 2);
    }
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the town below and beyond: lower roofs, taller towers behind, the streets between */
  private town(): void {
    const r = rng(311);
    for (const [cx, cz, w, dp, h] of [[-52, -96, 30, 34, 26], [50, -100, 34, 30, 31], [-34, -160, 40, 30, 58], [26, -170, 36, 36, 84], [84, -160, 30, 30, 46], [-96, -150, 36, 40, 70], [-8, -235, 50, 30, 120], [120, -230, 40, 30, 96], [-130, -240, 44, 30, 88]]) this.block(r, cx, cz, w, dp, h);
    for (const z of [-58, -72, -128, -142]) this.path([-220, 0, z, 220, 0, z], V.blueDim, 0.85, 0.5);
    for (const x of [-26, -18, 20, 28]) this.path([x, 0, -60, x, 0, -300], V.blueDim, 0.85, 0.4);
    for (let x = -216; x < 220; x += 8) this.seg(x, 0, -65, x + 3.5, 0, -65, V.blueDim, 0.85, 0.4);
  }

  /** the hotel under the deck: its face toward the rifle, floor after floor */
  private hotel(): void {
    const r = rng(52), st = 3.3;
    this.rect(X0, 0, X1, DECK, Z1, V.blueMid, 1.05, 0.8);
    for (const x of [X0, X1]) this.path([x, 0, Z1, x, 0, Z0, x, DECK, Z0], V.blueDim, 0.85, 0.5);
    for (let y = st; y < DECK - 1; y += st) {
      this.path([X0, y, Z1, X1, y, Z1], V.blueDim, 0.6, 0.45);
      for (let x = X0 + 0.5; x < X1 - 1; x += 3.25) {
        const k = r();
        if (k > 0.86) this.rect(x + 0.3, y - st + 0.8, x + 2.6, y - 0.5, Z1, mix(LAMP, "#000000", 0.35), 0.85, 0.7);
        else if (k > 0.5) this.rect(x + 0.3, y - st + 0.8, x + 2.6, y - 0.5, Z1, V.blueDim, 0.6, 0.4);
      }
    }
    // its name down the corner, in lights
    for (let i = 0; i < 9; i++) this.seg(X0 + 0.5, DECK - 3 - i * 1.5, Z1, X0 + 1.4, DECK - 3 - i * 1.5, Z1, V.pink, 1.6, 0.8);
  }

  private parasol(x: number, z: number): void {
    const top = DECK + 2.6, n = 8, R = 1.35;
    this.path([x, DECK, z, x, top + 0.15, z], V.blueMid, 1.05);
    this.ringXZ(x, top - 0.45, z, R, V.pink, 1.05, 0.9, n);
    for (let i = 0; i < n; i++) this.path([x, top, z, x + Math.cos((i / n) * Math.PI * 2) * R, top - 0.45, z + Math.sin((i / n) * Math.PI * 2) * R], V.pink, 0.85, 0.8);
  }

  private palm(x: number, z: number, seed: number): void {
    const q = rng(seed);
    this.post(x, z, 0.3, DECK, DECK + 0.5, V.blueMid, 0.85, 0.9, 8);
    this.path([x, DECK + 0.5, z, x + 0.08, DECK + 1.6, z, x + 0.02, DECK + 2.5, z], V.green, 1.05, 0.9);
    for (let i = 0; i < 9; i++) {
      const a = q() * 6.28, reach = 0.7 + 0.6 * q();
      this.path([x, DECK + 2.5, z, x + Math.cos(a) * reach * 0.6, DECK + 2.75, z + Math.sin(a) * reach * 0.6, x + Math.cos(a) * reach, DECK + 2.2 + 0.3 * q(), z + Math.sin(a) * reach], V.green, 0.85, 0.85);
    }
  }

  private deck(): void {
    // the deck, its boards, the rail round it
    this.slab(X0, Z0, X1, Z1, DECK, V.blue, 1.6);
    for (let z = Z0 + 1; z < Z1; z += 1) {
      // (boards stop at the pool)
      if (z > PZ0 && z < PZ1) {
        this.path([X0, DECK, z, PX0, DECK, z], V.blueDim, 0.6, 0.4);
        this.path([PX1, DECK, z, X1, DECK, z], V.blueDim, 0.6, 0.4);
      } else this.path([X0, DECK, z, X1, DECK, z], V.blueDim, 0.6, 0.4);
    }
    this.slab(X0, Z0, X1, Z1, DECK + 1.05, V.blueMid, 1.05, 0.8);
    for (let x = X0; x <= X1; x += 2) for (const z of [Z0, Z1]) this.path([x, DECK, z, x, DECK + 1.05, z], V.blueDim, 0.85, 0.7);
    for (let z = Z0 + 2.5; z < Z1; z += 2.5) for (const x of [X0, X1]) this.path([x, DECK, z, x, DECK + 1.05, z], V.blueDim, 0.85, 0.7);

    // the pool: its edge, its floor and the lanes painted on it, the steps in at the near corner
    this.slab(PX0, PZ0, PX1, PZ1, DECK, V.white, 1.6);
    this.slab(PX0 - 0.35, PZ0 - 0.35, PX1 + 0.35, PZ1 + 0.35, DECK, WET, 1.05, 0.8);
    this.slab(PX0, PZ0, PX1, PZ1, DECK - DEEP, WET, 0.85, 0.6);
    for (const x of [PX0, PX1]) for (const z of [PZ0, PZ1]) this.path([x, DECK, z, x, DECK - DEEP, z], WET, 0.85, 0.6);
    for (let z = PZ0 + 1.5; z < PZ1; z += 1.5) this.path([PX0 + 0.6, DECK - DEEP, z, PX1 - 0.6, DECK - DEEP, z], V.blueDim, 0.85, 0.6);
    for (let i = 0; i < 4; i++) this.path([PX1 - 0.3 * i, DECK - 0.29 * i, PZ1 - 1.6, PX1 - 0.3 * i, DECK - 0.29 * i, PZ1 - 0.1], WET, 0.85, 0.7);
    // a ladder at the far end
    for (const z of [PZ0 + 1.2, PZ0 + 1.75]) this.path([PX0, DECK - 0.9, z, PX0, DECK + 0.85, z, PX0 - 0.45, DECK + 0.85, z, PX0 - 0.45, DECK, z], V.white, 1.05, 0.9);

    // the stair hut and its door, a lamp over it
    this.box(HUT, V.blueMid, 1.3);
    this.rect(DOOR.x - 0.6, DECK, DOOR.x + 0.6, DECK + 2.1, HUT.z1, V.blue, 1.3);
    this.seg(DOOR.x + 0.42, DECK + 1.05, HUT.z1, DOOR.x + 0.5, DECK + 1.05, HUT.z1, LAMP, 1.6);
    this.rect(DOOR.x - 0.25, DECK + 2.25, DOOR.x + 0.25, DECK + 2.45, HUT.z1, V.green, 1.3, 0.9);
    // the bar: its counter, the bottles behind, the stools, a canopy over it
    this.box(BAR, V.blue, 1.3);
    this.path([BAR.x0, DECK + 1.5, -102.9, BAR.x1, DECK + 1.5, -102.9], V.blueMid, 0.85, 0.8);
    for (let i = 0; i < 12; i++) {
      const bx = BAR.x0 + 0.35 + i * 0.39, color = [V.green, LAMP, V.white, V.pink][i % 4];
      this.path([bx, DECK + 1.5, -102.9, bx, DECK + 1.5 + 0.24 + 0.1 * Math.sin(i * 2.3), -102.9], color, 1.05, 0.85);
    }
    for (const x of [BAR.x0, BAR.x1]) this.path([x, DECK, -102.9, x, DECK + 2.5, -102.9, x, DECK + 2.35, -100.9], V.blueMid, 0.85, 0.8);
    this.path([BAR.x0, DECK + 2.5, -102.9, BAR.x1, DECK + 2.5, -102.9], V.pink, 1.05, 0.8);
    this.path([BAR.x0, DECK + 2.35, -100.9, BAR.x1, DECK + 2.35, -100.9], V.pink, 1.3, 0.9);
    for (const [sx, sz] of STOOLS) {
      this.ringXZ(sx, DECK + 0.45, sz, 0.2, V.blueMid, 1.05, 0.9, 8);
      for (let i = 0; i < 3; i++) this.path([sx + Math.cos(i * 2.1) * 0.15, DECK + 0.45, sz + Math.sin(i * 2.1) * 0.15, sx + Math.cos(i * 2.1) * 0.24, DECK, sz + Math.sin(i * 2.1) * 0.24], V.blueMid, 0.85, 0.8);
    }
    for (const [x, z, th] of CHAIRS) this.chair(x, DECK, z, th);
    this.parasol(-5, -89.3);
    this.parasol(12, -91.2);
    this.palm(-12, -89, 5);
    this.palm(-12, -97.5, 8);
    this.palm(6.6, -102.2, 13);
    // a string of lights from the hut to a pole at the near corner, sagging
    const a = [HUT.x0, HUT.y1, HUT.z1], b = [-12.6, DECK + 3.4, Z1 + 0.3], line: number[] = [];
    this.path([b[0], DECK, b[2], b[0], b[1], b[2]], V.blueMid, 0.85, 0.8);
    for (let i = 0; i <= 18; i++) {
      const u = i / 18, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u - 1.1 * Math.sin(u * Math.PI), z = a[2] + (b[2] - a[2]) * u;
      line.push(x, y, z);
      if (i > 0 && i < 18) this.seg(x, y - 0.05, z, x, y - 0.2, z, i % 3 ? LAMP : V.pink, 2.1, 0.95);
    }
    this.path(line, V.blueDim, 0.6, 0.7);
  }
}
