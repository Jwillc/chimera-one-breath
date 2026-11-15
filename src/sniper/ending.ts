/**
 * Going home: what is shown when the last of the places is done, before the round begins again.
 * Seen through the eyes of whoever has the rifle: down the corridor of a block of flats, in at
 * their own door, a poor small room with a window on the city; the rifle comes off the shoulder
 * (it is not seen before that) and is laid on the table,
 * taken down part by part into its case, the case shut; then the bed, the ceiling, the eyes
 * closing; and, from across the room, the whole of them lying there, saying what there is to say
 * of it. Then black.
 *
 * It has its own lines and its own clock; the game gives it the rifle's parts, a head for the
 * last shot, and the sounds.
 */
import * as THREE from "three";
import { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { rng, type Box } from "./place.ts";
import { drawSeated } from "./crew.ts";

/** how long it lasts (s), and its moments */
export const HOME = 30;
const DOOR_AT = 6.9, OPEN = [7.7, 8.7], LAID = [11.7, 12.7], TAKE = 13.0, EACH = 1.05, SHUT = [18.4, 19.1], EYES = 24.65, SPEAK = 25.6, DARK = [28.3, 29.7];
/** the corridor (it runs along −z) and the room off it, to the right */
const HALL = { half: 0.9, top: 2.5, z0: 3, z1: -14 };
const DOOR = { z0: -7.95, z1: -7.05, top: 2.05, x: 0.95 };
const ROOM: Box = { x0: 1.0, x1: 5.8, y0: 0, y1: 2.5, z0: -10.6, z1: -5.2 };
const PANE = { z0: -9.2, z1: -6.6, y0: 0.9, y1: 2.1 };
const TABLE = { x0: 4.6, x1: 5.6, z0: -8.9, z1: -7.0, y: 0.75 };
const BED = { x0: 2.6, x1: 4.6, z0: -10.5, z1: -9.5, y: 0.5 };
const CASE = { x0: 5.08, x1: 5.48, z0: -8.425, z1: -7.475, y0: TABLE.y, y1: TABLE.y + 0.09 };
const EYE = 1.62, WALL = V.blueMid, DIM = V.blueDim, LAMP = V.amber, WOOD = mix(V.blue, V.white, 0.25), SKIN = mix(V.amber, V.white, 0.55), SLEEVE = mix(V.blue, V.white, 0.55);

/** where the rifle lies on the table (on its side: the scope away, its muzzle to the left), and the order it comes apart in */
const ON_TABLE = { at: new THREE.Vector3(4.84, TABLE.y + 0.03, -8.78), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2) };
/** each part: where its origin goes for it to lie in its place in the case, and what it sounds like coming off */
const PARTS: { part: string; to: [number, number]; say: [string, number, number, number][] }[] = [
  { part: "magazine", to: [5.255, -8.62], say: [["click", 2, 0.25, 0], ["K", 1.3, 0.3, 0.05]] },
  { part: "scope", to: [5.322, -9.04], say: [["click", 1.6, 0.4, 0]] },
  { part: "suppressor", to: [5.28, -7.72], say: [["t", 1.8, 0.25, 0], ["t", 1.7, 0.25, 0.1], ["t", 1.6, 0.25, 0.2]] },
  { part: "barrel", to: [5.28, -8.64], say: [["K", 1.6, 0.2, 0], ["click", 1.1, 0.4, 0.05]] },
  { part: "receiver", to: [5.18, -9.3], say: [["t", 0.9, 0.3, 0]] },
];

