/**
 * The opera: a full house and a performance going on. The target is one of the players on the
 * stage (the one singing, the one in the crown, the one with the sword), the rest of the cast are
 * up there with them, and the crowd is all round: guests in the boxes along both walls, who can be
 * hit like anyone and are nobody's target, and the audience in the seats below, some of them people
 * like the rest and most of them only a head and shoulders. The rifle is in the booth at the back
 * of the house, high up, looking over the seats at the stage (down −z).
 *
 * The aria is the place's cover: a shot fired under its one long high note is heard by nobody, and
 * the house goes on watching. At any other moment it is heard like any other shot, and then the
 * whole house is on its feet and making for the doors: up the middle to the back, or along the
 * walls to the door on each side.
 */
import * as THREE from "three";
import { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Scene, nearer, rayBox, type Box, type Impact, type Opening, type Spot, type Trait, rng } from "./place.ts";
import { drawSeated } from "./crew.ts";

const EYE = new THREE.Vector3(0, 10.5, 0);
/** half the width of the house between its boxes, and how high its ceiling is */
const HALF = 14, ROOF = 22;
/** the stage: its front edge and its back cloth (z), its floor, half the width of the opening and how high that is */
const STAGE = { front: -46, back: -66, y: 1.6, half: 12, top: 13.5 };
/** the boxes along each wall: their floor, how far back they go (from the house's edge), where the row starts (z), how wide each is, how many */
const BOX = { y: 5.5, deep: 3.6, z0: -10, wide: 4, n: 8 }, HIGH = 3, PARAPET = 0.75;
/** where the one who sings stands */
const SINGER = { x: 0, z: -50 };
const GOLD = V.amber, PLUSH = V.pink, STONE = V.blueMid, MOON = mix(V.amber, V.white, 0.4), HEAD = mix(V.blue, V.white, 0.25);
/** the seats: the rows (z, from the back one to the front), how far each side of the middle aisle they run, the aisle along each wall, the door in each wall, the way out at the back */
const ROWS = { z0: -8, step: 1.25, n: 25, near: 0.9, far: HALF - 1.5 }, AISLE = HALF - 0.8, DOOR = -22, BACK = -5;
/** the seats where the people of the audience who are people sit: on the aisles, here and there down the house */
const SEATS: [number, number][] = [4, 8, 12, 16, 20, 23].flatMap((k) => [-11.8, -1.6, 1.6, 11.8].map((x): [number, number] => [x, ROWS.z0 - ROWS.step * k + 0.12]));

/** one of the audience who is only a head and shoulders: their seat, how bright, and how they leave it */
interface Seat {
  x: number;
  y: number;
  z: number;
  a: number;
  /** seconds after the alarm before they are up, and how fast they go (m/s) */
  wait: number;
  speed: number;
  /** the aisle they make for (x), and which wall's door it leads to (0: the middle aisle, and out at the back) */
  aisle: number;
  side: number;
}

/** a head over a pair of shoulders (a ring lying flat reads as a head from wherever the scope is turned); on its feet, a line down to them */
function figure(B: Beams, x: number, y: number, z: number, a: number, up: boolean): void {
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2, a1 = ((i + 1) / 5) * Math.PI * 2;
    B.seg(x + Math.cos(a0) * 0.1, y - 0.1, z + Math.sin(a0) * 0.1, x + Math.cos(a1) * 0.1, y - 0.1, z + Math.sin(a1) * 0.1, HEAD, 0.6, a);
  }
  B.seg(x - 0.22, y - 0.3, z, x - 0.1, y - 0.22, z, HEAD, 0.6, a);
  B.seg(x - 0.1, y - 0.22, z, x + 0.1, y - 0.22, z, HEAD, 0.6, a);
  B.seg(x + 0.1, y - 0.22, z, x + 0.22, y - 0.3, z, HEAD, 0.6, a);
  if (up) B.seg(x, y - 0.3, z, x, 0, z, HEAD, 0.6, a * 0.7);
}
/** the boxes with guests' chairs in them: which wall (−1 left, 1 right) and which box along it */
const SEATED: [number, number][] = [[-1, 1], [-1, 3], [-1, 6], [1, 2], [1, 4], [1, 5]];
const middle = (k: number) => BOX.z0 - BOX.wide * (k + 0.5);
/** facing the stage from here */
const toStage = (x: number, z: number) => Math.atan2(-56 - z, -x);
/** a mark on the stage: to the house, turned a little to its middle */
const mark = (x: number, z: number, more: Partial<Spot> = {}): Spot => ({ x, z, th: Math.PI / 2 + x * 0.03, ...more });

