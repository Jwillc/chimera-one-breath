/**
 * Blood and wreckage as glowing lines: streaks of blood that fly from a wound, fall and leave a
 * splash of spokes on the ground; splinters of glass and bone tumbling as loose shards; the ring
 * where a bullet lands. All in metres, drawn each frame.
 */
import * as THREE from "three";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { rng } from "./place.ts";

/** anything lines can be drawn into */
export interface Sink {
  seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha?: number): void;
}

export const BLOOD = V.red, BLOOD_DARK = mix(V.red, "#000000", 0.35), BLOOD_HOT = mix(V.red, V.white, 0.45);

interface Streak {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  max: number;
  /** leaves a splash where it lands */
  wet: boolean;
  /** not blood: a drop of this colour */
  color?: string;
}
interface Splat {
  segs: Float32Array;
  age: number;
  max: number;
}
interface Shard {
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number; az: number;
  spin: number;
  life: number;
  color: string;
  width: number;
}
interface Ring {
  x: number; y: number; z: number;
  age: number;
  max: number;
  r: number;
  color: string;
}

const G = 12;
const MAX_STREAKS = 500, MAX_SPLATS = 70, MAX_SHARDS = 900;

export class Fx {
  private streaks: Streak[] = [];
  private splats: Splat[] = [];
  private shards: Shard[] = [];
  private rings: Ring[] = [];
  private seed = 1;

  /** `floor`: how high the ground is at (x, z); blood and wreckage fall to it */
  constructor(private readonly floor: (x: number, z: number) => number) {}

  clear(): void {
    this.streaks = [];
    this.splats = [];
    this.shards = [];
    this.rings = [];
  }

  /** a spray of blood from a point, thrown along (dx, dy, dz) and spread round it */
  blood(x: number, y: number, z: number, dx: number, dy: number, dz: number, n: number, speed: number, spread = 0.55): void {
    for (let i = 0; i < n && this.streaks.length < MAX_STREAKS; i++) {
      const s = speed * (0.25 + 0.95 * Math.random());
      this.streaks.push({
        x, y, z,
        vx: (dx + (Math.random() - 0.5) * 2 * spread) * s,
        vy: (dy + (Math.random() - 0.3) * 2 * spread) * s + 1.2,
        vz: (dz + (Math.random() - 0.5) * 2 * spread) * s,
        life: 0,
        max: 0.7 + Math.random() * 0.9,
        wet: Math.random() < 0.2,
      });
    }
  }

