/**
 * A place a contract happens in: what the scope looks at, where the rifle is, where people can
 * be and how they get out, and what a bullet's line meets. Each of the game's five places (the
 * condo, the rooftop pool, the steps, the drive along the river, the camp in the woods) is a
 * `Scene`: everything fixed is drawn once into its own lines, the rest each frame.
 *
 * Metres, y up. At yaw 0 the scope looks down −z.
 */
import * as THREE from "three";
import { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import type { Kind } from "./sound.ts";

export type Trait = "hat" | "tie" | "drink" | "phone" | "glasses" | "cigar";

/** somewhere to be: where, the way to face (forward is (cos th, sin th) over x and z), and what kind of place it is */
export interface Spot {
  x: number;
  z: number;
  th: number;
  sit?: boolean;
  /** open ground: somewhere to stroll to, in a straight line from any other open spot */
  open?: boolean;
  /** filled before any other */
  must?: boolean;
  /** whoever starts here walks this way, at `pace` times a walk, and is gone at the end of it */
  route?: { x: number; z: number }[];
  pace?: number;
  /** the target is one of the people who start at a spot marked so (anyone, if none is) */
  mark?: boolean;
}

export interface Impact {
  /** how far along the line (m) */
  t: number;
  /** what stopped it (null: nothing did, it is gone into the night) */
  what: string | null;
  /** near enough to the people for them to know they are being shot at */
  heard: boolean;
}
export interface Crossing {
  t: number;
  x: number;
  y: number;
  z: number;
}
export interface Box {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
}

/**
 * How a contract opens, where the place is worth showing from outside first: the view goes slowly
 * round the rifle and whatever carries it, with a few words on what is different here, then in at
 * the scope.
 */
export interface Opening {
  /** what is different here, and (a line or two, each short enough for a narrow window) what to do about it */
  rule: string;
  more: string[];
  /** how long the round takes (s), and how far round it goes (rad), ending behind the rifle */
  orbit: number;
  sweep: number;
  /** the middle of what it goes round, from the scope's eye; how far off it starts and ends, and how high over that middle */
  centre: [number, number, number];
  far: number;
  near: number;
  high: number;
  low: number;
}

export interface Place {
  /** as the gauges name it */
  readonly name: string;
  readonly opening: Opening | null;
  /** the rifle stands on its bipod here (not when it is held out of a window) */
  readonly bipod: boolean;
  /** whoever else is with the rifle (a driver): where their head is this frame, for the game to put one there */
  readonly driver: { pos: THREE.Vector3; q: THREE.Quaternion } | null;
  /** the handler's first line here (a clip's id) */
  readonly intro: string;
  /** when the target gets away: under the banner, and on the card */
  readonly lost: { banner: string; card: string };
  readonly group: THREE.Group;
  readonly spots: Spot[];
  /** how far the scope turns (radians) */
  readonly yaw: [number, number];
  readonly pitch: [number, number];
  /** where the people are, as the scope points: the menu rests here */
  readonly home: { yaw: number; pitch: number };
  /** how near (m) a voice is at full level: the people are heard as if by a long microphone */
  readonly hear: number;
  /** how unsteady the rifle's rest is (1: lying still) */
  readonly rough: number;
  /** the things that can tell someone apart here, what they talk like, and whether they are all men */
  readonly traits: Trait[] | null;
  readonly chat: Kind;
  readonly men: boolean;
  /** called for each sound the place itself makes (the game plays it) */
  sound: ((name: string, rate: number, level: number) => void) | null;
  /** how many people the n-th time round (0 first), and how many of them wander */
  people(lap: number): { n: number; strollers: number };
  /** a new contract */
  reset(): void;
  /** where the scope's eye is now */
  eye(out: THREE.Vector3): THREE.Vector3;
  /** a jolt to the rifle from whatever it rests on (radians of pitch) */
  tilt(): number;
  /** where the scope points when the contract starts: somewhere near, not on them */
  look(): { yaw: number; pitch: number };
  /** how high the ground is at (x, z) */
  floor(x: number, z: number): number;
  /** how high the water's surface is over (x, z), where there is water (the ground there is its bed) */
  water(x: number, z: number): number | null;
  /** earth underfoot, not stone or boards: what falls on it does not bounce much or break */
  readonly soft: boolean;
  /** how someone gets away: the points to run through, the last one the way out */
  wayOut(p: { x: number; z: number; sit: number }): { x: number; z: number }[];
  /** the first thing that is not a person on the line from o along d (unit) */
  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact;
  /** where that line goes through glass, if it does */
  glass(o: THREE.Vector3, d: THREE.Vector3): Crossing | null;
  shatter(c: Crossing): void;
  /** the chance has passed (whether or not the target is still there) */
  over(): boolean;
  update(dt: number): void;
  /** this frame's moving lines; `outside`: how much is seen of what the rifle is in (0 through the scope, 1 from outside it) */
  draw(B: Beams, outside: number): void;
  setResolution(w: number, h: number): void;
  dispose(): void;
}

/** what every place has: its fixed lines and the pens that draw them */
export abstract class Scene implements Place {
  abstract readonly name: string;
  abstract readonly intro: string;
  abstract readonly lost: { banner: string; card: string };
  abstract readonly spots: Spot[];
  abstract readonly yaw: [number, number];
  abstract readonly pitch: [number, number];
  abstract readonly home: { yaw: number; pitch: number };
  abstract readonly hear: number;
  readonly rough: number = 1;
  readonly traits: Trait[] | null = null;
  readonly chat: Kind = "chat";
  readonly men: boolean = false;
  readonly soft: boolean = false;
  readonly opening: Opening | null = null;
  readonly bipod: boolean = true;
  readonly driver: { pos: THREE.Vector3; q: THREE.Quaternion } | null = null;
  sound: ((name: string, rate: number, level: number) => void) | null = null;
  readonly group = new THREE.Group();
  protected readonly fixed = new Beams({ fog: false });
  protected clock = 0;

  constructor() {
    this.group.add(this.fixed.group);
  }

  /** draw the fixed lines (a subclass calls this once, when its own fields are set) */
  protected build(draw: () => void): void {
    this.fixed.begin();
    draw();
    this.fixed.end();
  }

  abstract people(lap: number): { n: number; strollers: number };
  abstract eye(out: THREE.Vector3): THREE.Vector3;
  abstract floor(x: number, z: number): number;
  abstract wayOut(p: { x: number; z: number; sit: number }): { x: number; z: number }[];
  abstract raycast(o: THREE.Vector3, d: THREE.Vector3): Impact;

  reset(): void {}
  tilt(): number {
    return 0;
  }
  look(): { yaw: number; pitch: number } {
    return { yaw: this.home.yaw + (Math.random() - 0.5) * 0.24, pitch: this.home.pitch + 0.08 + Math.random() * 0.07 };
  }
  water(_x: number, _z: number): number | null {
    return null;
  }
  glass(_o: THREE.Vector3, _d: THREE.Vector3): Crossing | null {
    return null;
  }
  shatter(_c: Crossing): void {}
  over(): boolean {
    return false;
  }
  update(dt: number): void {
    this.clock += dt;
  }
  draw(_B: Beams, _outside: number): void {}
  setResolution(w: number, h: number): void {
    this.fixed.setResolution(w, h);
  }
  dispose(): void {
    this.fixed.dispose();
  }

  // ------------------------------------------------------------------ pens for the fixed drawing
  protected seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha = 1): void {
    this.fixed.seg(x0, y0, z0, x1, y1, z1, color, width, alpha);
  }

  protected path(pts: number[], color: string, width: number, alpha = 1, close = false): void {
    this.fixed.line(pts, pts.length / 3, color, width, { alpha, close });
  }

  /** a rectangle standing in the plane z */
  protected rect(x0: number, y0: number, x1: number, y1: number, z: number, color: string, width: number, alpha = 1): void {
    this.path([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], color, width, alpha, true);
  }

  /** a rectangle lying at the height y */
  protected slab(x0: number, z0: number, x1: number, z1: number, y: number, color: string, width: number, alpha = 1): void {
    this.path([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], color, width, alpha, true);
  }

  protected box(b: Box, color: string, width: number, alpha = 1): void {
    for (const y of [b.y0, b.y1]) this.slab(b.x0, b.z0, b.x1, b.z1, y, color, width, alpha);
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) this.path([x, b.y0, z, x, b.y1, z], color, width, alpha);
  }

  protected ringXZ(x: number, y: number, z: number, r: number, color: string, width: number, alpha = 1, n = 10): void {
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push(x + Math.cos((i / n) * Math.PI * 2) * r, y, z + Math.sin((i / n) * Math.PI * 2) * r);
    this.path(p, color, width, alpha, true);
  }

  /** a post: rings up it, joined by lines */
  protected post(x: number, z: number, r: number, y0: number, y1: number, color: string, width: number, alpha = 1, sides = 6, rings = 2): void {
    for (let k = 0; k < rings; k++) this.ringXZ(x, y0 + ((y1 - y0) * k) / Math.max(1, rings - 1), z, r, color, width, alpha, sides);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      this.path([x + Math.cos(a) * r, y0, z + Math.sin(a) * r, x + Math.cos(a) * r, y1, z + Math.sin(a) * r], color, width, alpha);
    }
  }

  /** a chair standing on the height y, facing th */
  protected chair(x: number, y: number, z: number, th: number, color = mix(V.blue, V.white, 0.3)): void {
    const c = Math.cos(th), s = Math.sin(th);
    const at = (f: number, side: number, h: number): [number, number, number] => [x + c * f - s * side, y + h, z + s * f + c * side];
    const line = (a: [number, number, number], b: [number, number, number], w = 0.85) => this.seg(a[0], a[1], a[2], b[0], b[1], b[2], color, w, 0.9);
    for (const side of [-0.28, 0.28]) {
      line(at(-0.25, side, 0.42), at(0.3, side, 0.42), 1.05);
      line(at(-0.25, side, 0.42), at(-0.42, side, 1.0), 1.05);
      line(at(-0.2, side, 0.42), at(-0.3, side, 0));
      line(at(0.25, side, 0.42), at(0.35, side, 0));
    }
    for (const [f, h] of [[-0.25, 0.42], [0.3, 0.42], [-0.42, 1.0]]) line(at(f, -0.28, h), at(f, 0.28, h));
  }

  /** stars over the half of the sky round the bearing `az` (radians from +x toward +z), and a moon */
  protected sky(seed: number, n = 220, az = -Math.PI / 2, moon: [number, number, number] | null = [150, 190, -640]): void {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = az + (r() - 0.5) * 2.6, el = Math.asin(0.03 + 0.8 * r()), d = 900;
      const x = Math.cos(el) * Math.cos(a) * d, y = Math.sin(el) * d, z = Math.cos(el) * Math.sin(a) * d, bright = r();
      this.seg(x, y, z, x + 1.4, y + 0.4, z, bright > 0.85 ? V.white : V.blue, bright > 0.85 ? 1.05 : 0.6, 0.3 + 0.6 * bright);
    }
    if (!moon) return;
    const MOON = mix(V.amber, V.white, 0.35), [mx, my, mz] = moon, R = 26;
    for (const [rx, ry, cy, alpha, width] of [[R, R, 0, 0.9, 1.3], [R, R * 0.12, 0, 0.3, 0.85], [R * 0.87, R * 0.1, R * 0.5, 0.3, 0.85], [R * 0.87, R * 0.1, -R * 0.5, 0.3, 0.85], [R * 0.45, R, 0, 0.25, 0.85]] as const) {
      const p: number[] = [];
      for (let i = 0; i < 40; i++) p.push(mx + Math.cos((i / 40) * Math.PI * 2) * rx, my + cy + Math.sin((i / 40) * Math.PI * 2) * ry, mz);
      this.path(p, MOON, width, alpha, true);
    }
  }

  /** a far building: a box with a few lit windows on the face toward +z */
  protected block(r: () => number, cx: number, cz: number, w: number, dp: number, h: number, y0 = 0): void {
    const b: Box = { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - dp / 2, z1: cz + dp / 2 };
    this.box(b, V.blueDim, 0.85, 0.55);
    const cols = Math.floor(w / 4), rows = Math.floor(h / 4);
    for (let i = 0; i < cols * rows * 0.07; i++) {
      const x = b.x0 + 2 + Math.floor(r() * cols) * 4, y = y0 + 3 + Math.floor(r() * rows) * 4;
      this.seg(x, y, b.z1, x + 1.6, y, b.z1, r() < 0.7 ? V.amber : V.blue, 1.05, 0.25 + 0.3 * r());
    }
  }

  /** the ledge the rifle rests on, and the roof behind it */
  protected ledge(eye: THREE.Vector3): void {
    const y = eye.y - 0.32;
    this.path([-30, y, -1.6, 30, y, -1.6], V.blueMid, 1.3, 0.9);
    this.path([-30, y, -1.3, 30, y, -1.3], V.blueDim, 0.85, 0.8);
    this.path([-30, y - 0.9, -1.3, 30, y - 0.9, -1.3], V.blueDim, 0.85, 0.7);
    for (let x = -30; x <= 30; x += 3) this.path([x, y - 0.9, -1.3, x, y - 0.9, 4], V.blueDim, 0.6, 0.5);
    for (let z = 0; z <= 4; z += 2) this.path([-30, y - 0.9, z, 30, y - 0.9, z], V.blueDim, 0.6, 0.5);
  }
}

