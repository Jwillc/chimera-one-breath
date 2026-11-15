/**
 * The things people have about them (a hat, glasses, a cigar, a drink, a phone), and what becomes
 * of one when its owner is shot: it is let go with the speed of the place it sat, thrown by the
 * bullet that went by it, and from there it is a small rigid body that falls, tumbles, bounces and
 * comes to rest (or breaks, or lands in water and floats or sinks). Nothing about where it ends up
 * is written down: it comes out of the step below.
 *
 * A thing is drawn from the same lines whether it is worn or loose. Metres, seconds, y up; a
 * thing's own frame is about its centre of mass. No screen and no sound here: what happens to a
 * thing is reported to whoever made the `Things`.
 */
import * as THREE from "three";
import { V } from "../ui/colors.ts";
import type { Trait } from "./place.ts";

export const G = 9.81;
/** the longest step the bodies are moved by (s) */
const STEP = 1 / 240;
/** how far from a bullet's line its push has fallen to 1/e (m) */
const REACH = 0.22;

export interface Shape {
  kind: Trait;
  /** worn on the head (in the head's frame) or held in the right hand (in the body's) */
  on: "head" | "hand";
  /** where its centre is from the head's origin, or from the hand (m); `reach` more of it lies along the hand */
  at: [number, number, number];
  reach: number;
  /** its lines, x0 y0 z0 x1 y1 z1 each, and each one's colour, width and brightness */
  segs: number[];
  color: string[];
  width: number[];
  alpha: number[];
  /** how many of its lines are left when what it held has run out of it */
  dry: number;
  /** the points of it that can touch the ground */
  pts: number[];
  /** where smoke rises or drink runs from */
  lip: [number, number, number];
  /** radius of gyration (m): how hard it is to turn, for its weight */
  gyr: number;
  /** air drag for its weight (1/m): its terminal speed is the root of G over this */
  drag: number;
  /** how much of its speed it keeps off hard ground, and how the ground grips it */
  bounce: number;
  grip: number;
  floats: boolean;
  /** the blow on hard ground that breaks it (m/s) */
  breaks: number;
  /** the speed a bullet passing through its middle would give it (m/s) */
  blast: number;
}

/** a thing that has left its owner */
export interface Loose {
  shape: Shape;
  readonly pos: THREE.Vector3;
  readonly q: THREE.Quaternion;
  readonly v: THREE.Vector3;
  /** how it turns: its axis, as long as its rate (rad/s) */
  readonly w: THREE.Vector3;
  age: number;
  /** come to rest */
  rest: boolean;
  still: number;
  /** it has gone into water */
  wet: boolean;
  /** drops of drink still in it */
  liquid: number;
  knocks: number;
  gone: boolean;
  seed: number;
}

export interface ThingEvent {
  /** it struck the ground, broke on it, went into water, or let a drop of drink go */
  what: "knock" | "break" | "splash" | "spill";
  thing: Loose;
  /** how hard (m/s) */
  speed: number;
  /** where, and (for a drop) how it is moving: read now, not kept */
  at: THREE.Vector3;
  vel: THREE.Vector3;
}

/** what a thing falls onto (every `Place` is one) */
export interface Ground {
  floor(x: number, z: number): number;
  /** the height of the water's surface over (x, z), if there is water there */
  water(x: number, z: number): number | null;
  /** earth, not stone: nothing bounces much or breaks */
  readonly soft: boolean;
}

export interface Lines {
  seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha?: number): void;
}

class Pen {
  readonly segs: number[] = [];
  readonly color: string[] = [];
  readonly width: number[] = [];
  readonly alpha: number[] = [];
  constructor(private readonly c: [number, number, number], private readonly k: number) {}
  /** a line between two points given about `c`'s origin, in units of `k` metres */
  line(a: number[], b: number[], color: string, width: number, alpha = 1): void {
    const { c, k } = this;
    this.segs.push((a[0] - c[0]) * k, (a[1] - c[1]) * k, (a[2] - c[2]) * k, (b[0] - c[0]) * k, (b[1] - c[1]) * k, (b[2] - c[2]) * k);
    this.color.push(color);
    this.width.push(width);
    this.alpha.push(alpha);
  }
  lines(): Pick<Shape, "segs" | "color" | "width" | "alpha"> {
    return { segs: this.segs, color: this.color, width: this.width, alpha: this.alpha };
  }
  pt(a: number[]): [number, number, number] {
    return [(a[0] - this.c[0]) * this.k, (a[1] - this.c[1]) * this.k, (a[2] - this.c[2]) * this.k];
  }
}

