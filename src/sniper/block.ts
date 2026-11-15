/**
 * The block: a square in the city at night, and a crowd of strangers in it, seen from a roof on the
 * other side of the road. The rifle rests on the roof's edge and looks down −z over the traffic at
 * the square: its paving, a fountain at the back, a kiosk, a bus stop, the tables of a café, and
 * the row of buildings behind with two alleys through it. Twenty people, no two dressed alike, and
 * the target is told only by how they look (`looks.ts`).
 *
 * The roof itself is never in the scope; it is where the opening is set.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { Scene, nearer, rayBox, rayPost, rng, traffic, type Box, type Impact, type Opening, type Spot } from "./place.ts";

const EYE = new THREE.Vector3(0, 24, 0);
/** the roof the rifle is on: its surface, the top of the low wall at its edge and where that wall stands (z), half its width, how far back it goes */
const ROOF = EYE.y - 0.95, COPING = EYE.y - 0.3, EDGE = { z0: -0.2, z1: 0 }, ROOF_HALF = 11, ROOF_BACK = 15;
/** the road's far kerb; the square from there to the row's face, and half its width; the streets either side of it end at the buildings there */
const KERB = -29, FACE = -88, HALF = 36, SIDE = 50;
/** the row behind the square: three buildings, an alley between each */
const ROW: { x0: number; x1: number; h: number }[] = [{ x0: -HALF, x1: -15, h: 17 }, { x0: -11, x1: 11, h: 23 }, { x0: 15, x1: HALF, h: 14 }];
const ALLEY = 13;
const BLOCKS: Box[] = [
  ...ROW.map(({ x0, x1, h }): Box => ({ x0, x1, y0: 0, y1: h, z0: FACE - 20, z1: FACE })),
  ...[-1, 1].map((s): Box => ({ x0: s < 0 ? -SIDE - 30 : SIDE, x1: s < 0 ? -SIDE : SIDE + 30, y0: 0, y1: s < 0 ? 31 : 26, z0: FACE - 26, z1: KERB + 1 })),
];
const FOUNT = { x: 0, z: -75, r: 3, rim: 0.45, post: 2.4 };
const KIOSK: Box = { x0: -31.5, x1: -28, y0: 0, y1: 2.6, z0: -47, z1: -43.5 };
const TREES: [number, number][] = [[-33, -55], [33, -47], [-33.5, -70], [33, -64]];
const LAMPS: [number, number][] = [[-20, -34.5], [20, -34.5], [-34, -62], [34, -56], [-13, -85.5], [13, -85.5]];
const TABLES: [number, number][] = [[20, -81], [25, -83], [30, -80.5]];
const BENCHES: [number, number][] = [[-31, -27.6], [5, 8.4]];
const STONE = V.blueMid, LAMP = V.amber, WALL = mix(V.blue, V.white, 0.2);

const open = (x: number, z: number, th: number): Spot => ({ x, z, th, open: true });
const sat = (x: number, z: number, th: number): Spot => ({ x, z, th, sit: true });

