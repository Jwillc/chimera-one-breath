/**
 * The people the scope looks at: a wire body in clothes under a CHIMERA head (the real 3D head,
 * moved by the recorded telemetry of whatever its throat is sounding). They stand about, sit, pace
 * and talk wherever the place has room for them; each has one thing that tells it from the others
 * (a hat, a red tie, a drink, a phone, glasses, a cigar), which is how the handler names the
 * target. A shot near them and they scream and run for the way out; the one the bullet finds cries
 * out and goes down, and whatever they had (the hat, the glass) leaves them and falls as a body of
 * its own (`things.ts`).
 *
 * Under the clothes there is a skeleton, a heart and lungs, and in the skull a brain: drawn only
 * while a bullet goes through (`xray`), when the game slows to show what it meets on the way from
 * the wound it makes going in to the one it makes coming out.
 *
 * A body's own frame is the head's: x forward, y up, z out of its right side. Metres, except the
 * head's geometry, which is the engine's body cm under a scaled holder.
 */
import * as THREE from "three";
import { Anatomy3D } from "../ui/render/anatomy3d.ts";
import { VoiceModel } from "../ui/analysis.ts";
import { getModel } from "../ui/useModel.ts";
import { PRESETS } from "../ui/body.ts";
import { NEUTRAL } from "../wasm/engine.ts";
import type { ViewFlags } from "../ui/render/anatomy.ts";
import type { Beams } from "../ui/render/beams3d.ts";
import { V, mix } from "../ui/colors.ts";
import { label } from "../ui/render/vector.ts";
import type { Kind, Playing, Sound } from "./sound.ts";
import { BLOOD, type Fx, type Sink } from "./fx.ts";
import type { Place, Spot, Trait } from "./place.ts";
import { Things, drawShape, smoke, thingOf, thrown, type Shape, type ThingEvent } from "./things.ts";
import { HAIR, SAID, WEAR, clauses, dress, tell, type Look } from "./looks.ts";

export type { Trait };
export const TRAITS: Trait[] = ["hat", "tie", "drink", "phone", "glasses", "cigar"];
/** how the handler's line reads on screen */
export const TRAIT_TEXT: Record<Trait, string> = { hat: "WEARING A HAT", tie: "WEARING A RED TIE", drink: "HOLDING A DRINK", phone: "ON THE PHONE", glasses: "WEARING GLASSES", cigar: "SMOKING", sing: "SINGING", crown: "WEARING A CROWN", sword: "HOLDING A SWORD", cape: "WEARING A CAPE", skull: "HOLDING A SKULL", bag: "CARRYING A BAG", plain: "" };
/** what one of a crowd may have about them: it only makes them somebody (nobody is told to look for it) */
const CROWD: Trait[] = ["hat", "glasses", "tie", "drink"];
type Body = "male" | "female";

/** metres per body cm of a head: a little larger than life, to read through the scope */
const HEAD = 0.0145;
const VIEW: ViewFlags = { pressure: true, particles: true, grid: false, calipers: false };
const SKIN = mix(V.amber, V.white, 0.55), BONE = mix(V.white, V.amber, 0.12), ORGAN = V.pink, LUNG = mix(V.pink, V.blue, 0.45);
const CLOTHES = [V.blue, V.green, V.pink, mix(V.blue, V.white, 0.5), mix(V.green, V.blue, 0.5), mix(V.pink, V.blue, 0.5)];
/** the colour a sound is written in at the mouth */
const SAY: Partial<Record<Kind, string>> = { chat: V.white, camp: V.white, phone: V.pink, scream: V.amber, shot: BLOOD, sing: V.pink };
/** how loud the singer on a stage is, and how long she breathes between phrases (s) */
const SING = 0.9, BREATH = 0.6;
/** the most screams sounding at once: a houseful in flight is heard as a crowd, and each voice costs */
const SCREAMS = 9;
const FLY = 0.45;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
const WALK = 1.25, RUN = 3.3;
/** shot: how fast the head is thrown back (rad/s, for a head shot), and the arm flung up (rad/s for each rad/s of the fall) */
const WHIP = 6, FLING = 3;
const WATER = mix(V.blue, V.white, 0.35);

class HeadRig {
  readonly r = new Anatomy3D();
  readonly holder = new THREE.Group();
  constructor(readonly body: Body, readonly model: VoiceModel) {
    this.r.centred = true;
    this.holder.add(this.r.root);
    this.holder.visible = false;
  }
}

export interface Person {
  body: Body;
  /** size against the adult male */
  s: number;
  trait: Trait;
  /** the thing that goes with it, for as long as they have it */
  thing: Shape | null;
  color: string;
  dress: boolean;
  x: number;
  z: number;
  /** how fast they are going over the ground (m/s) */
  vx: number;
  vz: number;
  /** the ground under it (m up) */
  gy: number;
  /** heading: forward is (cos th, sin th) on the floor */
  th: number;
  state: "calm" | "alarmed" | "dead" | "gone";
  spot: number;
  /** where it is walking to, one point after another */
  route: { x: number; z: number }[];
  /** the way to face once there */
  face: number;
  /** on its way somewhere it will not come back from (in at a door), at this many times a walk */
  leaving: boolean;
  pace: number;
  /** 1 seated, 0 on its feet */
  sit: number;
  /** 0 standing still, 1 in full stride */
  gait: number;
  phase: number;
  t: number;
  seed: number;
  strolls: boolean;
  strollIn: number;
  /** one of the crowd: never the target */
  crowd: boolean;
  /** their hair: its colour (null: none, or none to be seen under a hat), and whether it is worn long */
  hair: string | null;
  long: boolean;
  /** she sings (a stage's soprano): which phrase of the aria comes next, and how long until she starts it */
  sings: boolean;
  verse: number;
  breathIn: number;
  talkIn: number;
  voice: Playing | null;
  /** this throat's own pitch (a playback rate) */
  pitch: number;
  /** alarmed: seconds until it has understood, and since it was startled */
  react: number;
  startled: number;
  screamIn: number;
  /** shot: how far over it has fallen (radians), and how fast */
  fall: number;
  fallV: number;
  down: boolean;
  readonly fallAxis: THREE.Vector3;
  pivot: number;
  kick: number;
  flash: number;
  bleed: number;
  readonly wound: THREE.Vector3;
  gesture: number;
  sip: number;
  look: number;
  // the pose this frame
  py: number;
  lam: number;
  rho: number;
  legs: [[number, number], [number, number]];
  readonly M: THREE.Matrix4;
  readonly neck: THREE.Vector3;
  readonly pelvis: THREE.Vector3;
  readonly knee: THREE.Vector3;
  readonly foot: THREE.Vector3;
  readonly headPos: THREE.Vector3;
  readonly headQ: THREE.Quaternion;
  readonly headM: THREE.Matrix4;
  /** the middle of the head, for aiming at */
  readonly skull: THREE.Vector3;
  rig: HeadRig | null;
  says: { key: string; text: string; color: string; left: number | null }[];
  /** 0 clothed, 1 seen through to the bones (the game sets it while a bullet goes through) */
  xray: number;
  /** where a bullet went in and came out, in the head's frame or the body's */
  wounds: Mark[];
  /** cracks in the bone a bullet broke, as segments x0 y0 z0 x1 y1 z1 in the same frames */
  cracks: { head: boolean; segs: number[] }[];
  /** the bullet's way through, from the wound it made going in to where it is (or came out) */
  channel: { head: boolean; a: [number, number, number]; b: [number, number, number] } | null;
  /** the organs a bullet has been through */
  burst: Set<string>;
}

interface Mark {
  head: boolean;
  at: [number, number, number];
  /** its size, in its frame's units */
  r: number;
  exit: boolean;
}

export interface Hit {
  person: Person;
  /** how far along the line it goes in (m), and comes out */
  t: number;
  out: number;
  head: boolean;
  part: "head" | "trunk" | "thigh" | "shin";
}

/** something a bullet meets on its way through a body */
export interface Passage {
  /** how far along the bullet's line (m) */
  s: number;
  text: string;
  kind: "entry" | "bone" | "organ" | "exit";
  at: THREE.Vector3;
}

// ---- drawing a body in its own frame, through its matrix
let sink: Sink, m: ArrayLike<number> = new THREE.Matrix4().elements, fade = 1;
function L(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha = 1): void {
  alpha *= fade;
  sink.seg(m[0] * x0 + m[4] * y0 + m[8] * z0 + m[12], m[1] * x0 + m[5] * y0 + m[9] * z0 + m[13], m[2] * x0 + m[6] * y0 + m[10] * z0 + m[14], m[0] * x1 + m[4] * y1 + m[8] * z1 + m[12], m[1] * x1 + m[5] * y1 + m[9] * z1 + m[13], m[2] * x1 + m[6] * y1 + m[10] * z1 + m[14], color, width, alpha);
}
/** a limb: two bowed lines from end to end */
function limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, color: string, width: number): void {
  const mx = ax + (bx - ax) * 0.35, my = ay + (by - ay) * 0.35, mz = az + (bz - az) * 0.35;
  L(ax, ay, az, mx, my, mz + w, color, width);
  L(mx, my, mz + w, bx, by, bz, color, width);
  L(ax, ay, az, mx, my, mz - w, color, width);
  L(mx, my, mz - w, bx, by, bz, color, width);
}