export interface PartLine {
  a: number[];
  color: string;
  width: number;
}
/** what the game lends it */
export interface Lent {
  parts: Map<string, PartLine[]>;
  /** a sound of the kit */
  hit(name: string, rate: number, level: number, delay?: number): void;
  /** a spoken line, from somewhere in the room (and its words under the picture) */
  say(id: string, from: THREE.Vector3): void;
  /** a head, there, facing so; it speaks whatever `say` last began */
  head(pos: THREE.Vector3, q: THREE.Quaternion): void;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const span = (t: number, [a, b]: number[]) => smooth((t - a) / (b - a));

/** where the eyes are, and where they look (yaw 0 is down the corridor, −z; negative to the right) */
type Pose = [t: number, x: number, y: number, z: number, yaw: number, pitch: number];
const WALK: Pose[] = [
  [0, 0, EYE, 1.0, 0, 0],
  [6.0, 0, EYE, -7.35, 0, 0],
  [DOOR_AT, -0.5, EYE, -7.5, -Math.PI / 2, -0.2],
  [OPEN[0], -0.5, EYE, -7.5, -Math.PI / 2, -0.2],
  [8.7, -0.5, EYE, -7.5, -Math.PI / 2, -0.04],
  [11.5, 4.02, EYE, -7.95, -Math.PI / 2, -0.2],
  [12.4, 4.02, EYE, -7.95, -Math.PI / 2, -0.76],
  [19.4, 4.02, EYE, -7.95, -Math.PI / 2, -0.76],
  [20.4, 3.9, EYE, -8.4, 0, -0.25],
  [21.3, 3.75, EYE, -9.2, 0.6, -0.35],
  [22.3, 3.95, 1.15, -10.0, Math.PI / 2, -0.1],
  [23.3, 4.28, 0.78, -10.0, Math.PI / 2, 1.42],
  [EYES, 4.28, 0.78, -10.0, Math.PI / 2, 1.42],
];
/** when a foot comes down */
const STEPS = [...Array.from({ length: 11 }, (_, i) => 0.35 + i * 0.52), 6.4, 9.0, 9.5, 10.0, 10.5, 11.0, 11.45, 19.9, 20.5, 21.0];

export class Ending {
  readonly group = new THREE.Group();
  /**
   * The fixed lines, in three lots, because wire hides nothing: the corridor; the room, which from
   * the corridor is seen only through its door; the city, which is seen only through the window.
   */
  private readonly hall = new Beams({ fog: false });
  private readonly flat = new Beams({ fog: false });
  private readonly town = new Beams({ fog: false });
  private fixed = this.hall;
  private readonly doorway = [0, 1, 2, 3].map(() => new THREE.Plane());
  private readonly window = [0, 1, 2, 3].map(() => new THREE.Plane());
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Quaternion();

  constructor() {
    for (const [lines, draw] of [[this.hall, () => this.corridor()], [this.flat, () => this.room()], [this.town, () => this.city()]] as const) {
      this.group.add(lines.group);
      this.fixed = lines;
      lines.begin();
      draw();
      lines.end();
    }
    this.flat.clip(this.doorway);
    this.town.clip(this.window);
  }

  setResolution(w: number, h: number): void {
    for (const lines of [this.hall, this.flat, this.town]) lines.setResolution(w, h);
  }

  dispose(): void {
    for (const lines of [this.hall, this.flat, this.town]) lines.dispose();
  }

  /** What of the fixed lines can be seen from where the picture is taken, at t. */
  private sight(from: THREE.Vector3, t: number): void {
    const inside = from.x >= DOOR.x, open = t >= OPEN[0] + 0.12;
    this.hall.group.visible = t < EYES && from.x < ROOM.x0 + 0.2;
    this.flat.group.visible = this.town.group.visible = open;
    // from the corridor, the room is what shows in the doorway; from anywhere, the city is what shows in the window
    if (inside) for (const p of this.doorway) p.set(UP, 1e6);
    else through(this.doorway, from, DOOR.x, DOOR.z0, DOOR.z1, 0, DOOR.top);
    through(this.window, from, ROOM.x1, PANE.z0, PANE.z1, PANE.y0, PANE.y1);
  }

  /** how dark the picture is (0 to 1), and how far the eyelids are shut */
  shade(t: number): { dark: number; lids: number } {
    return { dark: Math.max(1 - smooth(t / 1.2), span(t, DARK)), lids: Math.min(span(t, [EYES - 0.3, EYES]), 1 - span(t, [EYES, EYES + 0.35])) };
  }

