/**
 * The woods: a camp in a clearing, three men who mean to sit out the end of the world in it, a
 * fire, a shelter dug into a bank that is their way out of sight. The rifle is on a ridge, looking
 * down −z through the trees; a trunk in the way stops a bullet as well as it hides a man.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import type { Kind } from "./sound.ts";
import { Scene, nearer, rayBox, rayPost, type Box, type Impact, type Spot, type Trait, rng } from "./place.ts";

const EYE = new THREE.Vector3(0, 11, 0);
/** the middle of the camp, and how far the clearing reaches from it */
const CX = 0, CZ = -137, CLEAR = 13.5;
const FIRE = { x: 2, z: -136 };
const DOOR = { x: -2, z: -141.3 };
const SHELTER: Box = { x0: -7, x1: 4, y0: 0, y1: 2.6, z0: -148.5, z1: -141.6 };
const CRATES: Box = { x0: 6.3, x1: 7.9, y0: 0, y1: 1.1, z0: -140.1, z1: -138.7 };
const TRUCK: Box = { x0: -11.2, x1: -9.2, y0: 0, y1: 1.7, z0: -135.6, z1: -130.8 };
const BARK = mix(V.amber, "#000000", 0.45), LEAF = V.green, LAMP = V.amber;
/** trunks that stand between the ridge and the camp */
const BETWEEN: [number, number, number][] = [[-1.6, -70, 0.28], [3.9, -95, 0.3], [-4.3, -110, 0.3], [7.5, -118, 0.3], [-9.6, -121, 0.32]];

interface Tree {
  x: number;
  z: number;
  r: number;
  h: number;
  near: boolean;
}

export class Woods extends Scene {
  readonly name = "THE WOODS";
  readonly intro = "intro-woods";
  readonly lost = { banner: "INTO THE SHELTER", card: "The target got into the shelter." };
  readonly yaw: [number, number] = [-0.45, 0.45];
  readonly pitch: [number, number] = [-0.3, 0.2];
  readonly home = { yaw: 0, pitch: -0.072 };
  readonly hear = 70;
  /** (no phone works out here, and nobody has a tie) */
  override readonly traits: Trait[] = ["hat", "glasses", "cigar", "drink"];
  override readonly chat: Kind = "camp";
  override readonly men = true;
  override readonly soft = true;
  readonly spots: Spot[] = [
    // the logs round the fire
    { x: 0.6, z: -136, th: 0, sit: true, must: true },
    { x: 3.4, z: -136, th: Math.PI, sit: true },
    { x: 2, z: -137.5, th: Math.PI / 2, sit: true },
    // at the crates, at the shelter's door, at the truck
    { x: 6.1, z: -138.2, th: -0.6 },
    { x: -0.6, z: -141, th: Math.PI / 2 },
    { x: -8.2, z: -133.6, th: Math.PI },
    // the edge of the clearing: a sentry's round
    { x: -6, z: -131, th: 1.4, open: true },
    { x: 6, z: -130.5, th: 1.8, open: true },
    { x: -7.5, z: -137.2, th: 1.2, open: true },
    { x: 10, z: -133, th: 2.0, open: true },
  ];
  private readonly trees: Tree[] = [];
  private crackIn = 0.5;

  constructor() {
    super();
    const r = rng(1847);
    for (const [x, z, rad] of BETWEEN) this.trees.push({ x, z, r: rad, h: 17 + 5 * r(), near: true });
    for (let i = 0; i < 150; i++) {
      // anywhere but the clearing and the line of sight to it
      const x = -75 + 150 * r(), z = -6 - 190 * r(), rad = 0.18 + 0.2 * r(), h = 12 + 12 * r();
      if (Math.hypot(x - CX, z - CZ) < CLEAR || (z > -155 && Math.abs(x) < (-z / 137) * 14 + 2)) continue;
      this.trees.push({ x, z, r: rad, h, near: false });
    }
    this.build(() => {
      this.sky(303, 260, -Math.PI / 2, [120, 210, -640]);
      this.land();
      for (const t of this.trees) this.tree(t, r);
      this.camp();
      this.ridge();
    });
  }