const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3(), tmpP2 = new THREE.Vector3(), tmpQ3 = new THREE.Quaternion();
const ease = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

type P3 = [number, number, number];
/**
 * An arm as it is this frame, in the body's frame: the shoulder, the elbow, the hand, and the way
 * the hand points. Hanging, swinging, on the lap; a hand that talks, a hand with a glass or a phone.
 */
function arm(p: Person, side: 1 | -1): { S: P3; e: P3; h: P3; gx: number; gy: number } {
  const s = p.s, sp = 0.56 * s, sit = ease(p.sit), run = p.state === "alarmed" && p.react <= 0, dead = p.state === "dead";
  const ph = p.phase + (side > 0 ? Math.PI : 0), lu = 0.29 * s;
  let al = 0.04 + p.gait * (run ? 0.9 : 0.4) * Math.sin(ph) + 0.45 * sit, bend = 0.2 + p.gait * (run ? 1.3 : 0.15) + 0.8 * sit, lf = 0.27 * s, out = 0.1;
  if (dead) {
    al += 1.5 * Math.min(1, p.fall * 2) * (side > 0 ? 1 : 0.7);
    out = 0.5;
  } else if (side > 0 && (p.trait === "drink" || p.trait === "sword" || p.trait === "skull") && !run) {
    // (a glass, or a sword held upright, or a skull on the palm: the forearm is up)
    al = 0.2 + 0.25 * p.sip;
    bend = 1.7 + 0.75 * p.sip;
  } else if (side > 0 && p.trait === "phone" && !run) {
    al = 0.5;
    bend = 2.8;
    lf = 0.33 * s;
    out = -0.25;
  } else if (side < 0 && !run) {
    al += 0.3 * p.gesture;
    bend += 1.3 * p.gesture;
  }
  // the shoulder: up the spine, and out to the side
  const S: P3 = [Math.sin(p.lam) * sp * 0.95, p.py + Math.cos(p.lam) * Math.cos(p.rho) * sp * 0.95, Math.sin(p.rho) * sp * 0.95 + side * 0.21 * s];
  const e: P3 = [S[0] + Math.sin(al) * lu, S[1] - Math.cos(al) * lu, S[2] + side * Math.abs(out) * 0.3 * lu];
  const h: P3 = [e[0] + Math.sin(al + bend) * lf, e[1] - Math.cos(al + bend) * lf, e[2] + side * out * lf];
  return { S, e, h, gx: Math.sin(al + bend), gy: -Math.cos(al + bend) };
}

export class Cast {
  /** the heads' holders */
  readonly group = new THREE.Group();
  readonly list: Person[] = [];
  private readonly models: Record<Body, VoiceModel>;
  private readonly free: Record<Body, HeadRig[]> = { male: [], female: [] };
  private readonly rigs: HeadRig[] = [];
  /** heads for those who are not of the cast: whoever holds the rifle, whoever drives */
  private readonly extras: HeadRig[] = [];
  private w = 1;
  private h = 1;
  private clock = 0;
  private place!: Place;
  /** where the target is told by how they look: the handler's clips for it, in order, and the same in words (null: told by one thing, as usual) */
  wanted: { ids: string[]; lines: string[] } | null = null;
  /** seconds before anyone else may start talking (`Place.talk.gap`) */
  private lull = 0;
  /** what has left its owner and is falling, or lying where it fell */
  readonly things = new Things((e) => this.thingDid(e));
  /** how fast the room's time is running against the player's (the game says): what is heard is slowed with it */
  pace = 1;

  constructor(private readonly sound: Sound, private readonly fx: Fx) {
    const rate = sound.ctx.sampleRate;
    const model = (b: Body) => {
      const track = sound.clipsOf(b, "chat")[0]?.track;
      return getModel(track?.body ?? PRESETS[b], track?.sampleRate ?? rate);
    };
    this.models = { male: model("male"), female: model("female") };
  }

  setResolution(w: number, h: number): void {
    this.w = w;
    this.h = h;
    for (const r of this.rigs) r.r.resize(w, h);
  }

  dispose(): void {
    for (const r of this.rigs) r.r.dispose();
  }

  /** A head for someone who is not one of the cast (the i-th such): here, turned so and this size (m per body cm), for this frame. */
  extra(i: number, pos: THREE.Vector3, q: THREE.Quaternion, cam: THREE.Vector3, dt: number, scale: number, voice: Playing | null = null): void {
    const rig = (this.extras[i] ??= this.newRig("male")), h = rig.holder;
    h.position.copy(pos);
    h.quaternion.copy(q);
    h.scale.setScalar(scale);
    h.visible = true;
    h.updateMatrixWorld(true);
    rig.r.camera.position.copy(cam);
    // (it speaks, if it is given a voice that is sounding)
    const tele = this.sound.tele(voice), a = tele ? VoiceModel.articFromArray(tele.t.artic) : NEUTRAL;
    rig.r.face.update(tele, dt);
    rig.r.update(rig.model, rig.model.frame(a), a, tele, VIEW, dt);
  }

  /** (they are shown only in the frames that ask for them) */
  hideExtras(): void {
    for (const rig of this.extras) if (rig) rig.holder.visible = false;
  }

  /** build the heads ahead of time, so a new room costs no hitch */
  prewarm(camera: THREE.Camera): void {
    for (const b of ["male", "female"] as const)
      for (let i = 0; i < 4; i++) {
        const rig = this.newRig(b);
        rig.r.camera.position.copy(camera.position);
        rig.r.update(rig.model, rig.model.frame(NEUTRAL), NEUTRAL, null, VIEW, 0.016);
        this.free[b].push(rig);
      }
  }

  private newRig(body: Body): HeadRig {
    const rig = new HeadRig(body, this.models[body]);
    rig.r.resize(this.w, this.h);
    this.rigs.push(rig);
    this.group.add(rig.holder);
    return rig;
  }

  clear(): void {
    this.lull = 0;
    for (const p of this.list) this.release(p);
    this.list.length = 0;
    this.things.clear();
  }

  private release(p: Person): void {
    if (p.voice) this.sound.stop(p.voice);
    p.voice = null;
    if (p.rig) {
      p.rig.holder.visible = false;
      this.free[p.body].push(p.rig);
      p.rig = null;
    }
  }