/**
 * The thing that tells someone apart, as lines: `s` is their size against the adult male, `u` the
 * metres in one cm of their head. (A tie is clothing: it stays on.)
 */
export function thingOf(trait: Trait, s: number, u: number): Shape | null {
  const ring = (n: number, f: (c: number, sn: number) => number[]) => Array.from({ length: n }, (_, i) => f(Math.cos((i / n) * Math.PI * 2), Math.sin((i / n) * Math.PI * 2)));
  const loop = (pen: Pen, pts: number[][], color: string, width: number, alpha = 1) => pts.forEach((a, i) => pen.line(a, pts[(i + 1) % pts.length], color, width, alpha));
  if (trait === "hat") {
    // a brim, the band where the crown meets it, the crown's top (the head's cm)
    const c: [number, number, number] = [0.5, 23.5, 0], pen = new Pen(c, u), n = 14, brim = 21, top = 27.5;
    const outer = ring(n, (a, b) => [0.5 + 15 * a, brim, 13 * b]), inner = ring(n, (a, b) => [0.5 + 9.6 * a, brim, 8.3 * b]), crown = ring(n, (a, b) => [0.5 + 8.6 * a, top, 7.2 * b]);
    loop(pen, outer, V.white, 1.6);
    loop(pen, inner, V.white, 1.05);
    loop(pen, crown, V.white, 1.3);
    for (let i = 0; i < n; i += 2) pen.line(inner[i], crown[i], V.white, 1.05);
    pen.line([-6, top - 0.6, 0], [7, top - 0.6, 0], V.white, 0.85, 0.8);
    const pts = [...ring(8, (a, b) => [0.5 + 15 * a, brim, 13 * b]), ...ring(4, (a, b) => [0.5 + 8.6 * a, top, 7.2 * b])].flatMap((p) => pen.pt(p));
    return { kind: trait, on: "head", at: [c[0] * u, c[1] * u, c[2] * u], reach: 0, ...pen.lines(), dry: pen.color.length, pts, lip: [0, 0, 0], gyr: 9 * u, drag: 0.8, bounce: 0.15, grip: 0.6, floats: true, breaks: Infinity, blast: 5 };
  }
  if (trait === "glasses") {
    const c: [number, number, number] = [8, 15.4, 0], pen = new Pen(c, u), pts: number[] = [];
    for (const side of [-1, 1]) {
      loop(pen, ring(8, (a, b) => [9.6, 15.2 + 2.7 * b, side * 3.3 + 2.7 * a]), V.amber, 1.6);
      pen.line([9.6, 15.6, side * 6], [1.5, 16, side * 7.6], V.amber, 1.3);
      for (const p of [[9.6, 12.5, side * 3.3], [9.6, 17.9, side * 3.3], [9.6, 15.2, side * 6], [1.5, 16, side * 7.6]]) pts.push(...pen.pt(p));
    }
    pen.line([9.6, 15.8, -0.6], [9.6, 15.8, 0.6], V.amber, 1.6);
    return { kind: trait, on: "head", at: [c[0] * u, c[1] * u, c[2] * u], reach: 0, ...pen.lines(), dry: pen.color.length, pts, lip: [0, 0, 0], gyr: 4.5 * u, drag: 0.15, bounce: 0.3, grip: 0.5, floats: false, breaks: Infinity, blast: 4 };
  }
  if (trait === "cigar") {
    const a = [8.6, 8, 1], b = [15.2, 7.1, 1.8], tip = [16.4, 6.95, 1.95], c: [number, number, number] = [12.5, 7.5, 1.5], pen = new Pen(c, u);
    pen.line(a, b, V.white, 1.6);
    pen.line(b, tip, V.red, 2.1);
    return { kind: trait, on: "head", at: [c[0] * u, c[1] * u, c[2] * u], reach: 0, ...pen.lines(), dry: 2, pts: [...pen.pt(a), ...pen.pt(tip)], lip: pen.pt(tip), gyr: 2.4 * u, drag: 0.2, bounce: 0.2, grip: 0.6, floats: true, breaks: Infinity, blast: 3 };
  }
  if (trait === "drink") {
    // a glass: its foot, its rim, three staves; then what is in it, which runs out
    const pen = new Pen([0, 0.06, 0], s), r = 0.036;
    const hoop = (y: number) => ring(6, (a, b) => [a * r, y, b * r]);
    loop(pen, hoop(0), V.amber, 1.05);
    loop(pen, hoop(0.12), V.white, 1.05);
    for (let i = 0; i < 3; i++) pen.line([Math.cos(i * 2.1) * r, 0, Math.sin(i * 2.1) * r], [Math.cos(i * 2.1) * r, 0.12, Math.sin(i * 2.1) * r], V.amber, 0.85, 0.9);
    const dry = pen.color.length;
    loop(pen, hoop(0.055), V.amber, 1.6);
    const pts = [...ring(4, (a, b) => [a * r, 0, b * r]), ...ring(4, (a, b) => [a * r, 0.12, b * r])].flatMap((p) => pen.pt(p));
    return { kind: trait, on: "hand", at: [0, 0.06 * s, 0], reach: 0.06 * s, ...pen.lines(), dry, pts, lip: [0, 0.06 * s, 0], gyr: 0.045 * s, drag: 0.03, bounce: 0.3, grip: 0.4, floats: false, breaks: 2.2, blast: 2.5 };
  }
  if (trait === "phone") {
    // held up along the side of the head
    const w = 0.065 * s + 0.01, h = 0.16 * s + 0.02, pen = new Pen([0, 0, 0], 1);
    const box = [[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]];
    loop(pen, box, V.pink, 1.6);
    return { kind: trait, on: "hand", at: [w / 2 - 0.01, h / 2 - 0.02, 0], reach: 0, ...pen.lines(), dry: 4, pts: box.flat(), lip: [0, 0, 0], gyr: 0.05 * s, drag: 0.05, bounce: 0.35, grip: 0.45, floats: false, breaks: Infinity, blast: 2.5 };
  }
  return null;
}