  /** the eyes' place and bearing at t, walking */
  private pose(t: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
    let k = 0;
    while (k < WALK.length - 2 && t > WALK[k + 1][0]) k++;
    const a = WALK[k], b = WALK[k + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    // (a walk is near enough even; a turn eases)
    const s = k === 0 ? u + (smooth(u) - u) * 0.6 : smooth(u), at = (i: number) => a[i] + (b[i] - a[i]) * s;
    return { x: at(1), y: at(2), z: at(3), yaw: at(4), pitch: at(5) };
  }

  /** Put the camera where the picture is taken from at t. */
  camera(cam: THREE.PerspectiveCamera, t: number): void {
    const tall = Math.min(1.45, Math.max(1, 1 / cam.aspect));
    cam.fov = (Math.atan(Math.tan((31 * Math.PI) / 180) * tall) * 360) / Math.PI;
    if (t >= EYES) {
      // from across the room: the bed, the window beyond its head
      // (drawing in, where the picture is wide enough to keep the bed and the window both)
      const k = smooth((t - EYES) / (HOME - EYES)) * (tall > 1.2 ? 0.15 : 1);
      cam.position.set(2.2 + 0.4 * k, 1.75 - 0.2 * k, -5.9 - 1.1 * k);
      cam.lookAt(4.1, 0.75, -9.8);
      this.sight(cam.position, t);
      return;
    }
    const p = this.pose(t), q = this.pose(t - 0.05), speed = Math.hypot(p.x - q.x, p.z - q.z) / 0.05, go = t < 22 ? Math.min(1, speed / 1.2) : 0;
    // each step lifts and sways them a little; at the table the eyes go to whatever the hands are on
    const beat = t / 0.52, to = this.busy(t);
    cam.position.set(p.x + 0.012 * go * Math.sin(Math.PI * beat), p.y + 0.03 * go * Math.abs(Math.sin(Math.PI * beat)), p.z);
    const follow = to ? Math.atan2(to.z - p.z, to.x - p.x) * (tall > 1.2 ? 0.75 : 0.3) * span(t, [12.4, 13]) * (1 - span(t, [19, 19.4])) : 0;
    cam.rotation.set(p.pitch, p.yaw - follow, 0.006 * go * Math.sin(Math.PI * beat), "YXZ");
    this.eye.copy(cam.position);
    this.look.copy(cam.quaternion);
    this.sight(cam.position, t);
  }

  /** where the part now being moved is (null: nothing is) */
  private busy(t: number): THREE.Vector3 | null {
    const i = Math.floor((t - TAKE) / EACH);
    if (t < TAKE || i >= PARTS.length) return t >= SHUT[0] && t < SHUT[1] + 0.4 ? new THREE.Vector3(CASE.x0, CASE.y1, (CASE.z0 + CASE.z1) / 2) : null;
    return this.where(PARTS[i].part, t).clone().add(new THREE.Vector3(0, 0, PARTS[i].part === "suppressor" ? 0.12 : PARTS[i].part === "barrel" ? 0.55 : PARTS[i].part === "scope" ? 1.0 : 1.08));
  }

  /** where a part's origin is at t: with the rifle on the table, on its way, or in the case */
  private where(part: string, t: number): THREE.Vector3 {
    const i = PARTS.findIndex((p) => p.part === part), u = i < 0 ? 0 : smooth((t - (TAKE + i * EACH)) / 0.85);
    const p = ON_TABLE.at.clone();
    if (i < 0 || u <= 0) return p;
    const [x, z] = PARTS[i].to;
    return p.lerp(new THREE.Vector3(x, CASE.y0 + 0.035, z), u).setY(p.y + 0.17 * Math.sin(Math.PI * u));
  }

  /** This frame's moving lines; `done` is what has already sounded. */
  draw(B: Beams, t: number, done: Set<string>, lent: Lent): void {
    const once = (key: string, at: number, f: () => void) => {
      if (t < at || done.has(key)) return;
      done.add(key);
      f();
    };
    STEPS.forEach((at, i) => once(`step${i}`, at, () => lent.hit(i % 2 ? "Pf" : "B", i % 2 ? 0.7 : 0.45, t < 8.8 ? 0.16 : 0.1)));
    // a lamp in the corridor that will not stay lit
    if (Math.sin(t * 23) > -0.3 || Math.sin(t * 3.1) > 0.2) ring(B, 0, HALL.top - 0.03, -6, 0.18, LAMP, 1.6, 0.9);
    this.door(B, t, once, lent);
    this.rifle(B, t, once, lent);
    if (this.flat.group.visible) this.luggage(B, t, once, lent);
    if (t < EYES) this.hands(B, t);
    else this.asleep(B, t, once, lent);
    once("sit", 22.0, () => lent.hit("Pf", 0.5, 0.25));
    once("lie", 22.9, () => {
      lent.hit("B", 0.4, 0.2);
      lent.hit("breath-out", 0.9, 0.6, 0.25);
    });
  }

  // ------------------------------------------------------------------ what moves
  /** their own door: the key, and it swings in */
  private door(B: Beams, t: number, once: (key: string, at: number, f: () => void) => void, lent: Lent): void {
    const a = span(t, OPEN) * 1.75, hx = DOOR.x, hz = DOOR.z0, w = DOOR.z1 - DOOR.z0, ex = hx + Math.sin(a) * w, ez = hz + Math.cos(a) * w;
    B.line([hx, 0, hz, ex, 0, ez, ex, DOOR.top, ez, hx, DOOR.top, hz], 4, WOOD, 1.3, { close: true });
    for (const y of [0.5, 1.55]) B.seg(hx + (ex - hx) * 0.15, y, hz + (ez - hz) * 0.15, hx + (ex - hx) * 0.85, y, hz + (ez - hz) * 0.85, DIM, 0.85, 0.8);
    const kx = hx + (ex - hx) * 0.88, kz = hz + (ez - hz) * 0.88;
    B.seg(kx, 1.0, kz, kx - 0.07 * Math.cos(a), 1.0, kz + 0.07 * Math.sin(a), LAMP, 2.1, 1);
    once("key", 7.15, () => lent.hit("click", 1.9, 0.3));
    once("lock", 7.5, () => lent.hit("click", 1.3, 0.4));
    once("swing", OPEN[0], () => lent.hit("t", 0.6, 0.15));
  }

  /**
   * The rifle: not seen on the way (nobody walks a corridor with one in their hand: it is slung
   * on the back, under the coat); brought round off the shoulder and laid on the table, and then
   * each part to its place in the case.
   */
  private rifle(B: Beams, t: number, once: (key: string, at: number, f: () => void) => void, lent: Lent): void {
    if (t < LAID[0] || t >= SHUT[1]) return;
    const M = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const put = (lines: PartLine[], alpha = 1) => {
      for (const l of lines) {
        const a = v.set(l.a[0], l.a[1], l.a[2]).applyMatrix4(M), ax = a.x, ay = a.y, az = a.z, b = v.set(l.a[3], l.a[4], l.a[5]).applyMatrix4(M);
        B.seg(ax, ay, az, b.x, b.y, b.z, l.color, l.width, alpha);
      }
    };
    // where it hung: down the back from the right shoulder, its muzzle by the hip (it comes round low, not past the face)
    const held = new THREE.Vector3(0.55, -0.95, 0.15).applyQuaternion(this.look).add(this.eye);
    const heldQ = this.look.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.25, 0, 0.1, "YXZ")));
    const lay = span(t, LAID);
    once("laid", LAID[1] - 0.1, () => {
      lent.hit("B", 0.9, 0.25);
      lent.hit("K", 1.1, 0.15, 0.04);
    });
    for (const [part, lines] of lent.parts) {
      const i = PARTS.findIndex((p) => p.part === part);
      if (i >= 0) {
        once(`off-${part}`, TAKE + i * EACH, () => PARTS[i].say.forEach(([name, rate, level, delay]) => lent.hit(name, rate, level, delay)));
        once(`in-${part}`, TAKE + i * EACH + 0.8, () => lent.hit("t", 0.7, 0.14));
      }
      M.compose(held.clone().lerp(this.where(part, t), lay), heldQ.clone().slerp(ON_TABLE.q, lay), one);
      put(lines);
    }
  }

  /** the case on the table: open, and then shut on the rifle */
  private luggage(B: Beams, t: number, once: (key: string, at: number, f: () => void) => void, lent: Lent): void {
    const C = CASE, tray: Box = { x0: C.x0, x1: C.x1, y0: C.y0, y1: C.y1, z0: C.z0, z1: C.z1 }, a = 1.85 * (1 - span(t, SHUT)), w = C.x1 - C.x0;
    box(B, tray, WALL, 1.05, 0.95);
    // the lid, hinged along the far side
    const lx = C.x1 - Math.cos(a) * w, ly = C.y1 + Math.sin(a) * w;
    B.line([C.x1, C.y1, C.z0, lx, ly, C.z0, lx, ly, C.z1, C.x1, C.y1, C.z1], 4, WALL, 1.3, { close: true });
    B.seg((C.x1 + lx) / 2, (C.y1 + ly) / 2, C.z0, (C.x1 + lx) / 2, (C.y1 + ly) / 2, C.z1, DIM, 0.6, 0.6);
    for (const z of [C.z0 + 0.2, C.z1 - 0.2]) B.seg(C.x0, C.y1 - 0.02, z, C.x0, C.y1 - 0.06, z, LAMP, 2.1, 1);
    // its handle, on the near side
    B.line([C.x0, C.y0 + 0.045, -8.05, C.x0 - 0.05, C.y0 + 0.045, -8.02, C.x0 - 0.05, C.y0 + 0.045, -7.88, C.x0, C.y0 + 0.045, -7.85], 4, WALL, 1.05);
    once("shut", SHUT[1] - 0.05, () => lent.hit("B", 1.2, 0.3));
    once("latch1", SHUT[1] + 0.2, () => lent.hit("click", 1.5, 0.4));
    once("latch2", SHUT[1] + 0.45, () => lent.hit("click", 1.7, 0.4));
  }

  /** the hands, as their owner sees them: the left to the lock; then both about the rifle */
  private hands(B: Beams, t: number): void {
    const arm = (side: number, to: THREE.Vector3, alpha: number) => {
      if (alpha <= 0.01) return;
      const from = new THREE.Vector3(side * 0.26, -0.5, -0.02).applyQuaternion(this.look).add(this.eye);
      const elbow = from.clone().lerp(to, 0.5).add(new THREE.Vector3(side * 0.07, -0.08, 0).applyQuaternion(this.look));
      for (const s of [-0.042, 0.042]) {
        const o = new THREE.Vector3(s, 0, 0).applyQuaternion(this.look);
        B.seg(from.x + o.x, from.y + o.y, from.z + o.z, elbow.x + o.x, elbow.y + o.y, elbow.z + o.z, SLEEVE, 1.05, alpha);
        B.seg(elbow.x + o.x, elbow.y + o.y, elbow.z + o.z, to.x + o.x * 0.7, to.y + o.y * 0.7, to.z + o.z * 0.7, SLEEVE, 1.05, alpha);
      }
      // the hand: a palm and four fingers, closing on what it has
      const on = to.clone().sub(elbow).normalize(), across = new THREE.Vector3(1, 0, 0).applyQuaternion(this.look);
      for (let f = -1.5; f <= 1.5; f++) {
        const k = to.clone().addScaledVector(across, f * 0.016), tip = k.clone().addScaledVector(on, 0.07).add(new THREE.Vector3(0, -0.02, 0));
        B.seg(k.x, k.y, k.z, tip.x, tip.y, tip.z, SKIN, 1.3, alpha);
      }
      B.seg(to.x - across.x * 0.03, to.y, to.z - across.z * 0.03, to.x + across.x * 0.03, to.y, to.z + across.z * 0.03, SKIN, 1.3, alpha);
    };
    // the key, to the lock, and the door pushed
    const lock = new THREE.Vector3(DOOR.x - 0.06, 1.02, DOOR.z1 - 0.12);
    arm(-1, lock, span(t, [DOOR_AT - 0.2, DOOR_AT + 0.2]) * (1 - span(t, [OPEN[0], OPEN[0] + 0.5])));
    // at the table: the right hand on whatever is coming off, the left steadying what is left; then both on the lid
    const work = span(t, [LAID[1] - 0.2, LAID[1] + 0.3]) * (1 - span(t, [SHUT[1] + 0.5, SHUT[1] + 0.9])), to = this.busy(t);
    if (work <= 0) return;
    const rest = new THREE.Vector3(4.84, TABLE.y + 0.06, 0), lid = new THREE.Vector3(CASE.x0 + 0.02, CASE.y1 + 0.03, 0);
    const closing = t >= SHUT[0] - 0.3, i = Math.floor((t - TAKE) / EACH), part = i >= 0 && i < PARTS.length ? PARTS[i].part : "";
    // (what is toward the muzzle is the left hand's, what is toward the butt the right's; the other rests on what is left of it)
    const lefts = part === "suppressor" || part === "barrel", on = to ? to.clone().setY(to.y + 0.03) : null;
    arm(1, closing ? lid.clone().setZ(-7.7) : on && !lefts ? on : rest.clone().setZ(-7.32), work);
    arm(-1, closing ? lid.clone().setZ(-8.2) : on && lefts ? on : rest.clone().setZ(t > TAKE + 3 * EACH ? -8.05 : -8.4), work);
  }

  /** from across the room: lying on the bed, a hand behind the head, a knee up; and what they say */
  private asleep(B: Beams, t: number, once: (key: string, at: number, f: () => void) => void, lent: Lent): void {
    const y = BED.y + 0.12, z = -10.0, UP = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(0, 0, 1), breath = 0.012 * Math.sin(t * 1.9);
    const hip = new THREE.Vector3(3.5, y, z), neck = new THREE.Vector3(4.06, y + 0.03 + breath, z);
    drawSeated(B, {
      hip, neck, fwd: UP, right, twist: 0,
      handR: new THREE.Vector3(3.82, y + 0.17 + breath, z + 0.03), handL: new THREE.Vector3(4.34, y + 0.04, z - 0.2),
      legs: { kneeR: new THREE.Vector3(3.05, y - 0.02, z + 0.1), footR: new THREE.Vector3(2.64, y - 0.05, z + 0.12), kneeL: new THREE.Vector3(3.14, y + 0.34, z - 0.1), footL: new THREE.Vector3(2.98, y - 0.07, z - 0.13) },
    }, SLEEVE, 1);
    // the head on the pillow, turned a little to the room
    const d = new THREE.Vector3(0, Math.cos(0.5), Math.sin(0.5)), up = new THREE.Vector3(1, 0, 0);
    lent.head(neck, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, up, d.clone().cross(up))));
    once("say", SPEAK, () => lent.say("male-home-day", neck));
  }

  // ------------------------------------------------------------------ the fixed drawing
  private path(pts: number[], color: string, width: number, alpha = 1, close = false): void {
    this.fixed.line(pts, pts.length / 3, color, width, { alpha, close });
  }

  /** the corridor: its length, a door every few metres, the lamps, the window at its end */
  private corridor(): void {
    const H = HALL, F = this.fixed;
    for (const x of [-H.half, H.half]) for (const y of [0, 0.1, 1.0, H.top]) this.path([x, y, H.z0, x, y, H.z1], y === 0 || y === H.top ? WALL : DIM, y === 0 || y === H.top ? 1.3 : 0.6, y === 1.0 ? 0.45 : 0.8);
    for (let z = Math.ceil(H.z1); z <= H.z0; z++) this.path([-H.half, 0, z, H.half, 0, z], DIM, 0.6, 0.4);
    for (const z of [0, -3, -9, -12]) ring(F, 0, H.top - 0.03, z, 0.18, LAMP, 1.6, 0.9);
    for (const z of [0, -3, -6, -9, -12]) this.path([-0.25, H.top, z, 0.25, H.top, z], DIM, 0.85, 0.7);
    // the end of it: a window on the night, and the way out
    this.path([-H.half, 0, H.z1, H.half, 0, H.z1, H.half, H.top, H.z1, -H.half, H.top, H.z1], WALL, 1.3, 0.9, true);
    this.path([-0.5, 1.0, H.z1, 0.5, 1.0, H.z1, 0.5, 2.0, H.z1, -0.5, 2.0, H.z1], V.blue, 1.05, 0.9, true);
    this.path([0, 1.0, H.z1, 0, 2.0, H.z1], V.blue, 0.85, 0.8);
    this.path([-0.22, 2.25, H.z1, 0.22, 2.25, H.z1], V.green, 2.6, 0.95);
    // the other doors, shut: a frame, a number plate, a handle; under one, a light
    for (const side of [-1, 1]) for (const z of [-1.5, -4.5, -7.5, -10.5]) {
      const x = side * H.half, own = side > 0 && z === -7.5;
      this.path([x, 0, z - 0.52, x, DOOR.top + 0.06, z - 0.52, x, DOOR.top + 0.06, z + 0.52, x, 0, z + 0.52], own ? V.blue : WALL, own ? 1.3 : 1.05, 0.9);
      if (own) continue;
      this.path([x, 0, z - 0.45, x, DOOR.top, z - 0.45, x, DOOR.top, z + 0.45, x, 0, z + 0.45], WOOD, 0.85, 0.7);
      this.path([x, 1.55, z - 0.08, x, 1.55, z + 0.08, x, 1.65, z + 0.08, x, 1.65, z - 0.08], DIM, 0.85, 0.8, true);
      this.path([x, 1.0, z + 0.33, x - side * 0.06, 1.0, z + 0.33], LAMP, 1.6, 0.8);
      if (z === -4.5 && side < 0) this.path([x + 0.02, 0.01, z - 0.4, x + 0.02, 0.01, z + 0.4], LAMP, 2.1, 0.8);
      if (z === -1.5 && side > 0) this.path([x - 0.1, 0.01, z - 0.35, x - 0.55, 0.01, z - 0.35, x - 0.55, 0.01, z + 0.35, x - 0.1, 0.01, z + 0.35], DIM, 0.85, 0.7, true);
    }
    // on the wall, by the far doors
    this.path([-H.half, 0.9, -9.0, -H.half, 1.35, -9.0, -H.half + 0.12, 1.35, -9.0, -H.half + 0.12, 0.9, -9.0], V.red, 1.3, 0.9, true);
  }

  /** the room: bare, small, a bed, a table at the window, a sink and a cold cupboard along one wall, a bulb on its wire */
  private room(): void {
    const R = ROOM, F = this.fixed;
    box(F, R, WALL, 1.05, 0.85);
    for (let z = R.z0 + 0.6; z < R.z1; z += 0.6) this.path([R.x0, 0, z, R.x1, 0, z], DIM, 0.6, 0.3);
    // the window: its frame and bars, a sill, a blind that hangs crooked, the ribs of a radiator under it
    const x = R.x1, P = PANE;
    this.path([x, P.y0, P.z0, x, P.y1, P.z0, x, P.y1, P.z1, x, P.y0, P.z1], V.blue, 1.6, 1, true);
    this.path([x, P.y0, (P.z0 + P.z1) / 2, x, P.y1, (P.z0 + P.z1) / 2], V.blue, 1.05, 0.9);
    this.path([x, 1.55, P.z0, x, 1.55, P.z1], V.blue, 0.85, 0.8);
    this.path([x - 0.14, P.y0, P.z0 - 0.1, x - 0.14, P.y0, P.z1 + 0.1], WALL, 1.3, 0.9);
    for (let i = 0; i < 4; i++) this.path([x - 0.02, P.y1 - 0.06 - i * 0.07, P.z0, x - 0.02, P.y1 - 0.1 - i * 0.085, P.z1], WOOD, 0.85, 0.7);
    for (let z = -8.6; z <= -7.2; z += 0.14) this.path([x - 0.08, 0.15, z, x - 0.08, 0.7, z], DIM, 0.85, 0.6);
    // the table
    const T = TABLE;
    this.path([T.x0, T.y, T.z0, T.x1, T.y, T.z0, T.x1, T.y, T.z1, T.x0, T.y, T.z1], WOOD, 1.3, 0.95, true);
    this.path([T.x0, T.y - 0.05, T.z0, T.x0, T.y - 0.05, T.z1], WOOD, 0.85, 0.8);
    for (const tx of [T.x0 + 0.06, T.x1 - 0.06]) for (const tz of [T.z0 + 0.06, T.z1 - 0.06]) this.path([tx, 0, tz, tx, T.y, tz], WOOD, 0.85, 0.8);
    // the bed: a frame, a mattress that has seen better, a pillow, a blanket kicked down
    const E = BED;
    box(F, { x0: E.x0, x1: E.x1, y0: 0.18, y1: 0.36, z0: E.z0, z1: E.z1 }, WOOD, 1.05, 0.9);
    this.path([E.x0 + 0.03, E.y, E.z0 + 0.03, E.x1 - 0.03, E.y, E.z0 + 0.03, E.x1 - 0.03, E.y, E.z1 - 0.03, E.x0 + 0.03, E.y, E.z1 - 0.03], V.blue, 1.05, 0.9, true);
    for (const [bx, bz] of [[E.x0, E.z0], [E.x1, E.z0], [E.x1, E.z1], [E.x0, E.z1]]) this.path([bx, 0, bz, bx, 0.36, bz], WOOD, 0.85, 0.8);
    box(F, { x0: E.x1 - 0.42, x1: E.x1 - 0.04, y0: E.y, y1: E.y + 0.1, z0: E.z0 + 0.14, z1: E.z1 - 0.14 }, mix(V.blue, V.white, 0.5), 0.85, 0.85);
    this.path([E.x0 + 0.1, E.y + 0.02, E.z1 - 0.05, E.x0 + 0.3, E.y + 0.09, E.z1 - 0.3, E.x0 + 0.15, E.y + 0.03, E.z0 + 0.45, E.x0 + 0.4, E.y + 0.08, E.z0 + 0.1], DIM, 0.85, 0.7);
    this.path([E.x1 + 0.02, 0.36, E.z0, E.x1 + 0.02, 0.95, E.z0, E.x1 + 0.02, 0.95, E.z1, E.x1 + 0.02, 0.36, E.z1], WOOD, 1.05, 0.85);
    // the bulb
    const bx = 3.3, bz = -7.9;
    this.path([bx, R.y1, bz, bx, 2.08, bz], DIM, 0.6, 0.8);
    for (const [y, r] of [[2.05, 0.035], [1.98, 0.06], [1.92, 0.04]]) ring(F, bx, y, bz, r, LAMP, 1.3, 1);
    // along the near wall: a counter with a sink and its tap, a shelf of bottles, the cold cupboard
    box(F, { x0: 1.3, x1: 3.2, y0: 0, y1: 0.9, z0: -5.8, z1: R.z1 }, WALL, 0.85, 0.85);
    ring(F, 2.5, 0.9, -5.5, 0.2, V.blue, 0.85, 0.8);
    this.path([2.5, 0.9, -5.25, 2.5, 1.15, -5.25, 2.5, 1.15, -5.42], V.blue, 1.05, 0.9);
    this.path([1.4, 1.6, R.z1, 3.0, 1.6, R.z1], WOOD, 1.05, 0.8);
    for (const sx of [1.6, 1.78, 2.2, 2.7]) this.path([sx, 1.6, R.z1 - 0.06, sx, 1.84, R.z1 - 0.06], sx === 2.2 ? V.green : DIM, 1.3, 0.8);
    box(F, { x0: 3.4, x1: 4.0, y0: 0, y1: 1.5, z0: -5.85, z1: -5.25 }, WALL, 0.85, 0.85);
    this.path([3.4, 1.0, -5.85, 4.0, 1.0, -5.85], DIM, 0.85, 0.7);
    // on the walls: a calendar that hangs askew, cracks; on the ceiling over the bed, a stain; on the floor, last night's box
    this.path([3.3, 1.5, R.z0, 3.72, 1.55, R.z0, 3.68, 2.0, R.z0, 3.26, 1.95, R.z0], WOOD, 0.85, 0.75, true);
    this.path([1.6, 2.5, R.z0, 1.75, 2.1, R.z0, 1.6, 1.85, R.z0, 1.82, 1.5, R.z0, 1.7, 1.2, R.z0], DIM, 0.6, 0.7);
    this.path([R.x1, 2.5, -6.0, R.x1, 2.3, -6.15, R.x1, 2.2, -5.95, R.x1, 1.9, -6.1], DIM, 0.6, 0.7);
    ring(F, 4.2, R.y1, -9.9, 0.45, WALL, 0.85, 0.8, 9);
    ring(F, 4.32, R.y1, -10.0, 0.22, WALL, 0.85, 0.7, 7);
    ring(F, 4.05, R.y1, -9.75, 0.7, DIM, 0.6, 0.7, 11);
    this.path([3.2, R.y1, -10.6, 3.7, R.y1, -10.1, 4.0, R.y1, -10.15, 4.6, R.y1, -9.5, 5.0, R.y1, -9.6], WALL, 0.85, 0.8);
    this.path([4.0, R.y1, -10.15, 4.2, R.y1, -10.5, 4.15, R.y1, -10.6], WALL, 0.6, 0.7);
    this.path([1.9, 0.01, -9.4, 2.3, 0.01, -9.3, 2.2, 0.01, -8.9, 1.8, 0.01, -9.0], WOOD, 0.85, 0.7, true);
    for (const [px, pz] of [[2.45, -9.05], [1.7, -8.75]]) this.path([px, 0, pz, px, 0.24, pz], V.green, 1.3, 0.7);
    // (their side of the door's frame)
    this.path([R.x0, 0, DOOR.z0, R.x0, DOOR.top + 0.06, DOOR.z0, R.x0, DOOR.top + 0.06, DOOR.z1, R.x0, 0, DOOR.z1], WALL, 1.05, 0.9);
  }

  /** out of the window: the city, from high up, in three ranks, and a moon over it */
  private city(): void {
    const r = rng(2026), F = this.fixed;
    for (const [n, x, top, spread, alpha] of [[9, 28, -14, 20, 0.75], [9, 62, -6, 32, 0.6], [8, 125, 4, 58, 0.45]] as const) {
      for (let i = 0; i < n; i++) {
        const w = 9 + r() * 9, z = -62 + (i / n) * 110 + r() * 6, x0 = x + r() * 14, y1 = top + r() * spread, y0 = -45;
        // the face toward the room, and its top going away; a light in a few of its windows
        this.path([x0, y0, z, x0, y1, z, x0, y1, z + w, x0, y0, z + w], DIM, 0.85, alpha);
        this.path([x0, y1, z, x0 + w, y1, z, x0 + w, y1, z + w, x0, y1, z + w], DIM, 0.6, alpha * 0.8);
        for (let k = 0; k < (y1 - y0) * w * 0.02; k++) {
          const wy = y1 - 2 - Math.floor(r() * Math.min(14, (y1 - y0 - 4) / 3.2)) * 3.2, wz = z + 1.2 + Math.floor(r() * ((w - 2.4) / 2.4)) * 2.4;
          F.seg(x0, wy, wz, x0, wy, wz + 1.2, r() < 0.75 ? LAMP : V.blue, 1.05, 0.35 + 0.5 * r());
        }
      }
    }
    const M = mix(V.amber, V.white, 0.35);
    for (const [ry, rz] of [[12, 12], [12, 5]]) {
      const p: number[] = [];
      for (let i = 0; i < 28; i++) p.push(420, 78 + Math.sin((i / 28) * Math.PI * 2) * ry, -20 + Math.cos((i / 28) * Math.PI * 2) * rz);
      this.path(p, M, ry === rz ? 1.3 : 0.6, ry === rz ? 0.9 : 0.3, true);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Set four planes to keep what is seen from `from` through an upright opening in the plane x (z0 to z1, y0 to y1). */
function through(planes: THREE.Plane[], from: THREE.Vector3, x: number, z0: number, z1: number, y0: number, y1: number): void {
  const c = [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z0), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y0, z1)];
  const beyond = new THREE.Vector3(x, (y0 + y1) / 2, (z0 + z1) / 2).multiplyScalar(2).sub(from);
  planes.forEach((p, i) => {
    p.setFromCoplanarPoints(from, c[i], c[(i + 1) % 4]);
    if (p.distanceToPoint(beyond) < 0) p.negate();
  });
}

function ring(B: Beams, x: number, y: number, z: number, r: number, color: string, width: number, alpha = 1, n = 10): void {
  const p: number[] = [];
  for (let i = 0; i < n; i++) p.push(x + Math.cos((i / n) * Math.PI * 2) * r, y, z + Math.sin((i / n) * Math.PI * 2) * r);
  B.line(p, n, color, width, { alpha, close: true });
}

function box(B: Beams, b: Box, color: string, width: number, alpha = 1): void {
  for (const y of [b.y0, b.y1]) B.line([b.x0, y, b.z0, b.x1, y, b.z0, b.x1, y, b.z1, b.x0, y, b.z1], 4, color, width, { alpha, close: true });
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) B.seg(x, b.y0, z, x, b.y1, z, color, width, alpha);
}
