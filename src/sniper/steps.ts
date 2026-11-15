/**
 * The steps: a grand building at the top of a long flight of them, and three people on their way
 * up and in at its door, one of them the target. The rifle lies in the road below, looking up −z;
 * from down there the top of the steps hides the legs of anyone who has got as far as the terrace,
 * and once the target is through the door the chance is gone.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Scene, nearer, rayBox, rayPost, traffic, type Box, type Impact, type Spot, rng } from "./place.ts";

const EYE = new THREE.Vector3(0, 0.75, 0);
/** the flight: where it starts and ends (z), how high it climbs, half its width */
const FOOT = -58, TOP = -88, RISE = 9, HALF = 11, SLOPE = RISE / (FOOT - TOP);
/** the building's face and its door; the columns before it */
const FACE = -96, WIDE = 30, ROOF = RISE + 16, DOOR = { x: 0, z: FACE + 0.2 };
const COLS: number[] = [-8.5, -3.5, 3.5, 8.5], COL_Z = -90.2, COL_R = 0.45, COL_H = 10;
const KERB = -51;
const LIMO: Box = { x0: -2.7, x1: 2.7, y0: 0, y1: 1.4, z0: -50.3, z1: -48.5 };
const STONE = V.blueMid, LAMP = V.amber;
/** one of the three on their way in: where they start, and the line they take to the door */
const arrival = (x: number, z: number): Spot => ({ x, z, th: -Math.PI / 2, must: true, mark: true, pace: 0.85, route: [{ x, z: TOP - 0.6 }, { x: x * 0.3, z: -93 }, DOOR] });

export class Steps extends Scene {
  readonly name = "THE STEPS";
  readonly intro = "intro-steps";
  readonly lost = { banner: "INSIDE THE BUILDING", card: "The target went in at the door." };
  readonly yaw: [number, number] = [-0.5, 0.5];
  readonly pitch: [number, number] = [-0.04, 0.42];
  readonly home = { yaw: 0, pitch: 0.07 };
  readonly hear = 45;
  readonly spots: Spot[] = [
    arrival(0.9, -57.6),
    arrival(-0.3, -55.9),
    arrival(-1.5, -54.3),
    // by the door, on the terrace, on the steps
    { x: 1.9, z: -95.3, th: Math.PI / 2 },
    { x: -6, z: -89.4, th: 1.2 },
    { x: 6.3, z: -89.6, th: 2.0 },
    { x: -7.5, z: -70, th: Math.PI / 2, sit: true },
    { x: 8, z: -64, th: 1.9, sit: true },
    { x: 6.5, z: -76, th: 1.3 },
    // the pavement at the foot of them
    { x: -9, z: -52.8, th: 1.2, open: true },
    { x: -4.5, z: -52, th: 1.6, open: true },
    { x: 5, z: -52.6, th: 1.5, open: true },
    { x: 10, z: -51.8, th: 1.9, open: true },
  ];