  /** People for a place: n of them, each with one thing of their own, `strollers` of them given to wandering. Returns the one to shoot. */
  populate(place: Place, n: number, strollers: number, crowd = 0): Person {
    this.clear();
    this.place = place;
    const SPOTS = place.spots, all = place.traits ?? TRAITS, sung = SPOTS.findIndex((s) => s.sings), places = SPOTS.filter((s) => !s.crowd).length;
    const shuffled = <T>(a: readonly T[]): T[] => {
      const b = [...a];
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      return b;
    };
    n = Math.min(n, place.looks ? Infinity : all.length, places);
    const traits = shuffled(all).slice(0, n), colors = shuffled(CLOTHES);
    // (where there is a stage, somebody is singing on it)
    if (sung >= 0 && !traits.includes("sing")) traits[0] = "sing";
    // (the places that must be filled come first, in their own order)
    const order = shuffled(SPOTS.map((_, i) => i).filter((i) => !SPOTS[i].sings && !SPOTS[i].crowd)), spots = [...order.filter((i) => SPOTS[i].must).sort((a, b) => a - b), ...order.filter((i) => !SPOTS[i].must)];
    let musts = spots.filter((i) => SPOTS[i].must).length;
    const taken = new Set<number>();
    const take = (want: (s: Spot) => boolean): number => {
      const i = spots.find((k) => !taken.has(k) && want(SPOTS[k])) ?? spots.find((k) => !taken.has(k))!;
      taken.add(i);
      return i;
    };
    let left = strollers;
    const add = (trait: Trait, spot: number, body: Body, strolls: boolean, color: string): void => {
      const at = SPOTS[spot];
      const p: Person = {
        body, s: this.models[body].tract.scale, trait, thing: thingOf(trait, this.models[body].tract.scale, HEAD * this.models[body].tract.scale), color, dress: body === "female",
        x: at.x, z: at.z, vx: 0, vz: 0, gy: place.floor(at.x, at.z), th: at.th + (at.route ? 0 : (Math.random() - 0.5) * 0.3),
        state: "calm", spot, route: at.route ? at.route.map((q) => ({ ...q })) : [], face: at.th, leaving: !!at.route, pace: at.pace ?? 1,
        sit: at.sit ? 1 : 0, gait: 0, phase: Math.random() * 6, t: 0, seed: Math.random() * 100,
        strolls: strolls && !!at.open, strollIn: 2 + Math.random() * 7,
        crowd: !!at.crowd, hair: null, long: false, sings: trait === "sing", verse: 1, breathIn: 0.8,
        talkIn: 0.4 + Math.random() * 3.5, voice: null, pitch: 0.92 + Math.random() * 0.18,
        react: 0, startled: 0, screamIn: 0,
        fall: 0, fallV: 0, down: false, fallAxis: new THREE.Vector3(1, 0, 0), pivot: 0, kick: 0, flash: 0, bleed: 0, wound: new THREE.Vector3(),
        gesture: 0, sip: 0, look: 0,
        py: 0, lam: 0, rho: 0, legs: [[0, 0], [0, 0]],
        M: new THREE.Matrix4(), neck: new THREE.Vector3(), pelvis: new THREE.Vector3(), knee: new THREE.Vector3(), foot: new THREE.Vector3(),
        headPos: new THREE.Vector3(), headQ: new THREE.Quaternion(), headM: new THREE.Matrix4(), skull: new THREE.Vector3(),
        rig: null, says: [],
        xray: 0, wounds: [], cracks: [], channel: null, burst: new Set(),
      };
      p.rig = this.free[body].pop() ?? this.newRig(body);
      p.rig.r.resetMotion();
      p.rig.holder.visible = true;
      this.pose(p);
      this.list.push(p);
    };
    this.wanted = null;
    if (place.looks) {
      // a crowd of strangers: each dressed in their own way, and one of them picked out by the least that nobody else shares
      const looks: Look[] = dress(Math.min(n, spots.length));
      looks.forEach((l) => {
        const strolls = l.has === "phone" || left-- > 0, body: Body = Math.random() < 0.5 ? "male" : "female";
        add(l.has, take((s) => (strolls ? !!s.open : !s.open)), body, strolls, WEAR[l.wear]);
        const p = this.list[this.list.length - 1];
        p.hair = l.hair === "bald" ? null : HAIR[l.hair];
        p.long = body === "female" ? Math.random() < 0.75 : Math.random() < 0.15;
      });
      // (the target is someone it takes more than one thing to tell, where there is such a one: a crowd is meant to be hard)
      const told = looks.map((_, i) => tell(looks, i)), all = told.map((t, i) => (t ? i : -1)).filter((i) => i >= 0), hard = all.filter((i) => told[i]!.length > 1);
      const can = hard.length ? hard : all, who = can[Math.floor(Math.random() * can.length)] ?? 0;
      const said = (told[who] ?? [1]).map((k) => SAID[clauses(looks[who])[k]!]);
      this.wanted = { ids: ["look-target", ...said.map((c) => c.id)], lines: said.map((c) => c.text) };
      return this.list[who];
    }
    traits.forEach((trait, i) => {
      // the one who sings is a soprano, in white, at her mark
      if (trait === "sing") return add(trait, sung, "female", false, V.white);
      // whoever is on the phone paces about; the rest take any place, the last few of them wandering
      const must = musts-- > 0, strolls = !must && (trait === "phone" || left-- > 0);
      const spot = must ? take((s) => !!s.must) : take((s) => (strolls ? !!s.open : true));
      add(trait, spot, place.men || i === 0 ? "male" : i === 1 ? "female" : Math.random() < 0.5 ? "male" : "female", strolls, colors[i % colors.length]);
    });
    // the crowd, at the spots kept for them
    shuffled(SPOTS.map((_, i) => i).filter((i) => SPOTS[i].crowd)).slice(0, crowd).forEach((spot, i) => add(CROWD[Math.floor(Math.random() * CROWD.length)], spot, Math.random() < 0.5 ? "male" : "female", false, colors[(n + i) % colors.length]));
    const players = this.list.filter((p) => !p.crowd), marked = players.filter((p) => SPOTS[p.spot].mark), among = marked.length ? marked : players;
    return among[Math.floor(Math.random() * among.length)];
  }

  // ------------------------------------------------------------------ each frame: minds and bodies
  update(dt: number): void {
    this.clock += dt;
    this.things.update(dt, this.place);
    const SPOTS = this.place.spots;
    let talking = 0;
    for (const p of this.list) if (p.voice && !p.voice.over && p.state === "calm" && !p.sings) talking++;
    this.lull -= dt;
    for (const p of this.list) {
      if (p.state === "gone") continue;
      p.t += dt;
      const x0 = p.x, z0 = p.z;
      p.flash = Math.max(0, p.flash - dt);
      if (p.voice?.over) p.voice = null;
      let speed = 0;
      // the ground comes up under them (steps, the side of a pool) over a moment
      p.gy += (this.place.floor(p.x, p.z) - p.gy) * Math.min(1, 10 * dt);

      if (p.state === "dead") {
        if (!p.down) {
          p.fallV += (4 + 11 * Math.sin(p.fall)) * dt;
          p.fall += p.fallV * dt;
          const most = p.pivot > 0 ? 1.1 : Math.PI / 2 - 0.07;
          if (p.fall >= most) {
            p.fall = most;
            p.down = true;
            this.sound.hit("B", 0.5, 0.35);
            for (let i = 0; i < 3; i++) this.fx.splat(p.skull.x + (Math.random() - 0.5) * 0.7, p.skull.z + (Math.random() - 0.5) * 0.7, 0.25 + Math.random() * 0.35);
          }
        }
        if (p.bleed > 0) {
          p.bleed -= dt;
          if (Math.random() < dt * 22) this.fx.drip(p.wound.x + (Math.random() - 0.5) * 0.1, p.wound.y, p.wound.z + (Math.random() - 0.5) * 0.1);
        }
      } else if (p.state === "calm" && p.sings) {
        // the aria: phrase after phrase, a breath between, and round again (in tune: at the pitch it was written)
        if (!p.voice && (p.breathIn -= dt) <= 0) {
          const of = this.sound.clipsOf(p.body, "sing").length, clip = this.sound.clip(`${p.body}-sing-${p.verse}`);
          if (clip) p.voice = this.sound.say(clip, p.headPos, 1, SING, this.place.hear);
          p.verse = (p.verse % Math.max(1, of)) + 1;
          p.breathIn = BREATH;
        }
      } else if (p.state === "calm") {
        // talk now and then (so many at once at most, and where little of it carries, a quiet after each), with a hand
        p.talkIn -= dt;
        if (p.talkIn <= 0 && !p.voice && this.place.chat) {
          if (talking < this.place.talk.at && this.lull <= 0) {
            this.say(p, p.trait === "phone" ? "phone" : this.place.chat, 1);
            talking++;
            this.lull = this.place.talk.gap * (0.7 + 0.9 * Math.random());
            p.talkIn = 2.2 + Math.random() * 5;
          } else p.talkIn = 0.3 + Math.random() * 0.6;
        }
        // stroll to another free place by the glass
        if (p.strolls && !p.route.length) {
          p.strollIn -= dt;
          if (p.strollIn <= 0) {
            const open = SPOTS.map((s, i) => ({ s, i })).filter(({ s, i }) => s.open && !this.list.some((o) => o.spot === i && o.state !== "gone"));
            if (open.length) {
              const to = open[Math.floor(Math.random() * open.length)];
              p.spot = to.i;
              p.route = [{ x: to.s.x, z: to.s.z }];
              p.face = to.s.th;
            }
            p.strollIn = (p.trait === "phone" ? 2 : 5) + Math.random() * 7;
          }
        }
        speed = this.walk(p, WALK * p.s * p.pace, dt);
        // in at the door: not to be seen again
        if (p.leaving && !p.route.length) {
          p.state = "gone";
          this.release(p);
          continue;
        }
        p.sip = p.trait === "drink" ? Math.max(0, Math.sin(this.clock * 0.55 + p.seed) * 6 - 5) : 0;
      } else {
        // alarmed: a moment to understand, then up and out by the door
        p.startled += dt;
        if (p.react > 0) {
          p.react -= dt;
          if (p.react <= 0) {
            if (this.screaming() < SCREAMS) this.say(p, "scream", 1.25);
            p.screamIn = 1.3 + Math.random() * 1.2;
            p.route = this.place.wayOut(p);
          }
        } else {
          p.screamIn -= dt;
          if (p.screamIn <= 0 && !p.voice && this.screaming() < SCREAMS) {
            this.say(p, "scream", 1.25);
            p.screamIn = 1.4 + Math.random() * 1.4;
          }
          p.sit = Math.max(0, p.sit - dt * 3.5);
          if (p.sit < 0.35) speed = this.walk(p, RUN * p.s, dt);
          if (!p.route.length && p.sit <= 0) {
            p.state = "gone";
            this.release(p);
            continue;
          }
        }
      }
      if (dt > 0) {
        p.vx = (p.x - x0) / dt;
        p.vz = (p.z - z0) / dt;
      }
      const stride = p.state === "alarmed" ? 1 : 0.55;
      p.gait += ((speed > 0.05 ? stride : 0) - p.gait) * Math.min(1, 9 * dt);
      p.phase += (speed / (0.4 * p.s)) * dt;
      const speaking = p.voice && p.state === "calm" ? 1 : 0;
      p.gesture += (speaking * (0.6 + 0.4 * Math.sin(this.clock * 5 + p.seed)) - p.gesture) * Math.min(1, 6 * dt);
      p.look = 0.35 * Math.sin(this.clock * 0.31 + p.seed * 2) + 0.15 * Math.sin(this.clock * 0.83 + p.seed);
      this.pose(p);
      if (p.voice) this.sound.move(p.voice, p.headPos.x, p.headPos.y, p.headPos.z);
    }
  }