/** a sheet of glass standing in a plane of z, and the holes bullets have made in it */
export class Glass {
  private readonly holes: { x: number; y: number; cracks: Float32Array }[] = [];
  private seed = 1;

  constructor(readonly z: number, readonly x0: number, readonly x1: number, readonly y0: number, readonly y1: number) {}

  mend(): void {
    this.holes.length = 0;
  }

  /** where the line from o along d (unit) goes through it, if it does */
  cross(o: THREE.Vector3, d: THREE.Vector3): Crossing | null {
    if (Math.abs(d.z) < 1e-6) return null;
    const t = (this.z - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
    return t > 0 && x > this.x0 && x < this.x1 && y > this.y0 && y < this.y1 ? { t, x, y, z: this.z } : null;
  }

  /** a bullet goes through here: a hole, and the cracks that run from it */
  shatter(x: number, y: number): void {
    const q = rng(this.seed++ * 2551), spokes = 9 + Math.floor(q() * 4), lines: number[] = [];
    const ends: [number, number][] = [];
    for (let i = 0; i < spokes; i++) {
      // each spoke a crooked line out from the hole
      const a = (i / spokes) * Math.PI * 2 + (q() - 0.5) * 0.4, len = 0.25 + 0.75 * q() * q();
      let px = x + Math.cos(a) * 0.035, py = y + Math.sin(a) * 0.035;
      for (let k = 1; k <= 3; k++) {
        const b = a + (q() - 0.5) * 0.5, r = (len * k) / 3;
        const nx = x + Math.cos(b) * r, ny = Math.max(this.y0, Math.min(this.y1, y + Math.sin(b) * r));
        lines.push(px, py, nx, ny);
        px = nx;
        py = ny;
        if (k === 1) ends.push([nx, ny]);
      }
    }
    // the web: the spokes' first joints, joined round
    for (let i = 0; i < ends.length; i++) {
      const [ax, ay] = ends[i], [bx, by] = ends[(i + 1) % ends.length];
      if (q() < 0.8) lines.push(ax, ay, bx, by);
    }
    this.holes.push({ x, y, cracks: new Float32Array(lines) });
  }

  /** the holes and their cracks, a hair in front of the glass (toward +z) */
  draw(B: Beams): void {
    const z = this.z + 0.02;
    for (const h of this.holes) {
      const c = h.cracks;
      for (let i = 0; i < c.length; i += 4) B.seg(c[i], c[i + 1], z, c[i + 2], c[i + 3], z, V.white, 0.85, 0.75);
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
        B.seg(h.x + Math.cos(a0) * 0.035, h.y + Math.sin(a0) * 0.035, z, h.x + Math.cos(a1) * 0.035, h.y + Math.sin(a1) * 0.035, z, V.white, 1.3, 1);
      }
    }
  }
}