export class Opera extends Scene {
  readonly name = "THE OPERA";
  readonly intro = "intro-opera";
  readonly lost = { banner: "INTO THE WINGS", card: "The target left the stage." };
  readonly yaw: [number, number] = [-0.85, 0.85];
  readonly pitch: [number, number] = [-0.8, 0.16];
  readonly home = { yaw: 0, pitch: -0.13 };
  readonly hear = 60;
  /** the aria has to be this loud, against its loudest, for a shot to go unheard: its one long high note is */
  override readonly drown = 0.9;
  /** what tells the players apart is what they are playing (nobody up there has a phone) */
  override readonly traits: Trait[] = ["sing", "crown", "sword", "cape", "skull"];
  /** (nobody talks through it) */
  override readonly chat = null;
  /**
   * How it opens: the view goes round one of the audience in the gallery at the back, who takes a
   * rifle out of a case at his feet and puts it together as it goes; then in at the scope. (At the
   * room's own speed: the aria is being sung.)
   */
  override readonly opening: Opening = {
    rule: "FIRE ON THE HIGH NOTE",
    more: ["YOUR TARGET IS ONE OF THE PLAYERS ON THE STAGE.", "UNDER THE ARIA'S LONG HIGH NOTE, NOBODY HEARS THE SHOT."],
    orbit: 7.4,
    sweep: 3.0,
    centre: [0, -0.4, 0.55],
    far: 5.2,
    near: 2.3,
    high: 1.2,
    low: 0.4,
    pace: 1,
    assemble: true,
  };
  readonly spots: Spot[] = [
    // the stage: the one who sings down at the front, the rest about her
    mark(SINGER.x, SINGER.z, { sings: true }),
    mark(-6.5, -52),
    mark(6.5, -52.5),
    mark(-3.6, -56, { open: true }),
    mark(3.8, -55.5, { open: true }),
    mark(2, -60.5, { open: true }),
    mark(-9, -57.5),
    mark(9, -58),
    // the crowd: two chairs at the rail of each of these boxes, turned to the stage (and toward the far side of
    // their box, or the wall between it and the next would stand between the nearer chair and the rifle)
    ...SEATED.flatMap(([side, k]) => [-1.2, 0.4].map((dz): Spot => ({ x: side * (HALF + 0.6), z: middle(k) + dz, th: toStage(side * (HALF + 0.6), middle(k) + dz), sit: true, crowd: true }))),
    // and in the seats below, among the rest of the house
    ...SEATS.map(([x, z]): Spot => ({ x, z, th: -Math.PI / 2, sit: true, crowd: true })),
  ];
  private readonly solid: Box[] = [];
  /** the audience that is only heads: drawn once while it sits, and one by one from the moment it runs */
  private readonly sitting = new Beams({ fog: false });
  private readonly seats: Seat[] = [];
  /** seconds since the house took fright (−1: it has not) */
  private panic = -1;

