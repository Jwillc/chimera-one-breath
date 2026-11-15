/**
 * The drive: a café's terrace on the far bank of a river, seen from the back seat of a car going
 * along the near bank. The car does not stop: the scope has to be kept on them as they go by, and
 * when the car has gone the length of the embankment the chance is gone with it. The rifle looks
 * out of the car's left side, down −z, while the car goes along +x.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Glass, Scene, nearer, rayBox, type Box, type Crossing, type Impact, type Opening, type Spot, rng } from "./place.ts";
import { drawSeated } from "./crew.ts";

/** the car's run along the embankment (m), how fast, and how high the eye is in it */
const START = -70, END = 70, SPEED = 4, EYE_Y = 1.2;
/** how far ahead of the eye the car's own middle is: the rifle is at the back seat's window */
const CAR = 0.9;
/** the river (its near bank, its far one, its surface), the terrace over the far quay, the buildings' faces */
const BANK = -8, QUAY = -99, RIVER = -2.5, TER = 1.5, FACE = -112, BACK = -117;
const DOOR = { x: 10, z: FACE + 0.2 };
const TABLES: [number, number][] = [[-8, -106], [-3, -108], [2.5, -105.5], [7.5, -108]];
const SOLID: Box[] = TABLES.map(([x, z]) => ({ x0: x - 0.4, x1: x + 0.4, y0: TER, y1: TER + 0.75, z0: z - 0.4, z1: z + 0.4 }));
/** the ways between the tables, front to back */
const AISLES = [-10.5, -5.5, -0.25, 5, 10.5];
const STONE = V.blueMid, LAMP = V.amber;
/** the way the car goes, and across it to its right */
const AHEAD = new THREE.Vector3(1, 0, 0), ACROSS = new THREE.Vector3(0, 0, 1);

export class Drive extends Scene {
  readonly name = "THE DRIVE";
  readonly intro = "intro-drive";
  readonly lost = { banner: "TOO LATE", card: "The car went by, or the target got in at the café's door." };
  readonly yaw: [number, number] = [-0.85, 0.85];
  readonly pitch: [number, number] = [-0.1, 0.25];
  readonly home = { yaw: -0.58, pitch: 0.014 };
  readonly hear = 60;
  override readonly rough = 1.5;
  override readonly bipod = false;
  override readonly opening: Opening = {
    rule: "THE CAR DOES NOT STOP",
    more: ["ONE PASS ALONG THE RIVER. FIND YOUR TARGET ON THE FAR BANK", "AND FIRE BEFORE THE CAFÉ IS BEHIND YOU."],
    orbit: 6.6,
    sweep: 3.3,
    centre: [0.5, -0.3, 0.35],
    far: 7.5,
    near: 3.4,
    high: 1.5,
    low: 0.4,
  };
  override readonly driver = { pos: new THREE.Vector3(), q: new THREE.Quaternion() };
  readonly spots: Spot[] = [
    // two chairs to a table, facing each other across it
    ...TABLES.flatMap(([x, z]) => [{ x: x - 0.85, z, th: 0, sit: true }, { x: x + 0.85, z, th: Math.PI, sit: true }]),
    { x: 0.8, z: -110.8, th: Math.PI / 2 },
    // the front of the terrace, along the quay
    { x: -10.5, z: -102.5, th: 1.3, open: true },
    { x: -5, z: -103, th: 1.6, open: true },
    { x: 0, z: -102.2, th: 1.5, open: true },
    { x: 5, z: -103, th: 1.7, open: true },
    { x: 10.5, z: -103, th: 1.9, open: true },
  ];
  private readonly pane = new Glass(FACE, -8, 8, TER + 0.5, TER + 3.1);
  /** the buildings along the far bank: from x0 to x1, this high over the terrace */
  private readonly row: { x0: number; x1: number; h: number; cafe: boolean }[] = [];
  private x = START;
  private bump = 0;
  private bumpAge = 0;
  private bumpIn = 1.5;