/** cars going by along x at the height y: headlights one way, tail lights the other */
export function traffic(B: Beams, clock: number, y: number, z: number, n = 7, span = 260): void {
  for (let i = 0; i < n; i++) {
    const lane = i % 2, speed = 9 + (i % 3) * 2.5;
    const x = ((((i * 61 + clock * speed) % span) + span) % span) - span / 2, cx = lane ? -x : x, cz = z - lane * 7 - (i % 3) * 1.2;
    const color = lane ? V.red : V.white, front = lane ? -1 : 1;
    B.seg(cx - 2.1, y + 0.7, cz - 0.8, cx + 2.1, y + 0.7, cz - 0.8, V.blueDim, 0.85, 0.8);
    B.seg(cx - 2.1, y + 0.7, cz + 0.8, cx + 2.1, y + 0.7, cz + 0.8, V.blueDim, 0.85, 0.8);
    B.seg(cx - 1.1, y + 1.4, cz, cx + 0.9, y + 1.4, cz, V.blueDim, 0.85, 0.8);
    for (const s of [-0.6, 0.6]) B.seg(cx + front * 2.1, y + 0.7, cz + s, cx + front * 2.5, y + 0.7, cz + s, color, 1.6, 0.9);
  }
}

/** numbers from 0 to 1 that come out the same every time for the same seed (what is drawn once must not change between visits) */
export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where a line (o, unit d) enters a box, or −1. */
export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Box): number {
  let t0 = 0, t1 = Infinity;
  for (const [p, v, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]] as const) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return -1;
      continue;
    }
    const a = (lo - p) / v, c = (hi - p) / v;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Where a line (o, unit d) meets an upright post at (x, z) of radius r between the heights y0 and y1, or −1. */
export function rayPost(o: THREE.Vector3, d: THREE.Vector3, x: number, z: number, r: number, y0: number, y1: number): number {
  const ox = o.x - x, oz = o.z - z, a = d.x * d.x + d.z * d.z;
  if (a < 1e-12) return -1;
  const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a, y = o.y + d.y * t;
  return t > 0 && y >= y0 && y <= y1 ? t : -1;
}

/** the nearest of the boxes and the plane hits: keeps `best` unless (t, what) is nearer */
export function nearer(best: Impact, t: number, what: string, heard = true): Impact {
  return t > 0 && t < best.t ? { t, what, heard } : best;
}