  constructor() {
    super();
    const S = this.solid, z1 = BOX.z0, z0 = BOX.z0 - BOX.wide * BOX.n;
    for (const side of [-1, 1]) {
      // what a bullet stops in along each wall: the wall under the boxes, their rail, their back wall, the walls between them, what is over them
      const span = (a: number, b: number): { x0: number; x1: number } => ({ x0: Math.min(side * a, side * b), x1: Math.max(side * a, side * b) });
      S.push({ ...span(HALF, HALF + 8), y0: 0, y1: BOX.y, z0: STAGE.front, z1: 0 });
      S.push({ ...span(HALF, HALF + 8), y0: BOX.y + HIGH, y1: ROOF, z0: STAGE.front, z1: 0 });
      S.push({ ...span(HALF, HALF + 0.15), y0: BOX.y, y1: BOX.y + PARAPET, z0, z1 });
      S.push({ ...span(HALF + BOX.deep, HALF + 8), y0: BOX.y, y1: BOX.y + HIGH, z0, z1 });
      for (let k = 0; k <= BOX.n; k++) S.push({ ...span(HALF, HALF + BOX.deep), y0: BOX.y, y1: BOX.y + HIGH, z0: z1 - k * BOX.wide - 0.1, z1: z1 - k * BOX.wide + 0.1 });
      // (the wall goes on, with no boxes in it, before the first of them and after the last)
      S.push({ ...span(HALF, HALF + 8), y0: BOX.y, y1: BOX.y + HIGH, z0: z1, z1: 0 });
      S.push({ ...span(HALF, HALF + 8), y0: BOX.y, y1: BOX.y + HIGH, z0: STAGE.front, z1: z0 });
    }
    this.build(() => {
      this.stage();
      this.stalls();
      this.boxes();
      this.house();
      this.ledge(EYE);
      this.gallery();
    });
    // the audience: half the seats taken, each by somebody who will get up and go in their own time
    const r = rng(1875);
    for (let k = 0; k < ROWS.n; k++) {
      const z = ROWS.z0 - ROWS.step * k;
      for (let x = -ROWS.far + 0.3; x < ROWS.far; x += 0.62) {
        if (Math.abs(x) < ROWS.near + 0.2 || r() > 0.5 || SEATS.some(([sx, sz]) => Math.abs(sx - x) < 0.5 && Math.abs(sz - z) < 0.5)) continue;
        // (those near the stage saw it first; the fright goes back through the house)
        const side = Math.abs(x) > 6.6 ? Math.sign(x) : 0;
        this.seats.push({ x, y: 1.2 + 0.08 * r(), z: z + 0.12 - 0.06 * r(), a: 0.4 + 0.25 * r(), wait: 0.25 + 0.035 * (z - STAGE.front) + 0.9 * r(), speed: 2.5 + 1.6 * r(), aisle: side ? side * AISLE : Math.sign(x) * (0.15 + 0.6 * r()), side });
      }
    }
    this.group.add(this.sitting.group);
    this.sitting.begin();
    for (const s of this.seats) figure(this.sitting, s.x, s.y, s.z, s.a, false);
    this.sitting.end();
  }

  override reset(): void {
    this.panic = -1;
    this.sitting.group.visible = true;
  }

  /** a shot was heard: the house is on its feet */
  override alarm(): void {
    if (this.panic >= 0) return;
    this.panic = 0;
    this.sitting.group.visible = false;
  }

  override update(dt: number): void {
    super.update(dt);
    if (this.panic >= 0) this.panic += dt;
  }

  /** the audience in flight: each along their row to an aisle, then up it and out */
  override draw(B: Beams): void {
    if (this.panic < 0) return;
    for (const s of this.seats) {
      const t = this.panic - s.wait;
      if (t <= 0) {
        figure(B, s.x, s.y, s.z, s.a, false);
        continue;
      }
      const row = Math.abs(s.aisle - s.x) / s.speed, y = s.y + 0.5 * Math.min(1, t / 0.3) + 0.05 * Math.sin(t * 11 + s.x * 3);
      let x = s.aisle, z = s.z;
      if (t < row) x = s.x + Math.sign(s.aisle - s.x) * s.speed * t;
      else {
        const gone = (t - row) * s.speed, door = Math.abs(DOOR - s.z);
        if (!s.side) z = s.z + gone;
        else if (gone < door) z = s.z + Math.sign(DOOR - s.z) * gone;
        else {
          z = DOOR;
          x = s.aisle + s.side * (gone - door);
        }
        if (z > BACK || Math.abs(x) > HALF - 0.1) continue;
      }
      figure(B, x, y, z, s.a, true);
    }
  }

  override setResolution(w: number, h: number): void {
    super.setResolution(w, h);
    this.sitting.setResolution(w, h);
  }