  constructor() {
    super();
    this.build(() => {
      this.sky(88, 200, -Math.PI / 2, [-170, 210, -600]);
      this.street();
      this.flight();
      this.building();
    });
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: Math.min(6, 5 + lap), strollers: Math.min(3, 1 + lap) };
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** up on the building's face, over the door */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() - 0.5) * 0.26, pitch: 0.19 + Math.random() * 0.06 };
  }

  floor(_x: number, z: number): number {
    return z > FOOT ? 0 : z < TOP ? RISE : SLOPE * (FOOT - z);
  }

  /** from the street, away along it; from the steps and the terrace, in at the door */
  wayOut(p: { x: number; z: number }): { x: number; z: number }[] {
    if (p.z > FOOT - 0.5) return [{ x: p.x < 0 ? -46 : 46, z: -54 }];
    return p.z > TOP - 1 ? [{ x: Math.max(-2, Math.min(2, p.x)), z: TOP - 1.3 }, DOOR] : [DOOR];
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    let best: Impact = { t: 500, what: null, heard: false };
    if (d.y < -1e-6) {
      const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
      if (z > FOOT || (Math.abs(x) > HALF && z > TOP)) best = nearer(best, t, "street", z < -38);
    }
    // the steps: a slope from the pavement up to the terrace
    const f = d.y + SLOPE * d.z;
    if (Math.abs(f) > 1e-9) {
      const t = -(o.y + SLOPE * (o.z - FOOT)) / f, x = o.x + d.x * t, z = o.z + d.z * t;
      if (z < FOOT && z > TOP && Math.abs(x) <= HALF) best = nearer(best, t, "steps");
    }
    if (d.z < -1e-6) {
      // the wall the terrace stands on, either side of the steps; then the building's face
      let t = (TOP - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
      if (Math.abs(x) > HALF && Math.abs(x) < WIDE && y > 0 && y < RISE) best = nearer(best, t, "wall");
      t = (FACE - o.z) / d.z;
      x = o.x + d.x * t;
      y = o.y + d.y * t;
      if (Math.abs(x) < WIDE && y > RISE && y < ROOF) best = nearer(best, t, "wall");
    }
    for (const x of COLS) best = nearer(best, rayPost(o, d, x, COL_Z, COL_R, RISE, RISE + COL_H), "column");
    return nearer(best, rayBox(o, d, LIMO), "car");
  }

  /** the traffic between the rifle and the steps, and the flags over the door */
  override draw(B: Beams): void {
    traffic(B, this.clock, 0, -30, 6, 220);
    const t = this.clock;
    for (const [x, color] of [[-5.6, V.red], [5.6, V.blue]] as const) {
      // a flag: three wavering lines out from the pole, and its end
      const y0 = RISE + 6.2, z = FACE + 1.2;
      const at = (u: number, v: number): [number, number, number] => [x + 0.1 + u * 1.9, y0 - v * 1.2 + 0.1 * Math.sin(t * 2.6 + u * 5 + x), z + 0.22 * u * Math.sin(t * 2.1 + u * 4 + x)];
      for (const v of [0, 0.5, 1]) for (let i = 0; i < 5; i++) {
        const a = at(i / 5, v), b = at((i + 1) / 5, v);
        B.seg(a[0], a[1], a[2], b[0], b[1], b[2], color, 1.05, 0.85);
      }
      const a = at(1, 0), b = at(1, 1);
      B.seg(a[0], a[1], a[2], b[0], b[1], b[2], color, 1.05, 0.85);
    }
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the road the rifle lies in, the pavement over it and the long car at the kerb */
  private street(): void {
    // where the rifle is: the near kerb, a drain's grating, the road's surface going away
    this.path([-30, 0.16, -1.4, 30, 0.16, -1.4], STONE, 1.3, 0.9);
    this.path([-30, 0, -1.6, 30, 0, -1.6], V.blueDim, 0.85, 0.8);
    for (let i = 0; i < 7; i++) this.path([-0.9 + i * 0.3, 0.01, -1.7, -0.9 + i * 0.3, 0.01, -2.4], V.blueDim, 0.85, 0.7);
    for (const z of [-20, KERB]) this.path([-200, 0, z, 200, 0, z], V.blueDim, 0.85, 0.6);
    for (let x = -196; x < 200; x += 8) this.seg(x, 0, -33.5, x + 3.5, 0, -33.5, V.blueDim, 0.85, 0.5);
    this.path([-200, 0.16, KERB - 0.2, 200, 0.16, KERB - 0.2], STONE, 0.85, 0.7);
    for (let x = -48; x <= 48; x += 4) this.path([x, 0.16, KERB - 0.2, x, 0.16, FOOT], V.blueDim, 0.6, 0.35);
    for (const x of [-34, -17, 17, 34]) {
      this.path([x, 0, KERB - 0.6, x, 7, KERB - 0.6, x, 7.4, KERB + 1.4], V.blueDim, 0.85, 0.7);
      this.seg(x - 0.3, 7.4, KERB + 1.4, x + 0.3, 7.4, KERB + 1.4, LAMP, 1.6, 0.8);
    }
    // the car they came in: long, low, its lamps lit
    const L = LIMO, car = mix(V.blue, V.white, 0.35);
    for (const z of [L.z0, L.z1]) {
      this.path([L.x0, 0.35, z, L.x0, 0.85, z, L.x0 + 1.3, 0.92, z, L.x0 + 2, L.y1, z, L.x1 - 1.5, L.y1, z, L.x1 - 0.9, 0.95, z, L.x1, 0.85, z, L.x1, 0.35, z], car, 1.05, 0.9, true);
      for (const wx of [L.x0 + 0.95, L.x1 - 0.95]) {
        const p: number[] = [];
        for (let i = 0; i < 10; i++) p.push(wx + Math.cos((i / 10) * Math.PI * 2) * 0.34, 0.34 + Math.sin((i / 10) * Math.PI * 2) * 0.34, z);
        this.path(p, V.blueMid, 1.05, 0.9, true);
      }
    }
    for (const [x, y] of [[L.x0, 0.85], [L.x0 + 2, L.y1], [L.x1 - 1.5, L.y1], [L.x1, 0.85], [L.x0, 0.35], [L.x1, 0.35]]) this.path([x, y, L.z0, x, y, L.z1], car, 0.85, 0.8);
    for (const z of [L.z0 + 0.25, L.z1 - 0.25]) {
      this.seg(L.x1, 0.7, z, L.x1 + 0.3, 0.7, z, V.white, 1.6, 0.9);
      this.seg(L.x0, 0.7, z, L.x0 - 0.3, 0.7, z, V.red, 1.6, 0.9);
    }
  }

  /** the steps themselves: every tread's edge, the blocks either side, a lamp on each */
  private flight(): void {
    const n = Math.round(FOOT - TOP);
    for (let i = 0; i <= n; i++) {
      const z = FOOT - i, y = SLOPE * i, bold = i === 0 || i === n || i === n / 2;
      this.path([-HALF, y, z, HALF, y, z], bold ? V.blue : V.blueDim, bold ? 1.3 : 0.6, bold ? 0.95 : 0.55);
    }
    for (const side of [-1, 1]) {
      const x = side * HALF, x1 = side * (HALF + 1.6);
      this.path([x, 0, FOOT, x, RISE, TOP], STONE, 1.05, 0.9);
      // the block beside the steps, stepping down in three
      for (let k = 0; k < 3; k++) {
        const za = FOOT - k * 10, zb = za - 10, top = SLOPE * (FOOT - zb) + 0.9;
        this.path([x, top, za, x, top, zb], STONE, 1.05, 0.9);
        this.path([x1, top, za, x1, top, zb], STONE, 0.85, 0.8);
        this.path([x, top, za, x1, top, za, x1, k ? SLOPE * (FOOT - za) + 0.9 : 0, za], STONE, 0.85, 0.8);
        this.path([x, top, za, x, k ? SLOPE * (FOOT - za) + 0.9 : 0, za], STONE, 0.85, 0.8);
        // a lamp on it: a post and a globe
        const lx = (x + x1) / 2, lz = za - 0.8;
        this.path([lx, top, lz, lx, top + 2.2, lz], STONE, 0.85, 0.9);
        this.ringXZ(lx, top + 2.45, lz, 0.25, LAMP, 1.3, 1, 8);
        this.ringXZ(lx, top + 2.2, lz, 0.12, LAMP, 0.85, 0.9, 6);
      }
      // the wall the terrace stands on
      this.rect(side * HALF, 0, side * WIDE, RISE, TOP, STONE, 1.05, 0.85);
      for (let y = 1.5; y < RISE; y += 1.5) this.path([side * (HALF + 1.6), y, TOP, side * WIDE, y, TOP], V.blueDim, 0.6, 0.45);
    }
  }

  private building(): void {
    const r = rng(1789);
    // the terrace's edge, and the face behind
    this.path([-WIDE, RISE, TOP, WIDE, RISE, TOP], V.blue, 1.6);
    this.rect(-WIDE, RISE, WIDE, ROOF, FACE, STONE, 1.3, 0.9);
    for (const x of [-WIDE, WIDE]) this.path([x, RISE, TOP, x, RISE, FACE], STONE, 0.85, 0.8);
    // the columns, what they carry, and the gable over that
    const cap = RISE + COL_H;
    for (const x of COLS) {
      this.post(x, COL_Z, COL_R, RISE, cap, mix(V.blue, V.white, 0.3), 1.05, 0.9, 8, 2);
      this.slab(x - 0.7, COL_Z - 0.7, x + 0.7, COL_Z + 0.7, cap, V.blue, 1.05);
      this.slab(x - 0.6, COL_Z - 0.6, x + 0.6, COL_Z + 0.6, RISE + 0.25, V.blue, 0.85, 0.9);
    }
    this.box({ x0: -10, x1: 10, y0: cap, y1: cap + 1.5, z0: COL_Z - 0.6, z1: COL_Z + 0.6 }, V.blue, 1.3);
    this.path([-10.6, cap + 1.5, COL_Z + 0.6, 0, cap + 5.6, COL_Z + 0.6, 10.6, cap + 1.5, COL_Z + 0.6], V.blue, 1.6);
    this.path([-8, cap + 1.9, COL_Z + 0.6, 0, cap + 4.7, COL_Z + 0.6, 8, cap + 1.9, COL_Z + 0.6], V.blueMid, 0.85, 0.8, true);
    for (const x of [-10, 10]) this.path([x, cap + 1.5, COL_Z - 0.6, x, cap + 1.5, FACE], V.blueMid, 0.85, 0.7);
    // the door: two tall leaves, lit from inside, a lamp either side
    for (const [x0, x1] of [[-1.3, 0], [0, 1.3]]) this.rect(x0, RISE, x1, RISE + 3.3, FACE, LAMP, 1.3);
    this.path([-1.6, RISE, FACE, -1.6, RISE + 3.7, FACE, 1.6, RISE + 3.7, FACE, 1.6, RISE, FACE], V.white, 1.05, 0.9);
    for (const x of [-0.12, 0.12]) this.seg(x, RISE + 1.3, FACE, x, RISE + 1.7, FACE, V.white, 1.6);
    for (const x of [-2.6, 2.6]) {
      this.ringXZ(x, RISE + 2.6, FACE + 0.3, 0.2, LAMP, 1.3, 1, 8);
      this.path([x, RISE + 2.6, FACE, x, RISE + 2.6, FACE + 0.3], STONE, 0.85, 0.9);
    }
    // flag poles (the flags themselves move), and the windows
    for (const x of [-5.6, 5.6]) this.path([x, RISE + 3.5, FACE, x, RISE + 6.4, FACE + 1.2], STONE, 1.05, 0.9);
    for (const row of [0, 1])
      for (let x = -WIDE + 3; x < WIDE - 3; x += 4.5) {
        if (Math.abs(x + 1.25) < 4 && row === 0) continue;
        const y = RISE + 2 + row * 7, lit = r() > 0.6;
        this.rect(x, y, x + 2.5, y + 4, FACE, lit ? mix(LAMP, "#000000", 0.35) : V.blueDim, lit ? 1.05 : 0.6, lit ? 0.8 : 0.5);
        this.path([x + 1.25, y, FACE, x + 1.25, y + 4, FACE], V.blueDim, 0.6, 0.45);
      }
    this.path([-WIDE, ROOF + 0.8, FACE, WIDE, ROOF + 0.8, FACE], STONE, 1.05, 0.8);
    // what stands either side of it and behind
    for (const [cx, cz, w, dp, h] of [[-62, -92, 50, 30, 38], [64, -96, 54, 30, 52], [-20, -170, 60, 30, 90], [70, -180, 40, 30, 120], [-110, -160, 40, 40, 70]]) this.block(r, cx, cz, w, dp, h);
  }
}