  /** go along the route (or turn to face, once there); returns the speed made good */
  private walk(p: Person, speed: number, dt: number): number {
    const to = p.route[0];
    if (!to) {
      p.th += Math.max(-2.5 * dt, Math.min(2.5 * dt, wrap(p.face - p.th)));
      return 0;
    }
    const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
    if (d < Math.max(0.08, speed * dt)) {
      p.route.shift();
      return speed;
    }
    const turn = wrap(Math.atan2(dz, dx) - p.th), rate = speed > 2 ? 10 : 4;
    p.th += Math.max(-rate * dt, Math.min(rate * dt, turn));
    const go = speed * (Math.abs(turn) > 1 ? 0.35 : 1);
    p.x += (dx / d) * go * dt;
    p.z += (dz / d) * go * dt;
    return go;
  }

  private say(p: Person, kind: Kind, level: number, rate = 1): void {
    if (p.voice) this.sound.stop(p.voice);
    const clip = this.sound.pick(p.body, kind);
    p.voice = clip ? this.sound.say(clip, p.headPos, p.pitch * rate * (0.96 + 0.08 * Math.random()), level, this.place.hear) : null;
  }

  private screaming(): number {
    let n = 0;
    for (const v of this.sound.voices) if (v.clip.kind === "scream") n++;
    return n;
  }

  /** the room goes quiet (the trigger has been pulled) */
  hush(): void {
    for (const p of this.list)
      if (p.voice && !(p.sings && p.state === "calm")) {
        this.sound.stop(p.voice, 0.12);
        p.voice = null;
      }
  }

  /** How loud the singing is just now, against its loudest (0 to 1); null where nobody sings. */
  loud(): number | null {
    const singer = this.list.find((p) => p.sings);
    return singer ? (singer.state === "calm" ? this.sound.level(singer.voice) : 0) : null;
  }

  /** a shot has come through: everyone still standing understands, one after another */
  alarm(): void {
    for (const p of this.list)
      if (p.state === "calm") {
        p.state = "alarmed";
        p.leaving = false;
        p.react = 0.3 + Math.random() * 0.7;
        p.startled = 0;
        p.route = [];
      }
  }

  /** where the pelvis, the neck and the head are this frame */
  private pose(p: Person): void {
    const s = p.s, lt = 0.45 * s, ls = 0.47 * s, sp = 0.56 * s;
    const sit = ease(p.sit), dead = p.state === "dead", buckle = dead ? Math.min(1, p.fall * 1.4) : 0;
    const run = p.state === "alarmed" && p.react <= 0;
    let top = 0;
    for (const side of [1, -1] as const) {
      const ph = p.phase + (side > 0 ? 0 : Math.PI);
      let a = (run ? 0.75 : 0.5) * p.gait * Math.sin(ph), b = 0.05 + p.gait * (0.15 + (run ? 1.1 : 0.7) * Math.max(0, Math.cos(ph)));
      a = a * (1 - sit) + sit * (Math.PI / 2 - 0.06);
      b = b * (1 - sit) + sit * (Math.PI / 2);
      a += buckle * (side > 0 ? 0.55 : 0.3);
      b += buckle * (side > 0 ? 1.1 : 0.7);
      p.legs[side > 0 ? 0 : 1] = [a, b];
      top = Math.max(top, lt * Math.cos(a) + ls * Math.cos(a - b));
    }
    p.py = Math.max(0.12 * s, top);
    // (a flinch takes a moment: nobody has moved yet when the bullet that startled them arrives)
    const flinch = p.state === "alarmed" && p.react > 0 ? 0.35 * ease(Math.min(1, p.startled / 0.12)) : 0;
    p.lam = 0.03 + 0.05 * p.gait + (run ? 0.26 : 0) * p.gait - 0.16 * sit + flinch + 0.03 * p.gesture * Math.sin(this.clock * 3 + p.seed);
    p.rho = dead ? 0 : 0.03 * Math.sin(this.clock * 0.7 + p.seed) * (1 - p.gait) + 0.05 * p.gait * Math.sin(p.phase);

    // the body's matrix: turned to its heading, toppled about its feet (or its seat) once shot
    const q = tmpQ.setFromAxisAngle(Y, -p.th);
    if (dead) q.premultiply(tmpQ2.setFromAxisAngle(p.fallAxis, p.fall));
    const pv = tmpV.set(0, p.pivot, 0).applyQuaternion(q);
    p.M.compose(tmpS.set(p.x - pv.x, p.gy + p.pivot - pv.y, p.z - pv.z), q, ONE);

    const nx = Math.sin(p.lam) * sp, ny = p.py + Math.cos(p.lam) * Math.cos(p.rho) * sp, nz = Math.sin(p.rho) * sp;
    p.neck.set(nx, ny, nz).applyMatrix4(p.M);
    p.pelvis.set(0, p.py, 0).applyMatrix4(p.M);
    let kx = 0, ky = 0, fx = 0, fy = 0;
    for (const [a, b] of p.legs) {
      kx += Math.sin(a) * lt * 0.5;
      ky += (p.py - Math.cos(a) * lt) * 0.5;
      fx += (Math.sin(a) * lt + Math.sin(a - b) * ls) * 0.5;
      fy += (p.py - Math.cos(a) * lt - Math.cos(a - b) * ls) * 0.5;
    }
    p.knee.set(kx, ky, 0).applyMatrix4(p.M);
    p.foot.set(fx, fy, 0).applyMatrix4(p.M);

    // the head: looking about, nodding as it talks, thrown back by the bullet
    p.headPos.set(nx, ny + 0.03 * s, nz).applyMatrix4(p.M);
    // (the bullet's blow arrives over a moment, slow enough to see in the bullet's time, and wears off)
    const kick = dead ? p.kick * ease(Math.min(1, p.t / 0.09)) * Math.exp(-1.6 * Math.max(0, p.t - 0.09)) : 0;
    const pitch = -0.4 * p.lam + 0.1 * sit + 0.05 * Math.sin(this.clock * 1.1 + p.seed) + 0.55 * kick + (dead ? 0.35 * buckle : 0);
    const loll = dead ? 0.5 * buckle * Math.sin(p.seed * 9) : 0.06 * Math.sin(this.clock * 0.6 + p.seed * 3);
    p.headQ.copy(q).multiply(tmpQ2.setFromAxisAngle(Y, dead || run ? 0 : -p.look)).multiply(tmpQ2.setFromAxisAngle(Z, pitch)).multiply(tmpQ2.setFromAxisAngle(X, loll));
    p.headM.compose(p.headPos, p.headQ, tmpS.set(HEAD, HEAD, HEAD));
    p.skull.set(0.5 * s, 13 * s, 0).applyMatrix4(p.headM);
  }

  // ------------------------------------------------------------------ being shot
  /** the nearest living person a line from o along d (unit) meets */
  raycast(o: THREE.Vector3, d: THREE.Vector3): Hit | null {
    let best: Hit | null = null;
    for (const p of this.list) {
      if (p.state === "dead" || p.state === "gone") continue;
      const r = 10 * p.s * HEAD;
      const mx = p.skull.x - o.x, my = p.skull.y - o.y, mz = p.skull.z - o.z;
      const tc = mx * d.x + my * d.y + mz * d.z;
      if (tc > 0) {
        const d2 = mx * mx + my * my + mz * mz - tc * tc;
        if (d2 < r * r) {
          const half = Math.sqrt(r * r - d2), t = tc - half;
          if (!best || t < best.t) best = { person: p, t, out: tc + half, head: true, part: "head" };
        }
      }
      for (const [a, b, rad, part] of [[p.pelvis, p.neck, 0.19, "trunk"], [p.pelvis, p.knee, 0.14, "thigh"], [p.knee, p.foot, 0.11, "shin"]] as const) {
        const through = rayCapsule(o, d, a, b, rad * p.s);
        if (through && (!best || through[0] < best.t)) best = { person: p, t: through[0], out: through[1], head: false, part };
      }
    }
    return best;
  }

  /** who is seen through to the bones, and how far (0 to 1); nobody else is */
  seeThrough(who: Person | null, amount: number): void {
    for (const p of this.list) p.xray = p === who ? amount : 0;
  }

  /** a point of a person's own frame (the head's or the body's), out in the world as they are now */
  world(p: Person, head: boolean, at: [number, number, number], to: THREE.Vector3): THREE.Vector3 {
    return to.set(at[0], at[1], at[2]).applyMatrix4(head ? p.headM : p.M);
  }

  /** a point of the world in a person's own frame: the head's (its cm) or the body's (m) */
  local(p: Person, head: boolean, v: THREE.Vector3): [number, number, number] {
    const q = tmpV.copy(v).applyMatrix4(tmpM.copy(head ? p.headM : p.M).invert());
    return [q.x, q.y, q.z];
  }