const m3 = new THREE.Matrix4(), tq = new THREE.Quaternion();
const r = new THREE.Vector3(), n = new THREE.Vector3(), vc = new THREE.Vector3(), cr = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3();

/** A thing's lines, where it is and as it is turned; `full`: with what it holds still in it. */
export function drawShape(to: Lines, s: Shape, pos: THREE.Vector3, q: THREE.Quaternion, white = false, full = true, alpha = 1): void {
  const e = m3.makeRotationFromQuaternion(q).elements, g = s.segs, count = full ? s.color.length : s.dry;
  for (let i = 0, j = 0; i < count; i++, j += 6) {
    const x0 = g[j], y0 = g[j + 1], z0 = g[j + 2], x1 = g[j + 3], y1 = g[j + 4], z1 = g[j + 5];
    to.seg(pos.x + e[0] * x0 + e[4] * y0 + e[8] * z0, pos.y + e[1] * x0 + e[5] * y0 + e[9] * z0, pos.z + e[2] * x0 + e[6] * y0 + e[10] * z0, pos.x + e[0] * x1 + e[4] * y1 + e[8] * z1, pos.y + e[1] * x1 + e[5] * y1 + e[9] * z1, pos.z + e[2] * x1 + e[6] * y1 + e[10] * z1, white ? V.white : s.color[i], s.width[i], s.alpha[i] * alpha);
  }
}

/** smoke from a cigar's end: a line that wanders as it climbs */
export function smoke(to: Lines, x: number, y: number, z: number, clock: number, seed: number, alpha = 1): void {
  let px = x, py = y, pz = z;
  for (let i = 0; i < 9; i++) {
    const nx = x + 0.035 * i * Math.sin(clock * 1.7 + i * 0.9 + seed), ny = y + 0.075 * (i + 1), nz = z + 0.03 * i * Math.cos(clock * 1.3 + i * 1.1);
    to.seg(px, py, pz, nx, ny, nz, V.white, 0.85, 0.55 * (1 - i / 9) * alpha);
    px = nx;
    py = ny;
    pz = nz;
  }
}

