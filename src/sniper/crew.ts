/**
 * The people on the player's side, seen only when the view is outside the scope (a contract's
 * opening): whoever holds the rifle and, in the car, whoever drives. Wire bodies like the cast's,
 * sitting; their heads are spare heads of the cast's, which the game places.
 */
import * as THREE from "three";
import { V, mix } from "../ui/colors.ts";
import type { Lines } from "./things.ts";

/** metres per body cm of one of their heads (life size: nobody looks at these through a scope) */
export const CREW_HEAD = 0.012;
const SKIN = mix(V.amber, V.white, 0.55), UP = new THREE.Vector3(0, 1, 0);

export interface Sitter {
  /** the hips and the base of the neck */
  hip: THREE.Vector3;
  neck: THREE.Vector3;
  /** the way the chest faces and its right, both level */
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  /** how far the right shoulder is drawn back and the left pushed forward (m): a rifle's butt is in it */
  twist: number;
  handR: THREE.Vector3;
  handL: THREE.Vector3;
  /** where the knees and feet are, if not as someone sitting on a seat (crouching, kneeling) */
  legs?: { kneeR: THREE.Vector3; footR: THREE.Vector3; kneeL: THREE.Vector3; footL: THREE.Vector3 };
}

/** Someone sitting: a trunk of three rings, arms out to where the hands are, thighs along the seat and shins down. */
export function drawSeated(B: Lines, s: Sitter, color: string, alpha: number): void {
  const dim = mix(color, "#000000", 0.3);
  const P = (base: THREE.Vector3, f: number, r: number, u: number) => new THREE.Vector3().copy(base).addScaledVector(s.fwd, f).addScaledVector(s.right, r).addScaledVector(UP, u);
  const line = (a: THREE.Vector3, b: THREE.Vector3, c: string, width: number, al = 1) => B.seg(a.x, a.y, a.z, b.x, b.y, b.z, c, width, al * alpha);
  /** a limb: two bowed lines from end to end */
  const limb = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    for (const side of [-w, w]) {
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.35).addScaledVector(s.right, side);
      line(a, mid, color, 1.05);
      line(mid, b, color, 1.05);
    }
  };
  // the trunk: hips, waist and chest, joined down the sides, front and back
  const N = 10, rings = [[0.04, 0.16, 0.1], [0.5, 0.14, 0.09], [0.9, 0.18, 0.11]].map(([t, half, depth]) => {
    const c = new THREE.Vector3().lerpVectors(s.hip, s.neck, t);
    return Array.from({ length: N }, (_, i) => P(c, Math.cos((i / N) * Math.PI * 2) * depth, Math.sin((i / N) * Math.PI * 2) * half, 0));
  });
  rings.forEach((ring, k) => {
    for (let i = 0; i < N; i++) {
      line(ring[i], ring[(i + 1) % N], k === 1 ? dim : color, 1.05, 0.9);
      if (k < 2 && i % 2 === 0) line(ring[i], rings[k + 1][i], dim, 0.85, 0.8);
    }
  });
  const SR = P(s.neck, -s.twist, 0.19, -0.05), SL = P(s.neck, s.twist, -0.19, -0.05);
  line(SR, SL, color, 1.3);
  line(s.neck, P(s.neck, 0, 0, 0.05), SKIN, 1.05, 0.8);
  for (const [S, hand, side] of [[SR, s.handR, 1], [SL, s.handL, -1]] as const) {
    const elbow = new THREE.Vector3().lerpVectors(S, hand, 0.5).addScaledVector(UP, -0.13).addScaledVector(s.right, side * 0.07);
    limb(S, elbow, 0.045);
    limb(elbow, hand, 0.035);
    line(hand, P(hand, 0.07, 0, 0), SKIN, 1.3);
  }
  for (const side of [1, -1]) {
    const H = P(s.hip, 0, side * 0.1, 0), K = s.legs ? (side > 0 ? s.legs.kneeR : s.legs.kneeL) : P(H, 0.42, 0, 0.05), F = s.legs ? (side > 0 ? s.legs.footR : s.legs.footL) : P(K, 0.1, 0, -0.4);
    limb(H, K, 0.06);
    limb(K, F, 0.045);
    line(F, P(F, 0.18, 0, 0), dim, 1.3);
  }
}