export class Block extends Scene {
  readonly name = "THE BLOCK";
  readonly intro = "intro-block";
  readonly lost = { banner: "LOST IN THE CROWD", card: "The target got away." };
  readonly yaw: [number, number] = [-0.85, 0.85];
  readonly pitch: [number, number] = [-0.68, -0.12];
  readonly home = { yaw: 0, pitch: -0.4 };
  /** (a roof is a long way up: the square's talk comes faint, the nearer of it less so, and one voice at a time with quiet between) */
  readonly hear = 16;
  override readonly talk = { at: 1, gap: 3.5 };
  /** (forty seconds on this roof, and then the police are up the stairs and out of the hut's door) */
  override readonly limit = { seconds: 40, banner: "THE POLICE ARE ON THE ROOF", card: "Forty seconds on that roof was all there was. The police came up the stairs before you found your target.", door: [6, 6.9] as [number, number] };
  override readonly looks = true;
  /**
   * The view goes round the roof as whoever is on it comes to its edge at a crouch, a case in one
   * hand, looks about, puts the rifle together on one knee below the wall, and only then leans it
   * over the edge; then in at the scope. (At the street's own speed.)
   */
  override readonly opening: Opening = {
    rule: "FIND THEM IN FORTY SECONDS",
    more: ["YOUR TARGET IS ONE STRANGER IN THE SQUARE BELOW.", "GO BY THEIR HAIR, THEIR CLOTHES, WHAT THEY HAVE."],
    orbit: 7.4,
    sweep: 3.3,
    centre: [0, -0.4, 0.55],
    far: 6.2,
    near: 2.4,
    high: 1.7,
    low: 0.5,
    pace: 1,
    assemble: true,
    stealth: true,
  };
  readonly spots: Spot[] = [
    // the open paving: anyone may walk from any of these to any other
    open(-24, -39, 1.2), open(-12, -38, 1.9), open(0, -40, 1.5), open(11, -37.5, 1.1), open(23, -40, 2.0),
    open(-26, -50, 0.4), open(-15, -53, 1.6), open(-4, -49, 2.3), open(7, -52, 1.0), open(18, -48, 1.7), open(26.5, -54, 2.6),
    open(-21, -64, 0.9), open(-8, -62, 1.4), open(5, -66, 1.8), open(17, -63, 2.2), open(26, -67, 2.8),
    // at the kiosk's counter, and beside it
    { x: -26.6, z: -45.2, th: Math.PI },
    { x: -29.5, z: -42.3, th: 1.4 },
    // waiting at the bus stop
    { x: -13.4, z: -33.8, th: 1.5 },
    { x: -10.3, z: -34.1, th: 1.2 },
    // on the fountain's rim, and standing by it
    sat(0.9, FOUNT.z + FOUNT.r + 0.25, 1.5),
    sat(-2.3, FOUNT.z + FOUNT.r - 0.45, 2.1),
    { x: 4.8, z: -72.4, th: 2.6 },
    { x: -5.2, z: -73.6, th: 0.5 },
    // the benches under the row's windows
    sat(-30.2, FACE + 1.5, 1.5), sat(-28.6, FACE + 1.5, 1.7), sat(5.8, FACE + 1.5, 1.4), sat(7.6, FACE + 1.5, 1.6),
    // the café's tables: beside each, and behind it
    sat(19.1, -81, 0.5), sat(20, -81.9, 1.5), sat(25.9, -83, 2.6), sat(25, -83.9, 1.6), sat(29.1, -80.5, 0.4), sat(30.9, -80.5, 2.7),
    // under the lamps and along the square's edges, talking
    { x: -31, z: -60, th: 0.3 },
    { x: 30.5, z: -58.5, th: 2.8 },
    { x: -32, z: -77, th: 0.9 },
    { x: 31, z: -71, th: 2.4 },
    { x: 13.5, z: -84.5, th: 1.5 },
    { x: -19, z: -84, th: 1.3 },
  ];

  constructor() {
    super();
    this.build(() => {
      this.sky(1620, 200, -Math.PI / 2, [-190, 230, -600]);
      this.sky(1621, 120, Math.PI / 2, null);
      this.road();
      this.square();
      this.row();
      this.city();
      this.roof();
    });
  }