/**
 * What a bullet going by does to a thing at `c`: pushed along the bullet's way and out from its
 * line, hard if the line goes through it and hardly at all a couple of hand's breadths off.
 * `o` is any point on the line, `d` its direction (unit). Adds to v and w.
 */
export function thrown(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, blast: number, v: THREE.Vector3, w: THREE.Vector3, random: () => number = Math.random): void {
  const along = r.copy(c).sub(o).dot(d);
  n.copy(o).addScaledVector(d, along).sub(c).negate();
  const off = n.length(), push = blast * Math.exp(-off / REACH);
  if (off > 1e-6) n.multiplyScalar(0.7 / off);
  n.add(d).normalize();
  v.addScaledVector(n, push);
  // (and sets it tumbling, about no axis in particular)
  cr.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
  w.addScaledVector(cr, 3 * push);
}

export class Things {
  readonly list: Loose[] = [];
  private clock = 0;

  constructor(private readonly on: (e: ThingEvent) => void = () => {}, private readonly random: () => number = Math.random) {}

  clear(): void {
    this.list.length = 0;
  }

  /** A thing leaves its owner: where it is, how it is turned, how it moves and turns. */
  release(shape: Shape, pos: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3, w: THREE.Vector3): Loose {
    const t: Loose = { shape, pos: pos.clone(), q: q.clone(), v: v.clone(), w: w.clone(), age: 0, rest: false, still: 0, wet: false, liquid: shape.kind === "drink" ? 14 : 0, knocks: 0, gone: false, seed: this.random() * 100 };
    this.list.push(t);
    if (this.list.length > 12) this.list.shift();
    return t;
  }

  /** what it has, for its weight: its motion, its turning and its height (J/kg) */
  energy(t: Loose): number {
    return 0.5 * t.v.lengthSq() + 0.5 * t.shape.gyr ** 2 * t.w.lengthSq() + G * t.pos.y;
  }