  /**
   * A bullet from o along d reaches someone: the wound where it goes in, and (returned, in the
   * order it comes to them) what lies on its way through to where it will come out.
   */
  enter(hit: Hit, o: THREE.Vector3, d: THREE.Vector3): Passage[] {
    const p = hit.person, s = p.s, head = hit.head;
    const at = (t: number) => new THREE.Vector3().copy(o).addScaledVector(d, t);
    const a = at(hit.t), la = this.local(p, head, a);
    p.flash = 0.0004;
    p.wounds.push({ head, at: la, r: head ? 0.011 / HEAD : 0.011, exit: false });
    p.channel = { head, a: la, b: [...la] };
    this.fx.blood(a.x, a.y, a.z, -d.x, -d.y + 0.3, -d.z, 7, 2.2, 0.8);
    this.fx.ring(a.x, a.y, a.z, 0.12, BLOOD, 0.002);

    const out: Passage[] = [{ s: hit.t, text: "ENTRY", kind: "entry", at: a }], seen = new Set<string>();
    const meet = (t: number, text: string, kind: "bone" | "organ") => {
      if (seen.has(text)) return;
      seen.add(text);
      out.push({ s: t, text, kind, at: at(t) });
    };
    const len = hit.out - hit.t, N = 28;
    if (head) {
      // the skull (or the jaw) where it goes in; the brain if its way lies through it
      meet(hit.t + Math.min(0.012, len * 0.2), la[1] / s > 9.5 ? "SKULL" : "JAW", "bone");
      for (let i = 1; i < N; i++) {
        const t = hit.t + (len * i) / N, [x, y, z] = this.local(p, true, at(t)).map((v) => v / s);
        if (((x + 1) / 7.6) ** 2 + ((y - 16.5) / 5.2) ** 2 + (z / 6) ** 2 < 1) meet(t, "BRAIN", "organ");
        else if (y < 9 && x > 1 && la[1] / s > 9.5) meet(t, "JAW", "bone");
      }
    } else if (hit.part === "trunk") {
      // along the spine's own frame: how far up it (u), forward of it (f) and out to the side
      const sp = 0.56 * s, ux = Math.sin(p.lam), uy = Math.cos(p.lam) * Math.cos(p.rho), uz = Math.sin(p.rho), fx = Math.cos(p.lam), fy = -Math.sin(p.lam);
      const frame = (t: number): [number, number, number] => {
        const [x, y, z] = this.local(p, false, at(t)), ry = y - p.py, u = (x * ux + ry * uy + z * uz) / sp;
        return [u, x * fx + ry * fy, z - uz * sp * u];
      };
      const [u0] = frame(hit.t);
      if (u0 > 0.46) meet(hit.t + Math.min(0.015, len * 0.2), "RIB", "bone");
      else if (u0 < 0.2) meet(hit.t + len * 0.3, "PELVIS", "bone");
      for (let i = 1; i < N; i++) {
        const t = hit.t + (len * i) / N, [u, f, side] = frame(t);
        if (Math.abs(f + 0.055 * s) < 0.03 * s && Math.abs(side) < 0.034 * s && u > 0 && u < 1.05) meet(t, "SPINE", "bone");
        else if (((u - 0.72) * sp) ** 2 + (f - 0.05 * s) ** 2 + (side + 0.03 * s) ** 2 < (0.052 * s) ** 2) meet(t, "HEART", "organ");
        else if (((u - 0.72) / 0.19) ** 2 + ((f - 0.012 * s) / (0.062 * s)) ** 2 + ((Math.abs(side) - 0.088 * s) / (0.056 * s)) ** 2 < 1) meet(t, side < 0 ? "LEFT LUNG" : "RIGHT LUNG", "organ");
        else if (i === N / 2 && u > 0.2 && u <= 0.46) meet(t, side > 0 ? "LIVER" : "STOMACH", "organ");
      }
    } else meet(hit.t + len / 2, hit.part === "thigh" ? "FEMUR" : "TIBIA", "bone");
    out.sort((x, y) => x.s - y.s);
    out.push({ s: hit.out, text: "EXIT", kind: "exit", at: at(hit.out) });
    return out;
  }

  /** the bullet, inside someone, has come this far */
  bore(p: Person, at: THREE.Vector3): void {
    if (p.channel) p.channel.b = this.local(p, p.channel.head, at);
  }