  constructor() {
    super();
    const r = rng(1910);
    for (let x = -150; x < 150; ) {
      // (whole metres, and the last house before the café ends where the café begins)
      const cafe = x === -12, left = -12 - x, w = cafe ? 24 : left > 0 && left < 30 ? (left > 22 ? Math.floor(left / 2) : left) : 13 + Math.floor(r() * 10);
      this.row.push({ x0: x, x1: x + w, h: cafe ? 14 : 11 + Math.floor(r() * 12), cafe });
      x += w;
    }
    this.build(() => {
      this.sky(6, 220, -Math.PI / 2, [-210, 170, -620]);
      this.embankment();
      this.town();
      this.river();
      this.bank();
      this.cafe();
    });
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: Math.min(6, 5 + lap), strollers: Math.min(3, 1 + lap) };
  }

  override reset(): void {
    this.pane.mend();
    this.x = START;
    this.bump = 0;
    this.bumpIn = 1.5;
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, EYE_Y + 0.012 * this.bump * Math.cos(this.bumpAge * 24), 0);
  }

  /** the road under the car: a tremble all the time, and a jolt now and then that rings down */
  override tilt(): number {
    return 0.00018 * Math.sin(this.clock * 31) + 0.0019 * this.bump * Math.sin(this.bumpAge * 24);
  }

  /** on the far bank, a few houses along from the café */
  override look(): { yaw: number; pitch: number } {
    return { yaw: this.home.yaw + (Math.random() < 0.5 ? -1 : 1) * (0.1 + 0.08 * Math.random()), pitch: 0.03 + 0.03 * Math.random() };
  }

  floor(_x: number, z: number): number {
    return z > BANK ? 0 : z > QUAY ? RIVER : TER;
  }

  /** between the tables to the back of the terrace, along the café's front, in at its door */
  wayOut(p: { x: number; z: number; sit: number }): { x: number; z: number }[] {
    const back = [{ x: 10, z: -110.2 }, DOOR];
    if (p.sit > 0.5 || p.z < -104.6) return [{ x: p.x, z: -110.2 }, ...back];
    const aisle = AISLES.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
    return [{ x: aisle, z: p.z }, { x: aisle, z: -110.2 }, ...back];
  }

  override over(): boolean {
    return this.x >= END;
  }

  override glass(o: THREE.Vector3, d: THREE.Vector3): Crossing | null {
    return d.z < -1e-6 ? this.pane.cross(o, d) : null;
  }

  override shatter(c: Crossing): void {
    this.pane.shatter(c.x, c.y);
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    let best: Impact = { t: 600, what: null, heard: false };
    const near = (x: number) => Math.abs(x) < 40;
    if (d.y < -1e-6) {
      for (const [y, z0, z1, what] of [[0, BANK, 1e9, "road"], [RIVER, QUAY, BANK, "water"], [TER, BACK, QUAY, "terrace"]] as const) {
        const t = (y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
        if (z > z0 && z <= z1) best = nearer(best, t, what, y === TER && near(x));
      }
    }
    if (d.z < -1e-6) {
      // the quay's wall; the buildings' faces, or through the café's window to its back wall
      let t = (QUAY - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
      if (y > RIVER && y < TER) best = nearer(best, t, "wall", near(x));
      if (this.pane.cross(o, d)) best = nearer(best, (BACK - o.z) / d.z, "wall");
      else {
        t = (FACE - o.z) / d.z;
        x = o.x + d.x * t;
        y = o.y + d.y * t;
        const b = this.row.find((k) => x >= k.x0 && x < k.x1);
        if (b && y > TER && y < TER + b.h) best = nearer(best, t, "wall", near(x));
      }
    }
    for (const b of SOLID) best = nearer(best, rayBox(o, d, b), "table");
    return best;
  }

  override update(dt: number): void {
    super.update(dt);
    this.x = Math.min(END, this.x + SPEED * dt);
    this.bump *= Math.exp(-5 * dt);
    this.bumpAge += dt;
    this.bumpIn -= dt;
    if (this.bumpIn <= 0 && this.x < END) {
      // a seam in the road: a soft thud under the seat
      this.bumpIn = 1.8 + Math.random() * 3;
      this.bump = 1;
      this.bumpAge = 0;
      this.sound?.("B", 0.5, 0.14);
    }
  }

  /** the holes in the café's window; and, when the view is outside it, the car the rifle is in and whoever drives it */
  override draw(B: Beams, outside: number): void {
    this.pane.draw(B);
    if (outside <= 0) return;
    const x = this.x + CAR, k = outside, body = mix(V.blue, V.white, 0.35), sides = [-0.45, 1.25];
    const shape: [number, number][] = [[-2.6, 0.4], [-2.6, 0.95], [-1.9, 1.0], [-1.3, 1.48], [0.5, 1.48], [1.1, 1.0], [2.0, 0.9], [2.0, 0.4]];
    for (const z of sides) {
      shape.forEach(([ax, ay], i) => {
        const [bx, by] = shape[(i + 1) % shape.length];
        B.seg(x + ax, ay, z, x + bx, by, z, body, 1.05, 0.9 * k);
      });
      // the windows' sill, the post between the doors, and the doors' own edges below it
      B.seg(x - 1.9, 1.0, z, x + 1.1, 1.0, z, body, 0.85, 0.8 * k);
      B.seg(x - 0.45, 1.0, z, x - 0.45, 1.48, z, body, 0.85, 0.8 * k);
      for (const dx of [-1.35, -0.45, 0.6]) B.seg(x + dx, 1.0, z, x + dx, 0.45, z, body, 0.6, 0.5 * k);
      for (const wx of [-1.75, 1.3])
        for (let i = 0; i < 10; i++) {
          // (the wheels turn as the road goes by; every other spoke is drawn)
          const a0 = (i / 10) * Math.PI * 2 - this.x / 0.33, a1 = a0 + (Math.PI * 2) / 10, hx = x + wx;
          B.seg(hx + Math.cos(a0) * 0.33, 0.33 + Math.sin(a0) * 0.33, z, hx + Math.cos(a1) * 0.33, 0.33 + Math.sin(a1) * 0.33, z, V.blueMid, 1.05, 0.9 * k);
          if (i % 2 === 0) B.seg(hx, 0.33, z, hx + Math.cos(a0) * 0.33, 0.33 + Math.sin(a0) * 0.33, z, V.blueMid, 0.6, 0.6 * k);
        }
    }
    for (const [ax, ay] of shape) B.seg(x + ax, ay, sides[0], x + ax, ay, sides[1], body, 0.85, 0.7 * k);
    for (const z of [-0.2, 1.0]) {
      B.seg(x + 2.0, 0.7, z, x + 2.35, 0.7, z, V.white, 1.6, 0.9 * k);
      B.seg(x - 2.6, 0.75, z, x - 2.85, 0.75, z, V.red, 1.6, 0.9 * k);
    }
    // the driver, on the left, hands on the wheel (whose head is the game's to put there)
    const hip = new THREE.Vector3(x - 0.12, 0.58, 0), neck = new THREE.Vector3(x - 0.08, 1.08, 0), wx = x + 0.42, wy = 0.98, r = 0.17;
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      B.seg(wx - 0.42 * r * Math.sin(a0), wy + 0.9 * r * Math.sin(a0), r * Math.cos(a0), wx - 0.42 * r * Math.sin(a1), wy + 0.9 * r * Math.sin(a1), r * Math.cos(a1), V.blueMid, 1.05, 0.9 * k);
    }
    B.seg(wx, wy, 0, wx + 0.3, wy - 0.22, 0, V.blueMid, 0.85, 0.8 * k);
    drawSeated(B, { hip, neck, fwd: AHEAD, right: ACROSS, twist: 0, handR: new THREE.Vector3(wx - 0.03, wy + 0.06, 0.15), handL: new THREE.Vector3(wx - 0.03, wy + 0.06, -0.15) }, V.blueMid, k);
    this.driver.pos.copy(neck);
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the near bank: the road's edge, a rail along the water, lamps and trees going by */
  private embankment(): void {
    this.path([-260, 0, -3.2, 260, 0, -3.2], V.blueDim, 0.85, 0.7);
    this.path([-260, 0.14, -3.4, 260, 0.14, -3.4], STONE, 0.85, 0.7);
    this.path([-260, 1.0, -7, 260, 1.0, -7], STONE, 1.05, 0.8);
    this.path([-260, 0.55, -7, 260, 0.55, -7], V.blueDim, 0.6, 0.6);
    for (let x = -260; x <= 260; x += 4) this.path([x, 0, -7, x, 1.0, -7], V.blueDim, 0.85, 0.7);
    this.path([-260, 0, BANK, 260, 0, BANK, 260, RIVER, BANK, -260, RIVER, BANK], V.blueDim, 0.6, 0.5);
    for (let x = -252; x <= 260; x += 28) {
      // a lamp: a post, an arm over the pavement, its light
      this.path([x, 0, -6.4, x, 5.6, -6.4, x, 6, -5], STONE, 1.05, 0.9);
      this.ringXZ(x, 5.9, -5, 0.22, LAMP, 1.3, 1, 6);
      // a tree between each pair: two lines of trunk, a crown of hoops
      const tx = x + 14, r = rng(Math.floor(x) + 900);
      for (const o of [-0.16, 0.16]) this.path([tx + o, 0, -5.6, tx + o * 0.6, 3.2, -5.6], V.green, 1.05, 0.8);
      for (let i = 0; i < 3; i++) this.ringXZ(tx + (r() - 0.5) * 0.6, 3.6 + i * 1.1, -5.6 + (r() - 0.5) * 0.6, 1.7 - i * 0.4, V.green, 0.85, 0.6, 8);
    }
  }

  /**
   * The road itself and the town's side of it, behind the rifle: never in the scope, but it is what
   * the car is seen against when the view is outside it. Lane marks, the far kerb, lamps, a row of
   * house fronts.
   */
  private town(): void {
    const r = rng(2203);
    for (let x = -196; x < 200; x += 8) this.seg(x, 0, 2.6, x + 3.5, 0, 2.6, V.blueMid, 0.85, 0.7);
    this.path([-260, 0, 6.2, 260, 0, 6.2], V.blueDim, 0.85, 0.7);
    this.path([-260, 0.14, 6.4, 260, 0.14, 6.4], STONE, 0.85, 0.7);
    for (let x = -238; x <= 260; x += 28) {
      this.path([x, 0, 7, x, 5.6, 7, x, 6, 5.6], STONE, 1.05, 0.9);
      this.ringXZ(x, 5.9, 5.6, 0.22, LAMP, 1.3, 1, 6);
    }
    const face = 10.5;
    for (let x = -150; x < 150; ) {
      const w = 11 + Math.floor(r() * 9), h = 10 + Math.floor(r() * 11);
      this.rect(x, 0, x + w, h, face, STONE, 1.05, 0.8);
      this.path([x, h, face, x + 1.5, h + 2, face + 3, x + w - 1.5, h + 2, face + 3, x + w, h, face], V.blueDim, 0.85, 0.6);
      // a door, and the windows of the floors over it, a few of them lit
      const door = x + 1.5 + Math.floor(r() * (w - 4));
      this.rect(door, 0, door + 1.1, 2.2, face, V.blueDim, 0.85, 0.7);
      for (let y = 3.6; y < h - 2.4; y += 3.2)
        for (let wx = x + 1.2; wx < x + w - 2; wx += 3) {
          const k = r();
          this.rect(wx, y, wx + 1.5, y + 2.1, face, k > 0.78 ? mix(LAMP, "#000000", 0.35) : V.blueDim, k > 0.78 ? 1.05 : 0.6, k > 0.78 ? 0.8 : 0.45);
        }
      x += w;
    }
  }

  /** the water: glints from here to the far side, a few boats tied up along the quay */
  private river(): void {
    const r = rng(41);
    for (let i = 0; i < 260; i++) {
      const z = BANK - 3 + (QUAY + 6 - BANK) * r(), x = -230 + 460 * r(), len = 1 + 5 * r();
      this.seg(x, RIVER, z, x + len, RIVER, z, r() < 0.15 ? V.white : V.blueDim, 0.6, 0.25 + 0.45 * r());
    }
    for (const [bx, len, mast] of [[-34, 9, 7], [-21, 6, 0], [24, 11, 9], [47, 7, 0], [-66, 8, 6]]) {
      const z = QUAY + 2.2, y = RIVER, hull = mix(V.blue, V.white, 0.25);
      this.path([bx - len / 2, y + 0.9, z, bx - len / 2 + 0.8, y, z, bx + len / 2 - 1.2, y, z, bx + len / 2, y + 1.0, z], hull, 1.05, 0.85, true);
      this.path([bx - len / 2, y + 0.9, z - 1.6, bx + len / 2, y + 1.0, z - 1.6], hull, 0.85, 0.7);
      for (const x of [bx - len / 2, bx + len / 2]) this.path([x, y + 0.95, z, x, y + 0.95, z - 1.6], hull, 0.85, 0.7);
      this.rect(bx - len * 0.2, y + 0.95, bx + len * 0.15, y + 2, z - 0.8, hull, 0.85, 0.8);
      if (mast) this.path([bx + len * 0.2, y + 0.95, z - 0.8, bx + len * 0.2, y + mast, z - 0.8, bx - len / 2, y + 1, z - 0.8], V.blueMid, 0.85, 0.7);
      this.seg(bx + len * 0.2, y + (mast || 2.2), z - 0.8, bx + len * 0.2, y + (mast || 2.2) + 0.15, z - 0.8, V.red, 2.1, 0.9);
    }
  }

  /** the far bank: the quay's wall, the terrace along its top, the row of buildings behind */
  private bank(): void {
    const r = rng(73);
    this.path([-200, TER, QUAY, 200, TER, QUAY], V.blue, 1.3, 0.95);
    this.path([-200, RIVER, QUAY, 200, RIVER, QUAY], V.blueDim, 0.85, 0.6);
    for (let x = -198; x <= 200; x += 6) this.path([x, RIVER, QUAY, x, TER, QUAY], V.blueDim, 0.6, 0.4);
    for (let x = -195; x <= 200; x += 18) this.ringXZ(x, TER - 1.2, QUAY + 0.15, 0.2, STONE, 0.85, 0.7, 6);
    for (const x of [-48, -16, 16, 48]) {
      this.path([x, TER, QUAY - 0.7, x, TER + 4.2, QUAY - 0.7], STONE, 1.05, 0.9);
      this.ringXZ(x, TER + 4.5, QUAY - 0.7, 0.28, LAMP, 1.3, 1, 8);
      this.ringXZ(x, TER + 4.2, QUAY - 0.7, 0.12, LAMP, 0.85, 0.9, 6);
    }
    for (const b of this.row) {
      const top = TER + b.h, cafe = b.cafe;
      this.rect(b.x0, TER, b.x1, top, FACE, cafe ? V.blue : STONE, cafe ? 1.3 : 1.05, cafe ? 1 : 0.8);
      // a roof going back, a chimney, the windows of the floors over the street
      this.path([b.x0, top, FACE, b.x0 + 1.5, top + 2.2, FACE - 3, b.x1 - 1.5, top + 2.2, FACE - 3, b.x1, top, FACE], V.blueDim, 0.85, 0.6);
      const cx = b.x0 + 2 + r() * (b.x1 - b.x0 - 5);
      this.rect(cx, top + 1, cx + 0.9, top + 3.4, FACE - 2, V.blueDim, 0.85, 0.6);
      for (let y = TER + (cafe ? 5 : 1.2); y < top - 2.4; y += 3.3)
        for (let x = b.x0 + 1.2; x < b.x1 - 2; x += 3) {
          const k = r();
          this.rect(x, y, x + 1.5, y + 2.2, FACE, k > 0.8 ? mix(LAMP, "#000000", 0.35) : V.blueDim, k > 0.8 ? 1.05 : 0.6, k > 0.8 ? 0.8 : 0.45);
        }
    }
  }

  /** the café: its window and door, the awning, the room behind the glass, the tables out on the terrace */
  private cafe(): void {
    const p = this.pane, awn = TER + 3.5;
    this.rect(p.x0, p.y0, p.x1, p.y1, FACE, V.blue, 1.6);
    for (const x of [-4, 0, 4]) this.path([x, p.y0, FACE, x, p.y1, FACE], V.blue, 1.05, 0.9);
    this.rect(DOOR.x - 0.6, TER, DOOR.x + 0.6, TER + 2.15, FACE, LAMP, 1.3);
    this.seg(DOOR.x - 0.42, TER + 1.05, FACE, DOOR.x - 0.5, TER + 1.05, FACE, V.white, 1.6);
    // the awning: stripes out over the back tables, a scalloped edge
    for (let x = -9; x <= 11; x += 1) this.path([x, awn, FACE, x, awn - 0.75, FACE + 2.6], x % 2 ? V.pink : V.white, 1.05, 0.85);
    this.path([-9, awn, FACE, 11, awn, FACE], V.pink, 1.05, 0.9);
    const edge: number[] = [];
    for (let i = 0; i <= 40; i++) edge.push(-9 + i * 0.5, awn - 0.75 - (i % 2 ? 0.22 : 0), FACE + 2.6);
    this.path(edge, V.pink, 1.3, 0.95);
    // its sign: a lit board over the awning
    this.rect(-4.5, awn + 0.5, 4.5, awn + 1.7, FACE, LAMP, 1.3, 0.9);
    for (let i = 0; i < 11; i++) this.path([-3.9 + i * 0.78, awn + 0.75, FACE, -3.9 + i * 0.78 + (i % 3 ? 0.3 : 0), awn + 1.45, FACE], LAMP, 1.6, 0.9);
    // inside: the back wall, the counter, three lamps hanging
    this.rect(-11, TER, 11, TER + 3.4, BACK, V.blueDim, 0.85, 0.7);
    this.box({ x0: -6, x1: 2, y0: TER, y1: TER + 1.05, z0: BACK + 0.8, z1: BACK + 1.6 }, STONE, 0.85, 0.8);
    for (const x of [-4.5, -2, 0.5]) {
      this.path([x, TER + 3.4, BACK + 1.6, x, TER + 2.5, BACK + 1.6], V.blueDim, 0.6, 0.8);
      this.ringXZ(x, TER + 2.4, BACK + 1.6, 0.2, LAMP, 1.05, 1, 8);
    }
    // the tables and their chairs; a low hedge in boxes at each end
    for (const [x, z] of TABLES) {
      this.ringXZ(x, TER + 0.75, z, 0.42, V.white, 1.05, 0.9, 10);
      this.path([x, TER + 0.75, z, x, TER, z], STONE, 1.05, 0.9);
      this.ringXZ(x, TER, z, 0.24, STONE, 0.85, 0.8, 6);
      this.ringXZ(x + 0.1, TER + 0.78, z, 0.05, LAMP, 1.05, 1, 5);
      this.chair(x - 0.85, TER, z, 0);
      this.chair(x + 0.85, TER, z, Math.PI);
    }
    for (const x of [-12.2, 12.2]) {
      this.box({ x0: x - 0.3, x1: x + 0.3, y0: TER, y1: TER + 0.5, z0: -109, z1: -101 }, STONE, 0.85, 0.8);
      for (let z = -108.8; z < -101; z += 0.4) this.path([x, TER + 0.5, z, x + 0.12 * Math.sin(z * 9), TER + 1.0 + 0.12 * Math.sin(z * 5), z + 0.1], V.green, 0.85, 0.8);
    }
  }
}