  update(dt: number, ground: Ground): void {
    this.clock += dt;
    for (let left = Math.min(dt, 0.1); left > 1e-9; left -= STEP) {
      const h = Math.min(STEP, left);
      for (const t of this.list) if (!t.rest && !t.gone) this.step(t, h, ground);
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].gone) this.list.splice(i, 1);
  }

  private tell(what: ThingEvent["what"], thing: Loose, speed: number, at: THREE.Vector3, vel: THREE.Vector3): void {
    this.on({ what, thing, speed, at, vel });
  }

  private step(t: Loose, h: number, ground: Ground): void {
    const s = t.shape, p = t.pos, v = t.v, w = t.w, k2 = s.gyr * s.gyr;
    t.age += h;
    const level = ground.water(p.x, p.z), under = level !== null && p.y < level;
    if (under && !t.wet) {
      t.wet = true;
      t.liquid = 0;
      this.tell("splash", t, v.length(), r.set(p.x, level, p.z), v);
      v.multiplyScalar(0.45);
      w.multiplyScalar(0.5);
    }
    if (under) {
      // water: what floats is borne up the harder the deeper it is, the rest sinks slowly; all of it is slowed
      const depth = level - p.y;
      v.y += (s.floats ? G * (Math.min(4, depth / 0.03) - 1) : -0.35 * G) * h;
      const slow = Math.exp(-5 * h);
      v.multiplyScalar(slow);
      w.multiplyScalar(slow);
    } else {
      v.y -= G * h;
      v.multiplyScalar(1 / (1 + s.drag * v.length() * h));
      w.multiplyScalar(Math.exp(-(0.4 + 2 * s.drag) * h));
    }
    p.addScaledVector(v, h);
    const turn = w.length();
    if (turn > 1e-6) t.q.premultiply(tq.setFromAxisAngle(cr.copy(w).divideScalar(turn), turn * h)).normalize();
    if (p.y < -500) {
      // out of the world (over an edge with nothing under it)
      t.gone = true;
      return;
    }

    // a glass tipped or shaken lets its drink go, drop by drop
    if (t.liquid > 0) {
      up.set(0, 1, 0).applyQuaternion(t.q);
      if (this.random() < h * (4 + 70 * (1 - up.y))) {
        t.liquid--;
        r.set(...s.lip).applyQuaternion(t.q);
        vc.copy(v).add(cr.crossVectors(w, r)).addScaledVector(up, 0.6);
        this.tell("spill", t, 0, r.add(p), vc);
      }
    }

    // the ground: which way it faces here (a flight of steps slopes; an edge is not a slope)
    const e = 0.05, gx = (ground.floor(p.x + e, p.z) - ground.floor(p.x - e, p.z)) / (2 * e), gz = (ground.floor(p.x, p.z + e) - ground.floor(p.x, p.z - e)) / (2 * e);
    if (gx * gx + gz * gz < 2) n.set(-gx, 1, -gz).normalize();
    else n.set(0, 1, 0);
    const soft = ground.soft || t.wet, bounce = soft ? 0.25 * s.bounce : s.bounce, grip = ground.soft ? 1.5 * s.grip : s.grip;
    const rot = m3.makeRotationFromQuaternion(t.q).elements, pts = s.pts;
    const reach = (i: number, out: THREE.Vector3) => out.set(rot[0] * pts[i] + rot[4] * pts[i + 1] + rot[8] * pts[i + 2], rot[1] * pts[i] + rot[5] * pts[i + 1] + rot[9] * pts[i + 2], rot[2] * pts[i] + rot[6] * pts[i + 1] + rot[10] * pts[i + 2]);
    // the point of it that is deepest in the ground strikes first, and is the one that bounces
    let deepest = -1, deep = 0;
    for (let i = 0; i < pts.length; i += 3) {
      reach(i, r);
      const pen = ground.floor(p.x + r.x, p.z + r.z) - (p.y + r.y);
      if (pen > deep) {
        deep = pen;
        deepest = i;
      }
    }
    if (deepest < 0) {
      t.still = 0;
      return;
    }
    let blow = 0;
    for (let k = -3; k < pts.length; k += 3) {
      const i = k < 0 ? deepest : k;
      if (k === deepest) continue;
      reach(i, r);
      if (k >= 0 && ground.floor(p.x + r.x, p.z + r.z) - (p.y + r.y) <= 0) continue;
      // how fast this point of it is going into the ground
      vc.copy(v).add(cr.crossVectors(w, r));
      const vn = vc.dot(n);
      if (vn >= 0) continue;
      const rn = cr.crossVectors(r, n), jn = (-(1 + (k < 0 && vn < -0.5 ? bounce : 0)) * vn) / (1 + rn.lengthSq() / k2);
      v.addScaledVector(n, jn);
      w.addScaledVector(rn, jn / k2);
      if (k < 0) blow = -vn;
      // and the ground's grip on it: no more than would stop it sliding
      vc.copy(v).add(cr.crossVectors(w, r));
      tan.copy(vc).addScaledVector(n, -vc.dot(n));
      const slide = tan.length();
      if (slide > 1e-6) {
        tan.divideScalar(slide);
        const rt = cr.crossVectors(r, tan), jt = Math.min(grip * jn, slide / (1 + rt.lengthSq() / k2));
        v.addScaledVector(tan, -jt);
        w.addScaledVector(rt, -jt / k2);
      }
    }
    p.y += deep;
    w.multiplyScalar(Math.exp(-2.5 * h));
    if (blow > s.breaks && !soft) {
      t.gone = true;
      this.tell("break", t, blow, p, v);
      return;
    }
    if (blow > 0.6 && t.knocks < 5) {
      t.knocks++;
      this.tell("knock", t, blow, p, v);
    }
    if (v.length() < 0.15 && w.length() * s.gyr < 0.15) {
      t.still += h;
      if (t.still > 0.35) {
        t.rest = true;
        v.set(0, 0, 0);
        w.set(0, 0, 0);
      }
    } else t.still = 0;
  }

  draw(to: Lines): void {
    for (const t of this.list) {
      drawShape(to, t.shape, t.pos, t.q, false, t.liquid > 0);
      if (t.shape.kind === "cigar" && !t.wet && t.age < 9) {
        r.set(...t.shape.lip).applyQuaternion(t.q).add(t.pos);
        smoke(to, r.x, r.y, r.z, this.clock, t.seed, 1 - t.age / 9);
      }
    }
  }
}