  /** one drop falling from a wound */
  drip(x: number, y: number, z: number): void {
    if (this.streaks.length >= MAX_STREAKS) return;
    this.streaks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.5, vy: -0.4, vz: (Math.random() - 0.5) * 0.5, life: 0, max: 1.2, wet: Math.random() < 0.3 });
  }

  /** a drop of something else (drink, water), thrown: it falls and is gone */
  drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string): void {
    if (this.streaks.length >= MAX_STREAKS) return;
    this.streaks.push({ x, y, z, vx, vy, vz, life: 0, max: 1.4, wet: false, color });
  }

  /** blood on the ground: spokes and drops round where it fell */
  splat(x: number, z: number, r: number): void {
    const q = rng(this.seed++ * 7919), n = 5 + Math.floor(q() * 5);
    const segs = new Float32Array((n * 2 + 1) * 6);
    const put = (i: number, x0: number, z0: number, x1: number, z1: number) => {
      segs.set([x0, this.floor(x0, z0) + 0.04, z0, x1, this.floor(x1, z1) + 0.04, z1], i * 6);
    };
    let k = 0;
    const turn = q() * 6;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + (q() - 0.5) * 0.5, len = r * (0.35 + 0.9 * q());
      put(k++, x + Math.cos(a) * r * 0.08, z + Math.sin(a) * r * 0.08, x + Math.cos(a) * len, z + Math.sin(a) * len);
      // a drop thrown past the end of the spoke
      const far = len + r * (0.15 + 0.5 * q());
      put(k++, x + Math.cos(a) * far, z + Math.sin(a) * far, x + Math.cos(a) * (far + 0.05 + 0.08 * q()), z + Math.sin(a) * (far + 0.05 + 0.08 * q()));
    }
    put(k++, x - r * 0.1, z, x + r * 0.1, z);
    this.splats.push({ segs, age: 0, max: 14 + 8 * q() });
    if (this.splats.length > MAX_SPLATS) this.splats.shift();
  }

  /** a line of a broken body, thrown */
  shard(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, vx: number, vy: number, vz: number): void {
    if (this.shards.length >= MAX_SHARDS) this.shards.shift();
    const ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5, al = Math.hypot(ax, ay, az) || 1;
    this.shards.push({
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2,
      hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2,
      vx, vy, vz,
      ax: ax / al, ay: ay / al, az: az / al,
      spin: (Math.random() - 0.5) * 16,
      life: 1.6 + Math.random() * 1.4,
      color, width,
    });
  }

  ring(x: number, y: number, z: number, r: number, color: string, max = 0.22): void {
    this.rings.push({ x, y, z, age: 0, max, r, color });
  }

  update(dt: number): void {
    const st = this.streaks;
    for (let i = st.length - 1; i >= 0; i--) {
      const s = st[i];
      s.life += dt;
      s.vy -= G * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const landed = s.y <= this.floor(s.x, s.z);
      if (landed && s.wet) this.splat(s.x, s.z, 0.25 + Math.random() * 0.45);
      if (landed || s.life > s.max) {
        st[i] = st[st.length - 1];
        st.pop();
      }
    }
    for (let i = this.splats.length - 1; i >= 0; i--) if ((this.splats[i].age += dt) > this.splats[i].max) this.splats.splice(i, 1);
    const sh = this.shards;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i];
      s.life -= dt;
      if (s.life <= 0) {
        sh[i] = sh[sh.length - 1];
        sh.pop();
        continue;
      }
      s.vy -= G * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.spin) {
        // turn the half-length about the shard's own axis (Rodrigues)
        const th = s.spin * dt, c = Math.cos(th), sn = Math.sin(th);
        const d = s.ax * s.hx + s.ay * s.hy + s.az * s.hz;
        const cx = s.ay * s.hz - s.az * s.hy, cy = s.az * s.hx - s.ax * s.hz, cz = s.ax * s.hy - s.ay * s.hx;
        s.hx = s.hx * c + cx * sn + s.ax * d * (1 - c);
        s.hy = s.hy * c + cy * sn + s.ay * d * (1 - c);
        s.hz = s.hz * c + cz * sn + s.az * d * (1 - c);
      }
      const floor = this.floor(s.x, s.z) + 0.03;
      if (s.y < floor) {
        s.y = floor;
        if (s.vy < -1.4) {
          s.vy *= -0.32;
          s.vx *= 0.55;
          s.vz *= 0.55;
          s.spin *= 0.5;
        } else {
          // at rest: lying flat where it stopped
          s.vx = s.vy = s.vz = s.spin = 0;
          s.hy *= 0.15;
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].age += dt) > this.rings[i].max) this.rings.splice(i, 1);
  }

  draw(B: Beams, camera: THREE.Camera): void {
    for (const s of this.streaks) {
      // (a streak is never longer than the way it has come)
      const fade = 1 - s.life / s.max, k = Math.min(0.045, s.life);
      B.seg(s.x, s.y, s.z, s.x - s.vx * k, s.y - s.vy * k, s.z - s.vz * k, s.color ?? (s.life < 0.12 ? BLOOD_HOT : BLOOD), s.color ? 1.3 : 1.6, 0.35 + 0.65 * fade);
    }
    for (const sp of this.splats) {
      const a = sp.segs, fade = Math.min(1, (sp.max - sp.age) / 4), fresh = sp.age < 0.5;
      for (let i = 0; i < a.length; i += 6) B.seg(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5], fresh ? BLOOD : BLOOD_DARK, 1.3, 0.85 * fade);
    }
    for (const s of this.shards) B.seg(s.x - s.hx, s.y - s.hy, s.z - s.hz, s.x + s.hx, s.y + s.hy, s.z + s.hz, s.color, s.width, Math.min(1, s.life / 0.7));
    if (this.rings.length) {
      const e = camera.matrixWorld.elements;
      for (const r of this.rings) {
        const u = r.age / r.max, rad = r.r * (0.25 + 0.75 * Math.sqrt(u)), n = 14;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.6) / n) * Math.PI * 2;
          const c0 = Math.cos(a0) * rad, s0 = Math.sin(a0) * rad, c1 = Math.cos(a1) * rad, s1 = Math.sin(a1) * rad;
          B.seg(r.x + e[0] * c0 + e[4] * s0, r.y + e[1] * c0 + e[5] * s0, r.z + e[2] * c0 + e[6] * s0, r.x + e[0] * c1 + e[4] * s1, r.y + e[1] * c1 + e[5] * s1, r.z + e[2] * c1 + e[6] * s1, r.color, 1.6, 1 - u);
        }
      }
    }
  }
}