  /** a crowd (a smaller one where every head costs: a phone), most of it on its feet */
  people(_lap: number, light = false): { n: number; strollers: number } {
    return light ? { n: 14, strollers: 6 } : { n: 20, strollers: 9 };
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** over the far side of the square, by the fountain */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() - 0.5) * 0.3, pitch: -0.3 - Math.random() * 0.04 };
  }

  floor(): number {
    return 0;
  }

  /** by an alley through the row, or to the street at the side and away up it: whichever is nearer */
  wayOut(p: { x: number; z: number }): { x: number; z: number }[] {
    const side = p.x < 0 ? -1 : 1, alley = { x: side * ALLEY, z: FACE + 1.5 }, street = side * (HALF + 7);
    if (Math.hypot(p.x - alley.x, p.z - alley.z) < Math.abs(street - p.x)) {
      // (from the fountain's near side: round it, not over it)
      const round = p.z > FOUNT.z && Math.abs(p.x - FOUNT.x) < FOUNT.r + 2.5 ? [{ x: FOUNT.x + side * (FOUNT.r + 2.5), z: p.z }] : [];
      return [...round, alley, { x: alley.x, z: FACE - 16 }];
    }
    // (round the kiosk, not through it)
    const blocked = side < 0 && p.x > KIOSK.x0 && p.z > KIOSK.z0 - 1 && p.z < KIOSK.z1 + 1;
    const z = blocked ? KIOSK.z1 + 2 : p.z;
    return [...(blocked ? [{ x: p.x, z }] : []), { x: street, z }, { x: street, z: FACE - 18 }];
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    let best: Impact = { t: 500, what: null, heard: false };
    if (d.y < -1e-6) {
      const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
      best = nearer(best, t, "street", z < KERB + 4 && z > FACE - 6 && Math.abs(x) < SIDE);
    }
    for (const b of BLOCKS) best = nearer(best, rayBox(o, d, b), "wall");
    best = nearer(best, rayBox(o, d, KIOSK), "wall");
    best = nearer(best, rayPost(o, d, FOUNT.x, FOUNT.z, FOUNT.r, 0, FOUNT.rim), "stone");
    best = nearer(best, rayPost(o, d, FOUNT.x, FOUNT.z, 0.35, 0, FOUNT.post), "stone");
    for (const [x, z] of TREES) best = nearer(best, rayPost(o, d, x, z, 0.22, 0, 3.4), "tree");
    return best;
  }

  /** the traffic on the road below, the fountain's water, a sign over the middle door, the light on the mast */
  override draw(B: Beams): void {
    const t = this.clock;
    traffic(B, t, 0, -13, 6, 220);
    // the water: up out of the post and over, in six arcs, each a run of drops going down it
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, cx = Math.cos(a), cz = Math.sin(a);
      for (let k = 0; k < 5; k++) {
        const u0 = (k + ((t * 1.7 + i * 0.37) % 1)) / 5, u1 = Math.min(1, u0 + 0.11);
        const at = (u: number): [number, number, number] => [FOUNT.x + cx * 2.1 * u, FOUNT.post + 1.5 * u - 3.5 * u * u, FOUNT.z + cz * 2.1 * u];
        const p = at(u0), q = at(u1);
        B.seg(p[0], p[1], p[2], q[0], q[1], q[2], V.white, 0.85, 0.75);
      }
    }
    const ripple = 1.6 + 0.9 * ((t * 0.6) % 1);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      B.seg(FOUNT.x + Math.cos(a0) * ripple, 0.3, FOUNT.z + Math.sin(a0) * ripple, FOUNT.x + Math.cos(a1) * ripple, 0.3, FOUNT.z + Math.sin(a1) * ripple, V.blue, 0.6, 0.5 * (1 - ((t * 0.6) % 1)));
    }
    // the sign: a tube of light that does not quite stay lit
    const lit = Math.sin(t * 31) > -0.2 || Math.sin(t * 2.3) > -0.6 ? 0.95 : 0.25, y = 5.2, z = FACE + 0.25;
    for (let i = 0; i < 8; i++) B.seg(-3.2 + i * 0.8, y + (i % 2 ? 0.7 : 0), z, -2.4 + i * 0.8, y + (i % 2 ? 0 : 0.7), z, V.pink, 1.6, lit);
    B.seg(-3.6, y - 0.35, z, 3.6, y - 0.35, z, V.pink, 1.3, lit);
    if (Math.sin(t * 2.6) > 0.3) B.seg(8.5, ROOF + 6.2, 3, 8.5, ROOF + 6.45, 3, V.red, 2.1, 1);
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the road between the roof and the square: its kerbs, its middle line, a crossing over it */
  private road(): void {
    for (const z of [-8, KERB]) this.path([-200, 0, z, 200, 0, z], STONE, 0.85, 0.7);
    for (let x = -196; x < 200; x += 9) this.seg(x, 0, -18.5, x + 4, 0, -18.5, V.blueDim, 0.85, 0.5);
    for (let z = -10; z > KERB + 1; z -= 2.4) this.path([-3.2, 0, z, 3.2, 0, z], V.blueMid, 1.05, 0.55);
    // the pavement along the square's near side, and the bus stop on it
    this.path([-SIDE, 0, KERB - 1.4, SIDE, 0, KERB - 1.4], V.blueDim, 0.6, 0.5);
    const x0 = -15, x1 = -9, z0 = -31.6, z1 = -30.2, top = 2.45;
    this.slab(x0, z0, x1, z1, top, WALL, 1.05, 0.9);
    for (const x of [x0, x1]) this.path([x, 0, z1, x, top, z1], WALL, 0.85, 0.8);
    this.rect(x0, 0.5, x1, top, z1, V.blueDim, 0.6, 0.5);
    this.path([x0 + 0.8, 0.45, z1 - 0.35, x1 - 0.8, 0.45, z1 - 0.35], WALL, 1.05, 0.8);
    this.path([x1 + 0.9, 0, z0, x1 + 0.9, 2.9, z0], WALL, 0.85, 0.8);
    this.rect(x1 + 0.6, 2.4, x1 + 1.2, 2.9, z0, LAMP, 1.05, 0.9);
  }

  /** the square: its edge and its paving, the lamps, the trees, the kiosk, the fountain, the benches and the café */
  private square(): void {
    this.slab(-HALF, FACE, HALF, KERB - 3, 0.02, STONE, 1.05, 0.8);
    for (let x = -30; x <= 30; x += 6) this.path([x, 0, FACE, x, 0, KERB - 3], V.blueDim, 0.6, 0.28);
    for (let z = FACE + 8; z < KERB - 3; z += 8) this.path([-HALF, 0, z, HALF, 0, z], V.blueDim, 0.6, 0.28);
    // set into the middle of it: two rings and the points of a star
    this.ringXZ(0, 0.01, -52, 11, V.blueMid, 0.85, 0.55, 32);
    this.ringXZ(0, 0.01, -52, 7.4, V.blueDim, 0.85, 0.5, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = a + Math.PI / 8, c = a + Math.PI / 4;
      this.path([Math.cos(a) * 7.4, 0.01, -52 + Math.sin(a) * 7.4, Math.cos(b) * 3, 0.01, -52 + Math.sin(b) * 3, Math.cos(c) * 7.4, 0.01, -52 + Math.sin(c) * 7.4], V.blueDim, 0.6, 0.45);
    }
    for (const [x, z] of LAMPS) {
      this.path([x, 0, z, x, 4.6, z], V.blueDim, 0.85, 0.8);
      this.ringXZ(x, 4.8, z, 0.3, LAMP, 1.6, 0.95, 8);
      this.ringXZ(x, 0.02, z, 2.6, LAMP, 0.6, 0.22, 14);
    }
    for (const [x, z] of TREES) {
      // a trunk, and a head of leaves in rings
      const leaf = mix(V.green, V.blue, 0.35);
      this.post(x, z, 0.2, 0, 3.4, V.blueDim, 0.85, 0.8, 5, 2);
      for (const [y, r] of [[3.4, 1.5], [4.4, 2.3], [5.5, 1.9], [6.4, 1.0]]) this.ringXZ(x, y, z, r, leaf, 0.85, 0.6, 9);
      for (let i = 0; i < 9; i += 3) {
        const a = (i / 9) * Math.PI * 2;
        this.path([x + Math.cos(a) * 1.5, 3.4, z + Math.sin(a) * 1.5, x + Math.cos(a) * 2.3, 4.4, z + Math.sin(a) * 2.3, x + Math.cos(a) * 1.9, 5.5, z + Math.sin(a) * 1.9, x + Math.cos(a), 6.4, z + Math.sin(a)], leaf, 0.6, 0.5);
      }
      this.ringXZ(x, 0.02, z, 0.9, V.blueDim, 0.6, 0.5, 8);
    }
    // the kiosk: a box with a counter open toward the square, a roof wider than it, its lit sign
    const K = KIOSK;
    this.box(K, WALL, 1.05, 0.9);
    this.slab(K.x0 - 0.4, K.z0 - 0.4, K.x1 + 0.9, K.z1 + 0.4, K.y1, WALL, 1.05, 0.9);
    this.path([K.x1, 1.05, K.z0 + 0.4, K.x1, 1.05, K.z1 - 0.4, K.x1, 2.1, K.z1 - 0.4, K.x1, 2.1, K.z0 + 0.4], LAMP, 1.05, 0.85, true);
    this.path([K.x1 + 0.3, 1.05, K.z0 + 0.4, K.x1 + 0.3, 1.05, K.z1 - 0.4], WALL, 1.05, 0.9);
    this.rect(K.x0 + 0.5, K.y1 + 0.1, K.x1 - 0.5, K.y1 + 0.7, K.z1, V.green, 1.3, 0.9);
    // the fountain: a round basin, a step round it, the post the water comes out of and the bowl on it
    const F = FOUNT;
    for (const [r, y, w] of [[F.r, F.rim, 1.3], [F.r - 0.3, F.rim, 0.85], [F.r, 0, 0.85], [F.r + 0.7, 0.02, 0.6]] as const) this.ringXZ(F.x, y, F.z, r, WALL, w, 0.9, 20);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.path([F.x + Math.cos(a) * F.r, 0, F.z + Math.sin(a) * F.r, F.x + Math.cos(a) * F.r, F.rim, F.z + Math.sin(a) * F.r], WALL, 0.85, 0.7);
    }
    this.post(F.x, F.z, 0.3, 0, F.post, WALL, 0.85, 0.9, 6, 2);
    this.ringXZ(F.x, F.post - 0.3, F.z, 0.9, WALL, 1.05, 0.9, 10);
    this.ringXZ(F.x, 0.3, F.z, F.r - 0.4, V.blue, 0.6, 0.4, 20);
    // the benches: a seat, a back, toward the square
    for (const [x0, x1] of BENCHES) {
      const z = FACE + 1.1;
      for (const [y, dz] of [[0.42, 0.1], [0.42, 0.5], [0.72, 0], [0.95, -0.05]]) this.path([x0, y, z + dz, x1, y, z + dz], WALL, 1.05, 0.85);
      for (const x of [x0 + 0.2, x1 - 0.2]) this.path([x, 0, z + 0.5, x, 0.42, z + 0.5, x, 0.42, z + 0.1, x, 0.95, z - 0.05, x, 0, z + 0.05], V.blueDim, 0.85, 0.8);
    }
    // the café: its tables and chairs, the awning over its window
    const chairs: [number, number, number][] = [[19.1, -81, 0], [20, -81.9, Math.PI / 2], [25.9, -83, Math.PI], [25, -83.9, Math.PI / 2], [29.1, -80.5, 0], [30.9, -80.5, Math.PI]];
    for (const [x, z] of TABLES) {
      this.ringXZ(x, 0.74, z, 0.42, WALL, 1.05, 0.9, 10);
      this.path([x, 0, z, x, 0.74, z], V.blueDim, 0.85, 0.8);
      this.seg(x - 0.05, 0.76, z, x + 0.05, 0.9, z, LAMP, 1.3, 0.9);
    }
    for (const [x, z, th] of chairs) this.chair(x, 0, z, th, V.blueMid);
    for (let x = 17; x <= 34; x += 1.7) this.path([x, 3.5, FACE, x, 2.9, FACE + 3.2], x % 3.4 < 1.7 ? V.pink : V.white, 0.85, 0.6);
    this.path([17, 2.9, FACE + 3.2, 34, 2.9, FACE + 3.2], V.pink, 1.3, 0.85);
    this.path([17, 3.5, FACE, 34, 3.5, FACE], V.pink, 0.85, 0.7);
  }

  /** the row behind the square: each building's face, its shop below and its windows over, the dark of the alleys between */
  private row(): void {
    const r = rng(77);
    ROW.forEach(({ x0, x1, h }, n) => {
      this.rect(x0, 0, x1, h, FACE, WALL, 1.3, 0.9);
      this.path([x0, h, FACE, x0, h, FACE - 20, x1, h, FACE - 20, x1, h, FACE], STONE, 0.85, 0.6);
      this.path([x0, 4.2, FACE, x1, 4.2, FACE], STONE, 0.85, 0.7);
      // the shop: a door in the middle, a lit window either side
      const mid = (x0 + x1) / 2, glass = n === 2 ? V.amber : n === 1 ? mix(V.pink, V.white, 0.4) : mix(V.green, V.white, 0.4);
      this.rect(mid - 0.8, 0, mid + 0.8, 2.6, FACE, WALL, 1.05, 0.9);
      for (const side of [-1, 1]) this.rect(mid + side * 1.6, 0.6, mid + side * (x1 - x0) * 0.42, 3.2, FACE, glass, 1.05, 0.6);
      // the floors over it: a window in every bay, a few of them lit
      for (let y = 5.6; y + 2 < h; y += 3.4) for (let x = x0 + 1.5; x + 1.6 < x1; x += 3.1) {
        const on = r() < 0.3;
        this.rect(x, y, x + 1.6, y + 2, FACE, on ? LAMP : V.blueDim, on ? 1.05 : 0.6, on ? 0.7 : 0.45);
      }
    });
    for (const side of [-1, 1]) {
      // an alley: its ground going back, a lamp far down it
      const x = side * ALLEY;
      this.path([x - 2, 0, FACE, x - 2, 0, FACE - 20], V.blueDim, 0.6, 0.5);
      this.path([x + 2, 0, FACE, x + 2, 0, FACE - 20], V.blueDim, 0.6, 0.5);
      this.seg(x - 0.3, 3.6, FACE - 18, x + 0.3, 3.6, FACE - 18, LAMP, 1.6, 0.7);
    }
  }

  /** the buildings either side of the square and the town beyond the row */
  private city(): void {
    const r = rng(404);
    for (const b of BLOCKS.slice(ROW.length)) {
      const inner = b.x0 > 0 ? b.x0 : b.x1;
      this.box(b, V.blueDim, 0.85, 0.6);
      // the face on the square: floors, and a few lit windows
      for (let y = 4; y < b.y1; y += 3.6) this.path([inner, y, b.z0, inner, y, b.z1], V.blueDim, 0.6, 0.35);
      for (let i = 0; i < 16; i++) {
        const y = 5 + Math.floor(r() * ((b.y1 - 6) / 3.6)) * 3.6, z = b.z1 - 3 - Math.floor(r() * 26) * 3;
        this.seg(inner, y, z, inner, y, z - 1.5, r() < 0.7 ? LAMP : V.blue, 1.05, 0.3 + 0.3 * r());
      }
    }
    for (let i = 0; i < 16; i++) this.block(r, -210 + i * 28 + r() * 10, FACE - 50 - r() * 110, 16 + r() * 16, 14, 30 + r() * 55);
    // behind the roof and beside it (seen only as the opening goes round)
    for (const [cx, cz, w, dp, h] of [[-24, 8, 22, 18, ROOF - 5], [26, 9, 26, 20, ROOF + 7], [-14, 40, 30, 22, ROOF + 14], [20, 44, 26, 20, ROOF + 22], [-50, 30, 24, 26, ROOF + 9], [58, 36, 26, 24, ROOF + 3]] as const) {
      const b: Box = { x0: cx - w / 2, x1: cx + w / 2, y0: 0, y1: h, z0: cz - dp / 2, z1: cz + dp / 2 };
      this.box(b, V.blueDim, 0.85, 0.55);
      // (their lit windows are on the face toward the road)
      for (let k = 0; k < w * h * 0.012; k++) {
        const x = b.x0 + 2 + Math.floor(r() * ((w - 4) / 3.5)) * 3.5, y = 3 + Math.floor(r() * ((h - 5) / 3.6)) * 3.6;
        this.seg(x, y, b.z0, x + 1.5, y, b.z0, r() < 0.7 ? LAMP : V.blue, 1.05, 0.25 + 0.3 * r());
      }
    }
  }

  /** the roof the rifle is on: the wall at its edge, what stands on it, the building's own face below */
  private roof(): void {
    const W = ROOF_HALF, r = rng(9);
    // the wall along the edge: its top is what the rifle rests over
    this.box({ x0: -W, x1: W, y0: ROOF, y1: COPING, z0: EDGE.z0, z1: EDGE.z1 }, STONE, 1.05, 0.9);
    this.slab(-W, EDGE.z0 - 0.06, W, EDGE.z1 + 0.06, COPING, V.blue, 1.3, 0.95);
    for (const x of [-W, W]) {
      this.path([x, COPING, EDGE.z1, x, COPING, ROOF_BACK], STONE, 1.05, 0.8);
      this.path([x, ROOF, EDGE.z1, x, ROOF, ROOF_BACK], V.blueDim, 0.85, 0.7);
      for (let z = 3; z <= ROOF_BACK; z += 4) this.path([x, ROOF, z, x, COPING, z], V.blueDim, 0.85, 0.6);
    }
    this.path([-W, COPING, ROOF_BACK, W, COPING, ROOF_BACK], STONE, 1.05, 0.8);
    for (let z = 2.5; z < ROOF_BACK; z += 2.5) this.path([-W, ROOF, z, W, ROOF, z], V.blueDim, 0.6, 0.3);
    for (let x = -W + 2.75; x < W; x += 2.75) this.path([x, ROOF, EDGE.z1, x, ROOF, ROOF_BACK], V.blueDim, 0.6, 0.3);
    // the head of the stairs: a hut, its door, a lamp over that
    const hut: Box = { x0: 4.4, x1: 7.6, y0: ROOF, y1: ROOF + 2.5, z0: 7, z1: 10.4 };
    this.box(hut, STONE, 1.05, 0.85);
    this.rect(5.5, ROOF, 6.5, ROOF + 2, hut.z0, WALL, 1.05, 0.9);
    this.seg(5.7, ROOF + 2.25, hut.z0 - 0.1, 6.3, ROOF + 2.25, hut.z0 - 0.1, LAMP, 2.1, 0.95);
    // a water tank on its legs
    const tx = -6, tz = 9.5, ty = ROOF + 1.5;
    this.post(tx, tz, 1.5, ty, ty + 2.4, WALL, 0.85, 0.85, 10, 3);
    for (let i = 0; i < 10; i += 2) {
      const a = (i / 10) * Math.PI * 2;
      this.path([tx + Math.cos(a) * 1.5, ty + 2.4, tz + Math.sin(a) * 1.5, tx, ty + 3.1, tz], WALL, 0.85, 0.8);
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.path([tx + dx * 1.05, ROOF, tz + dz * 1.05, tx + dx * 1.05, ty, tz + dz * 1.05], STONE, 0.85, 0.8);
      this.path([tx + dx * 1.05, ROOF, tz + dz * 1.05, tx - dz * 1.05, ty, tz + dx * 1.05], V.blueDim, 0.6, 0.6);
    }
    // vents, a duct between them, and the mast
    for (const [x, z] of [[-3.2, 4.6], [2.6, 12]]) {
      this.box({ x0: x - 0.5, x1: x + 0.5, y0: ROOF, y1: ROOF + 0.7, z0: z - 0.5, z1: z + 0.5 }, STONE, 0.85, 0.8);
      this.ringXZ(x, ROOF + 0.72, z, 0.36, WALL, 0.85, 0.8, 8);
      this.path([x - 0.36, ROOF + 0.72, z, x + 0.36, ROOF + 0.72, z], WALL, 0.6, 0.7);
    }
    this.path([-3.2, ROOF + 0.25, 5.1, -3.2, ROOF + 0.25, 8, -5, ROOF + 0.25, 8], STONE, 1.05, 0.7);
    this.path([8.5, ROOF, 3, 8.5, ROOF + 6.2, 3], WALL, 1.05, 0.9);
    for (const [y, half] of [[3.6, 0.9], [4.5, 0.7], [5.4, 0.45]]) this.path([8.5 - half, ROOF + y, 3, 8.5 + half, ROOF + y, 3], WALL, 0.85, 0.85);
    for (const s of [-1, 1]) this.path([8.5, ROOF + 4.2, 3, 8.5 + s * 1.6, ROOF, 3 + 1.2], V.blueDim, 0.6, 0.6);
    // the building's face, down to the street: floors, and windows with a light on in a few
    this.rect(-W, 0, W, ROOF, EDGE.z0, STONE, 1.05, 0.8);
    for (let y = ROOF - 3.2; y > 2; y -= 3.4) {
      this.path([-W, y + 2.5, EDGE.z0, W, y + 2.5, EDGE.z0], V.blueDim, 0.6, 0.35);
      for (let x = -W + 1.4; x + 1.6 < W; x += 3.1) {
        const on = r() < 0.25;
        this.rect(x, y, x + 1.6, y + 2, EDGE.z0, on ? LAMP : V.blueDim, on ? 1.05 : 0.6, on ? 0.65 : 0.45);
      }
    }
    for (const x of [-W, W]) this.path([x, 0, EDGE.z0, x, 0, ROOF_BACK, x, ROOF, ROOF_BACK], V.blueDim, 0.6, 0.4);
  }
}