  /** the bullet comes to a bone (it cracks, and bits of it go on with the bullet) or an organ (it bursts) */
  meet(p: Person, e: Passage, d: THREE.Vector3, head: boolean): void {
    const fx = this.fx, at = e.at;
    if (e.kind === "bone") {
      const c = this.local(p, head, at), k = head ? 1 / HEAD : 1, segs: number[] = [];
      for (let i = 0; i < 7; i++) {
        // a star of crooked cracks
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), len = (0.02 + 0.05 * Math.random()) * k;
        const mid = [c[0] + dir.x * len * 0.5 + (Math.random() - 0.5) * len * 0.3, c[1] + dir.y * len * 0.5 + (Math.random() - 0.5) * len * 0.3, c[2] + dir.z * len * 0.5];
        segs.push(c[0], c[1], c[2], mid[0], mid[1], mid[2], mid[0], mid[1], mid[2], c[0] + dir.x * len, c[1] + dir.y * len, c[2] + dir.z * len);
      }
      p.cracks.push({ head, segs });
      for (let i = 0; i < 9; i++) {
        const l = 0.006 + 0.016 * Math.random(), a = Math.random() * 6.28, push = 1 + 5 * Math.random();
        fx.shard(at.x, at.y, at.z, at.x + Math.cos(a) * l, at.y + Math.sin(a) * l, at.z, BONE, 0.85, d.x * push + (Math.random() - 0.5) * 2.5, d.y * push + (Math.random() - 0.3) * 2.5, d.z * push + (Math.random() - 0.5) * 2.5);
      }
      fx.ring(at.x, at.y, at.z, 0.09, V.white, 0.0015);
    } else if (e.kind === "organ") {
      p.burst.add(e.text);
      fx.blood(at.x, at.y, at.z, d.x, d.y, d.z, 9, 1.6, 1);
      fx.ring(at.x, at.y, at.z, 0.11, BLOOD, 0.002);
    }
  }

  /** The bullet comes out of someone, at `at`, going along d: the wound, the blood, the cry (at `rate`: slow, in the bullet's time), the fall. */
  shoot(p: Person, at: THREE.Vector3, d: THREE.Vector3, head: boolean, rate: number): void {
    if (p.state === "dead" || p.state === "gone") return;
    this.letGo(p, at, d, head);
    p.wounds.push({ head, at: this.local(p, head, at), r: head ? 0.026 / HEAD : 0.026, exit: true });
    this.bore(p, at);
    const seated = p.sit > 0.5;
    p.state = "dead";
    p.t = 0;
    p.route = [];
    p.flash = 0.012;
    p.kick = head ? 1 : 0.45;
    p.bleed = 0.5;
    p.wound.copy(at);
    // down the way the bullet was going (a seated one slumps along the sofa)
    const turn = (Math.random() - 0.5) * 0.9, hx = seated ? (Math.random() < 0.5 ? 1 : -1) : d.x * Math.cos(turn) - d.z * Math.sin(turn), hz = seated ? 0 : d.x * Math.sin(turn) + d.z * Math.cos(turn), hl = Math.hypot(hx, hz) || 1;
    p.fallAxis.set(hz / hl, 0, -hx / hl);
    p.fall = 0.02;
    p.fallV = head ? 1.5 : 0.9;
    p.down = false;
    p.pivot = seated ? 0.45 * p.s : 0;
    const fx = this.fx;
    // out with the bullet
    fx.blood(at.x, at.y, at.z, d.x, d.y, d.z, head ? 36 : 26, 7, 0.4);
    fx.ring(at.x, at.y, at.z, head ? 0.3 : 0.24, V.white, 0.02);
    fx.ring(at.x, at.y, at.z, head ? 0.5 : 0.4, BLOOD, 0.05);
    this.say(p, "shot", 1.4, rate);
  }

  // ------------------------------------------------------------------ the things they have
  /** where the thing someone has is this frame, and how it is turned: on the head, or in the right hand */
  private mount(p: Person, s: Shape, pos: THREE.Vector3, q: THREE.Quaternion): void {
    if (s.on === "head") {
      pos.set(...s.at).applyQuaternion(p.headQ).add(p.headPos);
      q.copy(p.headQ);
    } else {
      const a = arm(p, 1);
      pos.set(a.h[0] + a.gx * s.reach + s.at[0], a.h[1] + a.gy * s.reach + s.at[1], a.h[2] + s.at[2]).applyMatrix4(p.M);
      q.setFromRotationMatrix(p.M);
    }
  }

  /**
   * Shot: whatever they had leaves them. It starts with the speed of the place it sat (the head
   * thrown back, the arm flung up, their own walk or run) and the push of the bullet that went by
   * it along the line through `at` in the direction d; after that it is `things.ts`'s to move.
   */
  private letGo(p: Person, at: THREE.Vector3, d: THREE.Vector3, head: boolean): void {
    const s = p.thing;
    if (!s) return;
    const run = p.state === "alarmed" && p.react <= 0;
    p.thing = null;
    // (whoever was on the phone put it away to run)
    if (s.kind === "phone" && run) return;
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), v = new THREE.Vector3(p.vx, 0, p.vz), w = new THREE.Vector3();
    this.mount(p, s, pos, q);
    if (s.on === "head") {
      // the head goes back about its own side-to-side axis, and what is on it goes as that part of it goes
      w.set(0, 0, 1).applyQuaternion(p.headQ).multiplyScalar(WHIP * (head ? 1 : 0.45));
      v.add(tmpV.copy(pos).sub(p.headPos).cross(w).negate());
    } else {
      // the hand's own speed, about the shoulder
      const a = arm(p, 1), rate = FLING * (head ? 1.5 : 0.9);
      v.add(tmpV.set(-(a.h[1] - a.S[1]) * rate, (a.h[0] - a.S[0]) * rate, 0).applyQuaternion(q));
      w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8);
    }
    thrown(at, d, pos, s.blast, v, w);
    // a hat spins on its way
    if (s.kind === "hat") w.addScaledVector(tmpV.set(0, 1, 0).applyQuaternion(q), (Math.random() < 0.5 ? -1 : 1) * (3 + 4 * Math.random()));
    this.things.release(s, pos, q, v, w);
  }

  /** a loose thing strikes the ground, breaks on it, goes into water or spills: what is seen and heard of that */
  private thingDid(e: ThingEvent): void {
    const { thing: t, at, vel } = e, fx = this.fx, kind = t.shape.kind, any = (k: number) => (Math.random() - 0.5) * k;
    if (e.what === "spill") {
      fx.drop(at.x, at.y, at.z, vel.x + any(0.8), vel.y + any(0.8), vel.z + any(0.8), V.amber);
      return;
    }
    // (heard slow, like everything else, while the bullet's time lasts)
    const slow = 0.55 + 0.45 * Math.min(1, this.pace), loud = Math.min(1, e.speed / 4);
    const hit = (name: string, rate: number, level: number, delay = 0) => void this.sound.hit(name, rate * slow, level, delay);
    if (e.what === "splash") {
      fx.ring(at.x, at.y, at.z, 0.3, V.white, 0.45);
      for (let i = 0; i < 7; i++) fx.drop(at.x, at.y, at.z, any(1.8), 1.2 + 1.6 * Math.random(), any(1.8), WATER);
      hit("pop", 0.85, 0.12 + 0.25 * loud);
    } else if (e.what === "break") {
      // a glass on a hard floor: its lines go their own ways, and what was left in it with them
      const g = t.shape.segs, m4 = tmpM.compose(t.pos, t.q, ONE);
      for (let i = 0, j = 0; i < t.shape.dry; i++, j += 6) {
        const a = tmpP.set(g[j], g[j + 1], g[j + 2]).applyMatrix4(m4), b = tmpP2.set(g[j + 3], g[j + 4], g[j + 5]).applyMatrix4(m4);
        fx.shard(a.x, a.y, a.z, b.x, b.y, b.z, t.shape.color[i], t.shape.width[i], 0.4 * vel.x + any(3), 0.6 + 1.8 * Math.random(), 0.4 * vel.z + any(3));
      }
      for (let i = 0; i < t.liquid; i++) fx.drop(at.x, at.y, at.z, any(2.4), 0.5 + 1.5 * Math.random(), any(2.4), V.amber);
      fx.ring(at.x, at.y, at.z, 0.2, V.white, 0.12);
      hit("tss", 1.9, 0.3);
      hit("t", 2.4, 0.3);
      hit("t", 1.9, 0.2, 0.07);
      hit("t", 2.8, 0.14, 0.15);
    } else if (kind === "hat") {
      // felt: next to nothing, and only the once
      if (t.knocks === 1) hit("Pf", 0.5, 0.04 + 0.06 * loud);
    } else if (kind === "drink") hit("t", 2.2, 0.08 + 0.2 * loud);
    else if (kind === "phone") {
      hit("click", 0.9, 0.08 + 0.22 * loud);
      hit("K", 1.9, 0.04 + 0.1 * loud, 0.01);
    } else if (kind === "glasses") hit("t", 2.8, 0.05 + 0.1 * loud);
    else if (kind === "crown" || kind === "sword") {
      // metal on boards: a rimshot and a click, ringing higher for the crown
      hit("K", kind === "crown" ? 2.3 : 1.7, 0.06 + 0.2 * loud);
      hit("click", kind === "crown" ? 1.9 : 1.3, 0.05 + 0.15 * loud, 0.012);
    } else if (kind === "skull") hit("K", 0.85, 0.06 + 0.18 * loud);
    else if (kind === "bag") hit("Pf", 0.6, 0.06 + 0.12 * loud);
    else {
      // a cigar: a tick, and the first time its end throws sparks
      hit("t", 1.3, 0.03 + 0.04 * loud);
      if (t.knocks === 1) for (let i = 0; i < 5; i++) fx.drop(at.x, at.y, at.z, any(1.6), 0.5 + 1.2 * Math.random(), any(1.6), V.amber);
    }
  }

  // ------------------------------------------------------------------ drawing
  draw(B: Beams, camera: THREE.Camera, dt: number): void {
    for (const p of this.list) {
      if (p.state === "gone") continue;
      if (p.rig) this.drawHead(p, p.rig, camera.position, dt);
      this.drawBody(p, B);
      this.drawThing(p, B);
    }
    this.things.draw(B);
  }

  private drawHead(p: Person, rig: HeadRig, cam: THREE.Vector3, dt: number): void {
    const h = rig.holder, r = rig.r;
    h.position.copy(p.headPos);
    h.quaternion.copy(p.headQ);
    h.scale.setScalar(HEAD);
    h.updateMatrixWorld(true);
    r.camera.position.copy(cam);
    const tele = this.sound.tele(p.voice);
    const a = tele ? VoiceModel.articFromArray(tele.t.artic) : NEUTRAL;
    r.face.update(tele, dt);
    r.update(rig.model, rig.model.frame(a), a, tele, VIEW, dt);
  }

  private drawBody(p: Person, to: Sink): void {
    sink = to;
    m = p.M.elements;
    // seen through: the clothes dim and what is under them lights
    const xr = p.xray, clothed = 1 - 0.85 * xr;
    fade = clothed;
    const bone = p.flash > 0 ? V.white : BONE;
    const s = p.s, flash = p.flash > 0, cloth = flash ? V.white : p.color, dim = flash ? V.white : mix(p.color, "#000000", 0.3), skin = flash ? V.white : SKIN;
    const py = p.py, sp = 0.56 * s, female = p.body === "female";
    const ux = Math.sin(p.lam), uy = Math.cos(p.lam) * Math.cos(p.rho), uz = Math.sin(p.rho), fx = Math.cos(p.lam), fy = -Math.sin(p.lam);
    const at = (u: number, f: number, side: number): [number, number, number] => [ux * sp * u + fx * f, py + uy * sp * u + fy * f, uz * sp * u + side];

    // the trunk: hips, waist and chest, joined down the sides, front and back
    const rings: [number, number, number][] = [[0.04, 0.17, 0.1], [0.45, female ? 0.125 : 0.155, 0.09], [0.84, 0.19, 0.11]];
    const N = 10, pts = rings.map(([u, half, depth]) => Array.from({ length: N }, (_, i) => at(u, 0.015 * s + Math.cos((i / N) * Math.PI * 2) * depth * s, Math.sin((i / N) * Math.PI * 2) * half * s)));
    pts.forEach((ring, k) => {
      for (let i = 0; i < N; i++) {
        const a = ring[i], b = ring[(i + 1) % N];
        L(a[0], a[1], a[2], b[0], b[1], b[2], k === 1 ? dim : cloth, 1.05, 0.9);
        if (k < 2 && i % 2 === 0) {
          const c = pts[k + 1][i];
          L(a[0], a[1], a[2], c[0], c[1], c[2], dim, 0.85, 0.8);
        }
      }
    });
    const shL = at(0.95, 0, -0.21 * s), shR = at(0.95, 0, 0.21 * s), nk = at(1, 0, 0);
    L(shL[0], shL[1], shL[2], shR[0], shR[1], shR[2], cloth, 1.3);
    L(nk[0], nk[1], nk[2], nk[0], nk[1] + 0.06 * s, nk[2], skin, 1.05, 0.8);
    if (!female) {
      // a jacket's lapels
      const v = at(0.6, 0.125 * s, 0);
      for (const side of [-1, 1]) {
        const c = at(0.97, 0.05 * s, side * 0.07 * s);
        L(c[0], c[1], c[2], v[0], v[1], v[2], cloth, 1.05);
      }
    }
    if (p.trait === "cape") {
      // a cape: from the shoulders down the back to the knees, spreading as it falls
      const red = flash ? V.white : V.red, hem: [number, number, number][] = [];
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        const a = at(0.96, -0.06 * s, k * 0.2 * s), b = at(-0.62, -(0.2 + 0.07 * (1 - Math.abs(k))) * s - 0.1 * p.gait, k * 0.36 * s);
        L(a[0], a[1], a[2], b[0], b[1], b[2], red, k === 0 ? 0.85 : 1.3, 0.9);
        hem.push(b);
      }
      for (let i = 0; i < hem.length - 1; i++) L(hem[i][0], hem[i][1], hem[i][2], hem[i + 1][0], hem[i + 1][1], hem[i + 1][2], red, 1.3, 0.9);
      for (const side of [-1, 1]) L(at(0.96, -0.06 * s, side * 0.2 * s)[0], at(0.96, -0.06 * s, side * 0.2 * s)[1], at(0.96, -0.06 * s, side * 0.2 * s)[2], at(0.93, 0.1 * s, 0)[0], at(0.93, 0.1 * s, 0)[1], at(0.93, 0.1 * s, 0)[2], red, 1.3);
    }
    if (p.trait === "tie") {
      const a = at(0.93, 0.112 * s, 0), k = at(0.86, 0.128 * s, 0), b = at(0.5, 0.132 * s, 0), tip = at(0.4, 0.125 * s, 0), w = 0.034 * s;
      // (red, unless that is what they are dressed in)
      const red = flash || p.color === V.red ? V.white : V.red;
      for (const side of [-1, 1]) {
        L(a[0], a[1], a[2] + side * 0.02 * s, k[0], k[1], k[2], red, 2.1);
        L(k[0], k[1], k[2], b[0], b[1], b[2] + side * w, red, 2.1);
        L(b[0], b[1], b[2] + side * w, tip[0], tip[1], tip[2], red, 2.1);
      }
      L(k[0], k[1], k[2], tip[0], tip[1], tip[2], red, 1.6);
    }

    if (xr > 0.01) {
      fade = xr;
      // the spine: a line of vertebrae, each a bar across
      const back = -0.055 * s;
      let pv = at(0.02, back, 0);
      for (let i = 1; i <= 13; i++) {
        const u = 0.02 + i / 13, q = at(u, back + 0.012 * s * Math.sin(u * 5), 0);
        L(pv[0], pv[1], pv[2], q[0], q[1], q[2], bone, 1.3);
        L(q[0], q[1], q[2] - 0.026 * s, q[0], q[1], q[2] + 0.026 * s, bone, 1.05);
        pv = q;
      }
      // ribs: seven pairs from the spine round to the breastbone (the last two stop short), dropping as they come forward
      for (let r = 0; r < 7; r++) {
        const u0 = 0.93 - r * 0.062, k = [0.78, 0.93, 1, 1.02, 1, 0.94, 0.85][r], half = 0.158 * s * k, depth = 0.1 * s * k, stop = r < 5 ? 0.12 : 0.9;
        for (const side of [-1, 1]) {
          let a0 = at(u0, back, side * 0.02 * s);
          for (let i = 1; i <= 7; i++) {
            const a = Math.PI - (i / 7) * (Math.PI - stop), q = at(u0 - (0.07 * (1 + Math.cos(a))) / 2, 0.02 * s + Math.cos(a) * depth, side * Math.sin(a) * half);
            L(a0[0], a0[1], a0[2], q[0], q[1], q[2], bone, 1.05);
            a0 = q;
          }
        }
      }
      const st0 = at(0.86, 0.118 * s, 0), st1 = at(0.58, 0.12 * s, 0);
      L(st0[0], st0[1], st0[2], st1[0], st1[1], st1[2], bone, 1.6);
      for (const S of [shL, shR]) L(st0[0], st0[1], st0[2], S[0], S[1], S[2], bone, 1.05);
      // the pelvis: two wings and the sacrum between
      for (const side of [-1, 1]) {
        const wing = [at(0.2, back, side * 0.03 * s), at(0.25, -0.02 * s, side * 0.15 * s), at(0.13, 0.05 * s, side * 0.165 * s), at(0.02, 0.07 * s, side * 0.08 * s), at(-0.02, 0.075 * s, side * 0.012 * s), at(0.05, back, side * 0.03 * s)];
        for (let i = 0; i < wing.length - 1; i++) L(wing[i][0], wing[i][1], wing[i][2], wing[i + 1][0], wing[i + 1][1], wing[i + 1][2], bone, 1.3);
        L(wing[0][0], wing[0][1], wing[0][2], wing[5][0], wing[5][1], wing[5][2], bone, 1.05);
      }
      // the heart (left of the middle) and the lungs either side: red and ragged once a bullet has been through
      const hoops = (c: [number, number, number], rx: number, ry: number, rz: number, color: string, width: number, torn: boolean) => {
        const j = () => (torn ? (Math.random() - 0.5) * 0.018 * s : 0), n = 10;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          L(c[0] + Math.cos(a0) * rx + j(), c[1] + Math.sin(a0) * ry + j(), c[2], c[0] + Math.cos(a1) * rx + j(), c[1] + Math.sin(a1) * ry + j(), c[2], color, width, 0.9);
          L(c[0], c[1] + Math.sin(a0) * ry + j(), c[2] + Math.cos(a0) * rz + j(), c[0], c[1] + Math.sin(a1) * ry + j(), c[2] + Math.cos(a1) * rz + j(), color, width, 0.9);
        }
      };
      for (const side of [-1, 1]) {
        const torn = p.burst.has(side < 0 ? "LEFT LUNG" : "RIGHT LUNG");
        hoops(at(0.72, 0.012 * s, side * 0.088 * s), 0.055 * s, 0.1 * s, 0.05 * s, torn ? BLOOD : LUNG, 0.85, torn);
      }
      const torn = p.burst.has("HEART"), throb = 1 + 0.1 * Math.max(0, Math.sin(performance.now() / 110 + p.seed));
      hoops(at(0.72, 0.05 * s, -0.03 * s), 0.04 * s * throb, 0.05 * s * throb, 0.04 * s * throb, torn ? BLOOD : ORGAN, 1.3, torn);
      fade = clothed;
    }

    // legs: trousers, or a skirt to the knee over bare shins
    const lt = 0.45 * s, ls = 0.47 * s, hw = 0.1 * s, knees: [number, number, number][] = [];
    for (const side of [1, -1] as const) {
      const [a, b] = p.legs[side > 0 ? 0 : 1];
      const kx = Math.sin(a) * lt, ky = py - Math.cos(a) * lt, fxx = kx + Math.sin(a - b) * ls, fyy = ky - Math.cos(a - b) * ls;
      knees.push([kx, ky, side * hw]);
      if (!p.dress) limb(0, py, side * hw, kx, ky, side * hw, 0.065 * s, cloth, 1.05);
      limb(kx, ky, side * hw, fxx, fyy, side * hw, 0.045 * s, p.dress ? skin : cloth, 1.05);
      L(fxx, fyy, side * hw, fxx + 0.19 * s, Math.min(fyy, 0.02), side * hw * 1.2, dim, 1.3);
      if (xr > 0.01) {
        // thigh bone, the two bones of the shin, the foot
        fade = xr;
        L(0, py, side * hw, kx, ky, side * hw, bone, 1.6);
        for (const o of [-0.014, 0.014]) L(kx, ky, side * hw + o * s, fxx, fyy, side * hw + o * s * 0.5, bone, 1.05);
        L(fxx, fyy, side * hw, fxx + 0.17 * s, Math.min(fyy, 0.02), side * hw * 1.2, bone, 1.05);
        fade = clothed;
      }
    }
    if (p.dress) {
      const cx = (knees[0][0] + knees[1][0]) / 2, cy = (knees[0][1] + knees[1][1]) / 2, spread = Math.abs(knees[0][0] - knees[1][0]) / 2;
      let prev: [number, number, number] | null = null, first: [number, number, number] | null = null;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, h: [number, number, number] = [cx + Math.cos(a) * (0.15 * s + spread), cy + 0.03, Math.sin(a) * 0.23 * s];
        const top = pts[0][i];
        L(top[0], top[1], top[2], h[0], h[1], h[2], cloth, 0.85, 0.85);
        if (prev) L(prev[0], prev[1], prev[2], h[0], h[1], h[2], cloth, 1.05);
        else first = h;
        prev = h;
      }
      if (prev && first) L(prev[0], prev[1], prev[2], first[0], first[1], first[2], cloth, 1.05);
    }

    // arms
    const run = p.state === "alarmed" && p.react <= 0;
    for (const side of [1, -1] as const) {
      const { S, e: [ex, ey, ez], h: [hx, hy, hz], gx, gy } = arm(p, side);
      limb(S[0], S[1], S[2], ex, ey, ez, 0.05 * s, cloth, 1.05);
      limb(ex, ey, ez, hx, hy, hz, 0.04 * s, cloth, 1.05);
      L(hx, hy, hz, hx + gx * 0.08 * s, hy + gy * 0.08 * s, hz, skin, 1.3);
      if (xr > 0.01) {
        // the upper arm's one bone and the forearm's two
        fade = xr;
        L(S[0], S[1], S[2], ex, ey, ez, bone, 1.3);
        for (const o of [-0.011, 0.011]) L(ex, ey + o * s, ez, hx, hy + o * s * 0.5, hz, bone, 1.05);
        fade = clothed;
      }
      // a glass upright in the hand, or a phone held up along the side of the head (put away to run)
      const held = side > 0 && p.thing?.on === "hand" && !(p.thing.kind === "phone" && run) ? p.thing : null;
      if (held) {
        this.mount(p, held, tmpP, tmpQ3);
        drawShape(to, held, tmpP, tmpQ3, false, true, fade);
      }
    }
    fade = 1;
    this.scars(p, false, L);
  }

  /** the wounds a bullet made and, seen through, the bone it cracked and its way from one wound to the other: in the head's frame or the body's */
  private scars(p: Person, head: boolean, line: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number, alpha?: number) => void): void {
    for (const w of p.wounds) {
      if (w.head !== head) continue;
      // two hoops at right angles, so it reads from any side: neat going in, ragged coming out
      const [x, y, z] = w.at, n = w.exit ? 9 : 6, rag = (i: number) => w.r * (w.exit ? 1 + 0.45 * Math.sin(i * 2.4) : 1);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r0 = rag(i), r1 = rag(i + 1);
        line(x, y + Math.cos(a0) * r0, z + Math.sin(a0) * r0, x, y + Math.cos(a1) * r1, z + Math.sin(a1) * r1, BLOOD, 1.6);
        line(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, z, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, z, BLOOD, 1.6);
      }
    }
    const xr = p.xray;
    if (xr <= 0.01) return;
    for (const c of p.cracks) {
      if (c.head !== head) continue;
      const g = c.segs;
      for (let i = 0; i < g.length; i += 6) line(g[i], g[i + 1], g[i + 2], g[i + 3], g[i + 4], g[i + 5], V.red, 1.3, xr);
    }
    const ch = p.channel;
    if (ch && ch.head === head) {
      const [ax, ay, az] = ch.a, [bx, by, bz] = ch.b, w = head ? 0.009 / HEAD : 0.009;
      line(ax, ay, az, bx, by, bz, BLOOD, 2.1, xr);
      for (const o of [-w, w]) line(ax, ay + o, az, bx, by + o, bz, BLOOD, 0.85, 0.6 * xr);
    }
  }

  /** what else there is to a head: its wounds, the brain when it is seen through, and the hat, the glasses, the cigar and its smoke */
  private drawThing(p: Person, B: Beams): void {
    const e = p.headM.elements, k = p.s, white = p.flash > 0;
    const P = (x: number, y: number, z: number): [number, number, number] => {
      x *= k;
      y *= k;
      z *= k;
      return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
    };
    const seg = (a: [number, number, number], b: [number, number, number], color: string, width: number, alpha = 1) => B.seg(a[0], a[1], a[2], b[0], b[1], b[2], white ? V.white : color, width, alpha);
    this.scars(p, true, (x0, y0, z0, x1, y1, z1, color, width, alpha = 1) =>
      B.seg(e[0] * x0 + e[4] * y0 + e[8] * z0 + e[12], e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13], e[2] * x0 + e[6] * y0 + e[10] * z0 + e[14], e[0] * x1 + e[4] * y1 + e[8] * z1 + e[12], e[1] * x1 + e[5] * y1 + e[9] * z1 + e[13], e[2] * x1 + e[6] * y1 + e[10] * z1 + e[14], color, width, alpha));
    if (p.xray > 0.01) {
      // the brain: folded loops from one side of the skull to the other, red and ragged once a bullet has been through
      const torn = p.burst.has("BRAIN"), color = torn ? BLOOD : ORGAN, j = () => (torn ? (Math.random() - 0.5) * 0.9 : 0), n = 18;
      for (const zf of [-0.75, -0.4, 0, 0.4, 0.75]) {
        const rz = Math.sqrt(1 - zf * zf);
        let prev: [number, number, number] | null = null;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2, fold = 1 + 0.08 * Math.sin(a * 7 + zf * 9);
          const q = P(-1 + Math.cos(a) * 7.6 * rz * fold + j(), 16.5 + Math.sin(a) * 5.2 * rz * fold + j(), zf * 6);
          if (prev) seg(prev, q, color, zf === 0 ? 1.05 : 0.85, 0.85 * p.xray);
          prev = q;
        }
      }
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        seg(P(-1 + Math.cos(a0) * 7.6, 16.5, Math.sin(a0) * 6), P(-1 + Math.cos(a1) * 7.6, 16.5, Math.sin(a1) * 6), color, 0.85, 0.7 * p.xray);
      }
    }
    if (p.hair) {
      // hair: strands from the brow over the crown to the nape (worn long, on down past the shoulders), and a line where it starts
      const hair = p.hair, brow: [number, number, number][] = [];
      for (const zf of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) {
        const rz = Math.sqrt(1 - zf * zf * 0.8), far = p.long ? 250 : 205;
        let prev: [number, number, number] | null = null;
        for (let a = 38; a <= far; a += 16.7) {
          // (over the skull, a little off it; past the nape it hangs)
          const r = (a * Math.PI) / 180, hang = Math.max(0, a - 190) / 60;
          const q = P(-0.6 + Math.cos(r) * 10.4 * rz - hang * 1.5, 14.6 + Math.sin(r) * 9.4 * (0.55 + 0.45 * rz) - hang * 9, zf * 8.4 * (1 + 0.1 * hang));
          if (prev) seg(prev, q, hair, 1.3, 0.95);
          else brow.push(q);
          prev = q;
        }
      }
      for (let i = 0; i < brow.length - 1; i++) seg(brow[i], brow[i + 1], hair, 1.3, 0.95);
    }
    // the hat, the glasses, the cigar and its smoke, while they are still on the head
    const s = p.thing;
    if (s?.on !== "head") return;
    this.mount(p, s, tmpP, tmpQ3);
    drawShape(B, s, tmpP, tmpQ3, white);
    if (s.kind === "cigar") {
      const tip = tmpP2.set(...s.lip).applyQuaternion(tmpQ3).add(tmpP);
      smoke(B, tip.x, tip.y, tip.z, this.clock, p.seed);
    }
  }

  /**
   * Each person's sound, written beside its mouth on the 2D canvas as it sounds: the syllable it is
   * on. When the next one starts (or the throat stops), the old one shrinks, dims and flies off.
   */
  drawWords(ctx: CanvasRenderingContext2D, camera: THREE.PerspectiveCamera, w: number, h: number): void {
    const clock = performance.now() / 1000, e = camera.matrixWorld.elements, cam = camera.position;
    const pxPerM1 = h / 2 / Math.tan((camera.fov * Math.PI) / 360);
    for (const p of this.list) {
      if (p.state === "gone") continue;
      const now = this.sound.word(p.voice), says = p.says, top = says[says.length - 1];
      if (top && now && top.key === now.key) {
        top.text = now.text;
        top.left = null;
      } else {
        if (top && top.left === null) top.left = clock;
        if (now && p.voice) says.push({ ...now, color: SAY[p.voice.clip.kind] ?? V.white, left: null });
      }
      while (says.length && (says.length > 5 || (says[0].left !== null && clock - says[0].left > FLY))) says.shift();
      if (!says.length) continue;
      // the lips, in the head's own cm
      const lips = tmpV.set(8.8 * p.s, 8.1 * p.s, 0).applyMatrix4(p.headM);
      const depth = -((lips.x - cam.x) * e[8] + (lips.y - cam.y) * e[9] + (lips.z - cam.z) * e[10]);
      if (depth < 0.2) continue;
      lips.project(camera);
      const x = ((lips.x + 1) / 2) * w, y = ((1 - lips.y) / 2) * h;
      if (x < -200 || x > w + 200 || y < -100 || y > h + 100) continue;
      const pxPerM = pxPerM1 / depth, base = Math.max(10, Math.min(46, 0.15 * pxPerM));
      const x0 = x + Math.max(6, 0.13 * pxPerM);
      for (const s of says) {
        const age = s.left === null ? 0 : clock - s.left, u = Math.min(1, age / FLY);
        const size = Math.max(9, base * (1 - 0.5 * u));
        const alpha = s.left === null ? 1 : 0.75 * (1 - u) ** 1.5;
        label(ctx, s.text, x0 + age * 3 * base, y + size * 0.36 - age * 4.5 * base, { size, color: s.color, weight: "m", ls: 0.05, alpha, moving: true });
      }
    }
  }
}

/** Where along a line (o, unit d) it goes into and comes out of a capsule from a to b of radius r (near enough), or null. */
function rayCapsule(o: THREE.Vector3, d: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number): [number, number] | null {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const uu = ux * ux + uy * uy + uz * uz, ud = ux * d.x + uy * d.y + uz * d.z;
  const uw = ux * wx + uy * wy + uz * wz, dw = d.x * wx + d.y * wy + d.z * wz;
  const den = uu - ud * ud;
  let sAxis = den > 1e-9 ? (uw - ud * dw) / den : 0;
  sAxis = Math.max(0, Math.min(1, sAxis));
  const qx = a.x + ux * sAxis - o.x, qy = a.y + uy * sAxis - o.y, qz = a.z + uz * sAxis - o.z;
  const t = qx * d.x + qy * d.y + qz * d.z;
  if (t <= 0) return null;
  const d2 = qx * qx + qy * qy + qz * qz - t * t;
  if (d2 > r * r) return null;
  const half = Math.sqrt(r * r - d2);
  return [Math.max(0.01, t - half), t + half];
}