  override dispose(): void {
    super.dispose();
    this.sitting.dispose();
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: Math.min(5, 4 + lap), strollers: 1 };
  }

  /** the guests in the boxes and the people in the seats (fewer where every head costs: a phone) */
  override crowd(_lap: number, light = false): number {
    return light ? 6 : 16;
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** up on the curtain, over their heads */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() - 0.5) * 0.3, pitch: -0.03 + Math.random() * 0.04 };
  }

  /** the stage and its wings, a box, or the floor of the house */
  floor(x: number, z: number): number {
    return z < STAGE.front ? STAGE.y : Math.abs(x) > HALF ? BOX.y : 0;
  }

  /** off the stage by the nearer wing; out of a box by the door at its back; from a seat, along the row to an aisle and out by it */
  wayOut(p: { x: number; z: number }): { x: number; z: number }[] {
    if (p.z < STAGE.front) return [{ x: (p.x < 0 ? -1 : 1) * (STAGE.half + 2.5), z: Math.min(p.z, STAGE.front - 3) }];
    if (Math.abs(p.x) < HALF) {
      const side = p.x < 0 ? -1 : 1;
      if (Math.abs(p.x) < 6.6) return [{ x: side * 0.45, z: p.z }, { x: side * 0.45, z: BACK }];
      return [{ x: side * AISLE, z: p.z }, { x: side * AISLE, z: DOOR }, { x: side * (HALF - 0.2), z: DOOR }];
    }
    const k = Math.max(0, Math.min(BOX.n - 1, Math.floor((BOX.z0 - p.z) / BOX.wide)));
    return [{ x: (p.x < 0 ? -1 : 1) * (HALF + BOX.deep - 0.3), z: middle(k) }];
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    let best: Impact = { t: 220, what: null, heard: false };
    if (d.y < -1e-6) {
      // the floors: the house's (its seats), the stage's
      let t = -o.y / d.y;
      if (o.z + d.z * t > STAGE.front) best = nearer(best, t, "seats");
      t = (STAGE.y - o.y) / d.y;
      const z = o.z + d.z * t;
      if (z <= STAGE.front && z > STAGE.back) best = nearer(best, t, "stage");
    }
    if (d.y > 1e-6) best = nearer(best, (ROOF - o.y) / d.y, "wall");
    if (d.z < -1e-6) {
      // the wall the stage opens in, and through the opening the cloth at the back
      const t = (STAGE.front - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
      if (!(Math.abs(x) < STAGE.half && y > STAGE.y && y < STAGE.top)) best = nearer(best, t, "wall");
      best = nearer(best, (STAGE.back - o.z) / d.z, "wall");
    }
    for (const b of this.solid) best = nearer(best, rayBox(o, d, b), "wall");
    return best;
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the stage: the opening and its curtain drawn back, the boards, the lights along its edge, the set and the painted cloth behind */
  private stage(): void {
    const { front, back, y, half, top } = STAGE, arch: number[] = [];
    for (let i = 0; i <= 18; i++) arch.push(-half + (2 * half * i) / 18, top - 2.4 + 2.4 * Math.sin((i / 18) * Math.PI), front);
    for (const x of [-half, half]) this.path([x, y, front, x, top - 2.4, front], GOLD, 1.6);
    this.path(arch, GOLD, 1.6);
    this.path(arch.map((v, i) => (i % 3 === 1 ? v + 0.9 : v)), GOLD, 0.85, 0.7);
    this.rect(-HALF, 0, HALF, ROOF, front, STONE, 0.85, 0.6);
    // the curtain, drawn back to each side in folds, and its swags across the top
    for (const side of [-1, 1])
      for (let i = 0; i < 8; i++) {
        const x = side * (half - 0.25 - i * 0.4), fold: number[] = [];
        for (let k = 0; k <= 8; k++) fold.push(x - side * 0.5 * Math.sin((k / 8) * Math.PI * 0.5) * (i / 8), y + ((top - 2.8 - y) * k) / 8, front - 0.3);
        this.path(fold, PLUSH, 0.85, 0.8 - 0.05 * i);
      }
    for (let s = 0; s < 6; s++) {
      const a = -half + (2 * half * s) / 6, b = -half + (2 * half * (s + 1)) / 6, swag: number[] = [];
      for (let i = 0; i <= 8; i++) swag.push(a + ((b - a) * i) / 8, top - 1.6 - 1.1 * Math.sin((i / 8) * Math.PI) + 1.7 * Math.sin((((a + b) / 2 + half) / (2 * half)) * Math.PI), front - 0.3);
      this.path(swag, PLUSH, 1.05, 0.85);
    }
    // the boards and the lights along their edge
    this.path([-half, y, front, half, y, front], V.blue, 1.6);
    this.path([-half, 0, front, -half, y, front], STONE, 0.85, 0.7);
    this.path([half, 0, front, half, y, front], STONE, 0.85, 0.7);
    for (let x = -half + 1.5; x < half; x += 1.5) this.path([x, y, front, x, y, back], V.blueDim, 0.6, 0.4);
    for (let z = front - 4; z > back; z -= 4) this.path([-half, y, z, half, y, z], V.blueDim, 0.6, 0.3);
    for (let x = -half + 0.8; x < half; x += 1.1) this.ringXZ(x, y + 0.12, front - 0.5, 0.09, GOLD, 1.3, 0.95, 5);
    // the set: a flight of steps up to a pair of columns and what they carry, far upstage
    for (let i = 0; i < 4; i++) this.path([-5.5, y + i * 0.35, back + 5 - i * 0.5, 5.5, y + i * 0.35, back + 5 - i * 0.5], STONE, 0.85, 0.7);
    for (const x of [-4.4, 4.4]) this.post(x, back + 2.4, 0.4, y + 1.05, y + 7.2, mix(V.blue, V.white, 0.3), 0.85, 0.8, 8, 2);
    this.box({ x0: -5.2, x1: 5.2, y0: y + 7.2, y1: y + 8, z0: back + 1.9, z1: back + 2.9 }, V.blue, 1.05, 0.9);
    // the cloth at the back: hills, and a moon over them
    const hills: number[] = [], moon: number[] = [];
    for (let i = 0; i <= 24; i++) hills.push(-half + (2 * half * i) / 24, y + 3 + 1.6 * Math.sin(i * 0.7) + 0.8 * Math.sin(i * 1.9), back);
    this.path(hills, V.blueMid, 0.85, 0.7);
    for (let i = 0; i < 18; i++) moon.push(6.5 + 1.4 * Math.cos((i / 18) * Math.PI * 2), y + 9 + 1.4 * Math.sin((i / 18) * Math.PI * 2), back);
    this.path(moon, MOON, 1.05, 0.85, true);
    this.rect(-half, y, half, top, back, V.blueDim, 0.6, 0.5);
    // the light the singer stands in: a ring at her feet, and two lines down to it from over the seats
    this.ringXZ(SINGER.x, y + 0.02, SINGER.z, 1.3, MOON, 0.85, 0.6, 14);
    for (const dx of [-1.3, 1.3]) this.path([dx * 0.2, ROOF - 1, -18, SINGER.x + dx, y, SINGER.z], MOON, 0.6, 0.2);
  }

  /** the floor of the house: row on row of seats facing the stage, the doors out of it, the pit before the stage */
  private stalls(): void {
    for (let k = 0; k < ROWS.n; k++) {
      const z = ROWS.z0 - ROWS.step * k;
      for (const side of [-1, 1]) this.path([side * ROWS.near, 0.85, z, side * ROWS.far, 0.85, z], V.blueDim, 0.6, 0.45);
    }
    // the door in each wall, under the boxes, and the light over it
    for (const side of [-1, 1]) {
      this.path([side * HALF, 0, DOOR - 0.9, side * HALF, 2.3, DOOR - 0.9, side * HALF, 2.3, DOOR + 0.9, side * HALF, 0, DOOR + 0.9], GOLD, 1.05, 0.8);
      this.path([side * HALF, 2.6, DOOR - 0.5, side * HALF, 2.6, DOOR + 0.5], V.green, 2.1, 0.9);
    }
    // the aisle down the middle; the rail of the pit, and the players' stands in it, each with its lamp
    for (const x of [-0.9, 0.9]) this.path([x, 0.02, -7, x, 0.02, -39.5], GOLD, 0.6, 0.35);
    this.path([-STAGE.half, 0, -41, -STAGE.half, 1.0, -41, STAGE.half, 1.0, -41, STAGE.half, 0, -41], STONE, 1.05, 0.8);
    for (let x = -STAGE.half + 1.5; x < STAGE.half; x += 2.2) {
      this.path([x, 0, -43.6, x, 0.95, -43.6], V.blueDim, 0.6, 0.6);
      this.seg(x - 0.18, 0.98, -43.45, x + 0.18, 0.98, -43.45, GOLD, 1.3, 0.7);
    }
  }

  /** the boxes along both walls: each one's opening, its rail, a swag of plush over it, a lamp between it and the next; and a tier of them over that, dark */
  private boxes(): void {
    const z1 = BOX.z0, z0 = BOX.z0 - BOX.wide * BOX.n, y = BOX.y, top = y + HIGH;
    for (const side of [-1, 1]) {
      const x = side * HALF, back = side * (HALF + BOX.deep);
      this.path([x, y + PARAPET, z1, x, y + PARAPET, z0], GOLD, 1.3, 0.95);
      this.path([x, y, z1, x, y, z0], STONE, 1.05, 0.8);
      this.path([x, top, z1, x, top, z0], GOLD, 1.05, 0.8);
      for (let z = z1 - 0.25; z > z0; z -= 0.5) this.path([x, y, z, x, y + PARAPET, z], STONE, 0.6, 0.5);
      for (let k = 0; k <= BOX.n; k++) {
        const z = z1 - k * BOX.wide;
        this.path([x, y, z, x, top, z], GOLD, 1.3, 0.9);
        this.path([x, y, z, back, y, z, back, top, z, x, top, z], STONE, 0.6, 0.5);
        this.ringXZ(x - side * 0.25, y + 2.2, z, 0.14, GOLD, 1.3, 1, 6);
      }
      for (let k = 0; k < BOX.n; k++) {
        const a = z1 - k * BOX.wide, swag: number[] = [];
        for (let i = 0; i <= 10; i++) swag.push(x, top - 0.08 - 0.42 * Math.sin((i / 10) * Math.PI), a - 0.15 - ((BOX.wide - 0.3) * i) / 10);
        this.path(swag, PLUSH, 1.05, 0.85);
        this.path([back, y, a - BOX.wide / 2 - 0.5, back, y + 2.1, a - BOX.wide / 2 - 0.5, back, y + 2.1, a - BOX.wide / 2 + 0.5, back, y, a - BOX.wide / 2 + 0.5], mix(GOLD, "#000000", 0.35), 0.85, 0.7);
      }
      // the wall under them, and the tier over them (nobody is up there tonight)
      for (let yy = 1.4; yy < y; yy += 1.4) this.path([x, yy, z1 + 4, x, yy, STAGE.front], V.blueDim, 0.6, 0.4);
      for (const [yy, color, a] of [[top + 1, STONE, 0.7], [top + 1.75, mix(GOLD, "#000000", 0.3), 0.8], [top + 4, STONE, 0.6]] as const) this.path([x, yy, z1, x, yy, z0], color, 0.85, a);
      for (let k = 0; k <= BOX.n; k++) this.path([x, top + 1, z1 - k * BOX.wide, x, top + 4, z1 - k * BOX.wide], mix(GOLD, "#000000", 0.3), 0.85, 0.7);
      this.path([x, 0, z1 + 4, x, ROOF, z1 + 4], STONE, 0.6, 0.5);
    }
    // a chair for each of the crowd, on their own floor: plush in a box, plain down among the rows of seats
    for (const s of this.spots) if (s.crowd) this.chair(s.x, this.floor(s.x, s.z), s.z, s.th, Math.abs(s.x) > HALF ? mix(PLUSH, V.white, 0.2) : V.blueDim);
  }

  /**
   * The gallery at the back, where the rifle is: never in the scope (it is behind it), but it is where
   * the opening is set. Two rows of seats, a few of the audience in them, the wall and the door behind.
   */
  private gallery(): void {
    const y0 = EYE.y - 1.22, AHEAD = new THREE.Vector3(0, 0, -1), RIGHT = new THREE.Vector3(1, 0, 0);
    const rows: [number, number, number[]][] = [[0.62, 0, [-3.2, -1.6, 1.6, 2.4]], [1.95, 0.32, [-2.4, -0.8, 0.8, 3.2]]];
    for (const [z, step, taken] of rows) {
      const y = y0 + step;
      for (let x = -4; x <= 4.01; x += 0.8) this.chair(x, y, z, -Math.PI / 2, V.blueDim);
      this.path([-4.6, y, z + 0.7, 4.6, y, z + 0.7], V.blueDim, 0.6, 0.5);
      for (const x of taken) {
        // one of the audience: sitting, hands on their knees, a head of two rings
        const hip = new THREE.Vector3(x, y + 0.62, z), at = (dx: number, dy: number, dz: number) => new THREE.Vector3(x + dx, y + dy, z + dz);
        drawSeated(this.fixed, { hip, neck: at(0, 1.14, -0.02), fwd: AHEAD, right: RIGHT, twist: 0, handR: at(0.1, 0.72, -0.38), handL: at(-0.1, 0.72, -0.38) }, V.blueMid, 0.8);
        this.ringXZ(x, y + 1.3, z - 0.03, 0.09, HEAD, 0.85, 0.8, 7);
        this.ringXZ(x, y + 1.4, z - 0.03, 0.105, HEAD, 0.85, 0.8, 7);
        this.ringXZ(x, y + 1.5, z - 0.03, 0.075, HEAD, 0.85, 0.7, 7);
      }
    }
    // the wall behind, its door and the light over it, a lamp either side
    const wall = 3.3;
    this.rect(-6, y0, 6, y0 + 3.4, wall, STONE, 0.85, 0.6);
    this.rect(3.6, y0 + 0.32, 4.6, y0 + 2.5, wall, GOLD, 1.05, 0.8);
    this.path([3.8, y0 + 2.75, wall, 4.4, y0 + 2.75, wall], V.green, 2.1, 0.9);
    for (const x of [-2.6, 1.4]) {
      this.ringXZ(x, y0 + 2.3, wall - 0.2, 0.13, GOLD, 1.3, 1, 6);
      this.path([x, y0 + 2.3, wall, x, y0 + 2.3, wall - 0.2], STONE, 0.85, 0.8);
    }
    for (const x of [-6, 6]) this.path([x, y0, wall, x, y0, -1.3], STONE, 0.6, 0.5);
  }

  /** the room itself: the great lamp hanging over the seats, and the ceiling it hangs from */
  private house(): void {
    const cx = 0, cz = -24, y = 17.6;
    this.path([cx, ROOF - 0.5, cz, cx, y + 1.6, cz], STONE, 0.85, 0.8);
    for (const [r, dy, n] of [[3.4, 0, 16], [2.1, 0.9, 12], [0.9, 1.6, 8]] as const) {
      this.ringXZ(cx, y + dy, cz, r, GOLD, 1.05, 0.9, n);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, lx = cx + Math.cos(a) * r, lz = cz + Math.sin(a) * r;
        this.seg(lx, y + dy, lz, lx, y + dy - 0.35, lz, V.white, 1.6, 0.9);
        if (i % 2 === 0) this.path([lx, y + dy, lz, cx, y + 1.6, cz], GOLD, 0.6, 0.5);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.path([cx + Math.cos(a) * 4, ROOF - 0.5, cz + Math.sin(a) * 4, cx + Math.cos(a) * 13.5, ROOF - 1.5, cz + Math.sin(a) * 20], V.blueDim, 0.6, 0.35);
    }
    this.ringXZ(cx, ROOF - 0.5, cz, 4, STONE, 0.85, 0.6, 16);
  }
}