  people(lap: number): { n: number; strollers: number } {
    return { n: lap ? 4 : 3, strollers: lap ? 2 : 1 };
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(EYE);
  }

  /** off in the trees to one side of the clearing */
  override look(): { yaw: number; pitch: number } {
    return { yaw: (Math.random() < 0.5 ? -1 : 1) * (0.13 + 0.09 * Math.random()), pitch: this.home.pitch + 0.02 + 0.03 * Math.random() };
  }

  floor(): number {
    return 0;
  }

  /** round the fire and in at the shelter's door */
  wayOut(p: { x: number; z: number }): { x: number; z: number }[] {
    const last = [{ x: -2, z: -139.9 }, DOOR];
    return p.x > 2.6 ? [{ x: 3.8, z: -139.6 }, ...last] : last;
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3): Impact {
    let best: Impact = { t: 600, what: null, heard: false };
    const near = (t: number, reach: number) => Math.hypot(o.x + d.x * t - CX, o.z + d.z * t - CZ) < reach;
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      best = nearer(best, t, "ground", near(t, 45));
    }
    for (const k of this.trees) {
      const t = rayPost(o, d, k.x, k.z, k.r, 0, k.h);
      if (t > 0) best = nearer(best, t, "tree", near(t, 70));
    }
    for (const b of [SHELTER, CRATES, TRUCK]) best = nearer(best, rayBox(o, d, b), "wall");
    return best;
  }

  override update(dt: number): void {
    super.update(dt);
    // the fire: a tick of the tongue now and then
    this.crackIn -= dt;
    if (this.crackIn <= 0) {
      this.crackIn = 0.2 + 1.5 * Math.random() ** 2;
      this.sound?.("t", 1.5 + 1.5 * Math.random(), 0.04 + 0.05 * Math.random());
    }
  }

  /** the fire: tongues that lick and lean, sparks going up */
  override draw(B: Beams): void {
    const t = this.clock, { x, z } = FIRE;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 0.2 + 0.06 * Math.sin(t * 3 + i), h = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * (6 + (i % 3)) + i * 1.9)) + (i % 2 ? 0.25 : 0);
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, lean = 0.12 * Math.sin(t * 2.3 + i);
      B.seg(bx, 0.08, bz, x + Math.cos(a) * r * 0.3 + lean, 0.1 + h, z + Math.sin(a) * r * 0.3, i % 3 === 0 ? V.white : i % 3 === 1 ? LAMP : V.red, 1.6, 0.9);
      B.seg(bx, 0.08, bz, x + Math.cos(a + 0.8) * r, 0.08, z + Math.sin(a + 0.8) * r, V.red, 1.3, 0.9);
    }
    for (let i = 0; i < 6; i++) {
      const u = (t * (0.35 + 0.07 * i) + i * 0.37) % 1, sx = x + 0.3 * Math.sin(i * 2.4 + u * 5), sy = 0.8 + 2.6 * u;
      B.seg(sx, sy, z + 0.2 * Math.cos(i * 1.7 + u * 4), sx + 0.02, sy + 0.07, z + 0.2 * Math.cos(i * 1.7 + u * 4), LAMP, 1.3, 0.8 * (1 - u));
    }
  }

  // ------------------------------------------------------------------ the fixed drawing
  /** the ground: far hills, the clearing's edge, tufts of grass, the track the truck came in by */
  private land(): void {
    const r = rng(12), hills: number[] = [];
    for (let i = 0; i <= 60; i++) hills.push(-600 + i * 20, 26 + 22 * Math.sin(i * 0.31) + 9 * Math.sin(i * 1.3) + (i % 2 ? 3 : 0), -520);
    this.path(hills, V.blueDim, 0.85, 0.6);
    const edge: number[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, k = CLEAR + 0.9 * Math.sin(i * 2.7);
      edge.push(CX + Math.cos(a) * k, 0, CZ + Math.sin(a) * k);
    }
    this.path(edge, V.blueDim, 0.85, 0.6, true);
    for (let i = 0; i < 420; i++) {
      // grass, thick in the clearing and thin under the trees
      const camp = i < 170, x = camp ? CX + (r() - 0.5) * 2 * CLEAR : -70 + 140 * r(), z = camp ? CZ + (r() - 0.5) * 2 * CLEAR : -10 - 180 * r(), h = 0.15 + 0.3 * r();
      this.seg(x, 0, z, x + (r() - 0.5) * 0.2, h, z, LEAF, 0.6, camp ? 0.5 : 0.3);
    }
    for (const side of [-0.9, 0.9]) {
      const rut: number[] = [];
      for (let i = 0; i <= 14; i++) rut.push(-10.2 + side + 0.8 * Math.sin(i * 0.5), 0, -130 + i * 4.5);
      this.path(rut, V.blueDim, 0.85, 0.5);
    }
  }

  /** a pine: its trunk, and tier on tier of boughs to a point */
  private tree(t: Tree, r: () => number): void {
    const { x, z, h } = t, bark = t.near ? mix(V.amber, "#000000", 0.2) : BARK, a = t.near ? 0.95 : 0.6;
    for (const o of [-t.r, t.r]) this.path([x + o, 0, z, x + o * 0.5, h * 0.55, z], bark, t.near ? 1.3 : 0.85, a);
    this.ringXZ(x, 0, z, t.r, bark, 0.85, a, 6);
    const tiers = 4, base = h * 0.38, n = 5, turn = r() * 6;
    let prev: number[] | null = null;
    for (let k = 0; k < tiers; k++) {
      const y = base + ((h - base) * k) / tiers, rad = (1 - k / tiers) * (1.9 + h * 0.07), ring: number[] = [];
      for (let i = 0; i < n; i++) ring.push(x + Math.cos(turn + k + (i / n) * Math.PI * 2) * rad, y - 0.25 * rad, z + Math.sin(turn + k + (i / n) * Math.PI * 2) * rad);
      this.path(ring, LEAF, 0.85, t.near ? 0.55 : 0.35, true);
      if (prev) for (let i = 0; i < n; i += 2) this.seg(prev[i * 3], prev[i * 3 + 1], prev[i * 3 + 2], ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2], LEAF, 0.6, t.near ? 0.45 : 0.3);
      prev = ring;
    }
    if (prev) for (let i = 0; i < n; i++) this.seg(prev[i * 3], prev[i * 3 + 1], prev[i * 3 + 2], x, h, z, LEAF, 0.6, t.near ? 0.45 : 0.3);
  }

  private camp(): void {
    // the fire's ring of stones, and the logs round it
    this.ringXZ(FIRE.x, 0.06, FIRE.z, 0.42, V.blueMid, 1.3, 0.9, 9);
    for (const [x, z, along] of [[0.6, -136, 0], [3.4, -136, 0], [2, -137.5, 1]] as const) {
      const dx = along ? 0.8 : 0, dz = along ? 0 : 0.8;
      for (const y of [0.18, 0.42]) this.path([x - dx, y, z - dz, x + dx, y, z + dz], BARK, 1.3, 0.9);
      for (const k of [-1, 1]) {
        const p: number[] = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          p.push(x + k * dx + (along ? 0 : Math.cos(a) * 0.14), 0.3 + Math.sin(a) * 0.14, z + k * dz + (along ? Math.cos(a) * 0.14 : 0));
        }
        this.path(p, BARK, 0.85, 0.9, true);
      }
    }
    // a pot on a tripod over the fire
    for (let i = 0; i < 3; i++) this.path([FIRE.x + Math.cos(i * 2.1) * 0.6, 0, FIRE.z + Math.sin(i * 2.1) * 0.6, FIRE.x, 1.5, FIRE.z], V.blueMid, 0.85, 0.8);
    this.path([FIRE.x, 1.5, FIRE.z, FIRE.x, 1.05, FIRE.z], V.blueMid, 0.6, 0.8);
    this.ringXZ(FIRE.x, 1.05, FIRE.z, 0.16, V.white, 1.05, 0.9, 8);
    this.ringXZ(FIRE.x, 0.85, FIRE.z, 0.13, V.white, 0.85, 0.8, 8);

    // the shelter: a bank of earth, a timber front in it, a steel door, sandbags either side
    const S = SHELTER, mx = (S.x0 + S.x1) / 2, front = S.z1;
    for (const k of [0, 0.35, 0.7, 1]) {
      const arc: number[] = [], z = front - k * (front - S.z0), top = S.y1 * (1 + 0.25 * Math.sin(k * Math.PI)) * (k === 1 ? 0.5 : 1);
      for (let i = 0; i <= 14; i++) arc.push(S.x0 + ((S.x1 - S.x0) * i) / 14, top * Math.sin((i / 14) * Math.PI) ** 0.6, z);
      this.path(arc, mix(V.green, V.blue, 0.4), k === 0 ? 1.3 : 0.85, k === 0 ? 0.95 : 0.6);
    }
    for (let i = 2; i <= 12; i += 2) this.path([S.x0 + ((S.x1 - S.x0) * i) / 14, S.y1 * Math.sin((i / 14) * Math.PI) ** 0.6, front, S.x0 + ((S.x1 - S.x0) * i) / 14, 0.5 * S.y1 * Math.sin((i / 14) * Math.PI) ** 0.6, S.z0], mix(V.green, V.blue, 0.4), 0.6, 0.5);
    this.rect(DOOR.x - 1.3, 0, DOOR.x + 1.3, 2.25, front, BARK, 1.6);
    this.rect(DOOR.x - 0.55, 0, DOOR.x + 0.55, 1.95, front, V.blue, 1.6);
    for (const y of [0.5, 1.0, 1.5]) this.seg(DOOR.x - 0.55, y, front, DOOR.x + 0.55, y, front, V.blue, 0.85, 0.7);
    this.ringXZ(DOOR.x + 0.3, 1.0, front + 0.08, 0.09, V.white, 1.05, 0.9, 6);
    for (const side of [-1, 1])
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 4 - row; i++) {
          const x = DOOR.x + side * (1.7 + i * 0.62 + row * 0.3), y = 0.14 + row * 0.26;
          this.rect(x - 0.28, y - 0.12, x + 0.28, y + 0.12, front + 0.5, mix(V.amber, V.white, 0.3), 0.85, 0.75);
        }
    // a lantern on a pole by the door, and the mast behind with its wires and its light
    this.path([1.2, 0, front + 0.3, 1.2, 2.3, front + 0.3, 0.8, 2.3, front + 0.3, 0.8, 2.1, front + 0.3], V.blueMid, 0.85, 0.9);
    this.ringXZ(0.8, 2.0, front + 0.3, 0.12, LAMP, 1.6, 1, 6);
    this.ringXZ(0.8, 1.8, front + 0.3, 0.09, LAMP, 1.05, 0.9, 6);
    const mx2 = 5.5, mz = -144;
    this.path([mx2, 0, mz, mx2, 10, mz], V.blueMid, 1.05, 0.9);
    for (let y = 2; y < 10; y += 2) this.seg(mx2 - 0.25, y, mz, mx2 + 0.25, y, mz, V.blueMid, 0.85, 0.8);
    for (let i = 0; i < 3; i++) this.path([mx2, 8.5, mz, mx2 + Math.cos(i * 2.1 + 0.4) * 4.5, 0, mz + Math.sin(i * 2.1 + 0.4) * 4.5], V.blueDim, 0.6, 0.6);
    this.path([mx2, 10, mz, mx2 + 0.9, 10.6, mz, mx2 - 0.9, 10.6, mz], V.blueMid, 0.85, 0.9, true);
    this.seg(mx2, 10.1, mz, mx2, 10.35, mz, V.red, 2.1, 1);
    this.seg(mx, S.y1 + 0.2, front - 2, mx, S.y1 + 1.2, front - 2, V.blueMid, 1.05, 0.8);

    // crates, two high, cans on them; drums of fuel; a rifle rack
    this.box({ ...CRATES, y1: 0.55 }, mix(V.amber, V.white, 0.2), 1.05, 0.9);
    this.box({ ...CRATES, y0: 0.55, x1: CRATES.x1 - 0.5 }, mix(V.amber, V.white, 0.2), 1.05, 0.9);
    for (const b of [{ ...CRATES, y1: 0.55 }, { ...CRATES, y0: 0.55, x1: CRATES.x1 - 0.5 }]) this.path([b.x0, b.y0, b.z1, b.x1, b.y1, b.z1], mix(V.amber, V.white, 0.2), 0.6, 0.7);
    for (const cx of [6.6, 6.95, 7.2]) this.post(cx, -139.1, 0.07, 1.1, 1.28, V.white, 0.85, 0.9, 5);
    for (const [dx, dz] of [[9.4, -137.4], [10.1, -137.9]]) this.post(dx, dz, 0.3, 0, 0.9, V.red, 0.85, 0.8, 8, 3);
    // the truck: a cab, a bed, wheels; nose toward the ridge
    const T = TRUCK, steel = mix(V.blue, V.white, 0.25);
    for (const x of [T.x0, T.x1]) {
      this.path([x, 0.45, T.z1, x, 1.05, T.z1, x, 1.1, T.z1 - 1.3, x, T.y1, T.z1 - 1.7, x, T.y1, T.z1 - 2.9, x, 1.1, T.z1 - 2.9, x, 1.1, T.z0, x, 0.45, T.z0], steel, 1.05, 0.9, true);
      for (const wz of [T.z1 - 0.9, T.z0 + 0.9]) {
        const p: number[] = [];
        for (let i = 0; i < 10; i++) p.push(x, 0.4 + Math.sin((i / 10) * Math.PI * 2) * 0.4, wz + Math.cos((i / 10) * Math.PI * 2) * 0.4);
        this.path(p, V.blueMid, 1.05, 0.9, true);
      }
    }
    for (const [y, z] of [[0.45, T.z1], [1.05, T.z1], [1.1, T.z1 - 1.3], [T.y1, T.z1 - 1.7], [T.y1, T.z1 - 2.9], [1.1, T.z1 - 2.9], [1.1, T.z0], [0.45, T.z0]]) this.path([T.x0, y, z, T.x1, y, z], steel, 0.85, 0.8);
    for (const x of [T.x0 + 0.3, T.x1 - 0.3]) this.seg(x, 0.8, T.z1, x, 0.8, T.z1 + 0.15, V.white, 1.6, 0.6);
  }

  /** where the rifle lies: a lip of rock, ferns either side of the barrel */
  private ridge(): void {
    const y = EYE.y - 0.32, r = rng(5), rock: number[] = [];
    for (let i = 0; i <= 30; i++) rock.push(-15 + i, y - 0.05 + 0.18 * Math.sin(i * 1.7) * Math.sin(i * 0.4), -1.5 + 0.25 * Math.sin(i * 0.9));
    this.path(rock, V.blueMid, 1.3, 0.9);
    this.path(rock.map((v, i) => (i % 3 === 1 ? v - 0.7 : i % 3 === 2 ? v - 0.9 : v)), V.blueDim, 0.85, 0.7);
    for (let i = 0; i < 26; i++) {
      const x = (r() < 0.5 ? -1 : 1) * (0.5 + 5 * r()), z = -1.2 - 1.6 * r(), lean = (r() - 0.5) * 0.7;
      // (kept under the lip: nothing of the ridge stands in the scope's way)
      this.path([x, y - 0.6, z, x + lean * 0.5, y - 0.25 - 0.1 * r(), z - 0.1, x + lean, y - 0.08 - 0.15 * r(), z - 0.3], LEAF, 0.85, 0.7);
    }
  }
}
