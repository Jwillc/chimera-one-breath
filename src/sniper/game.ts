/**
 * ONE BREATH: a sniper game in the head's own wireframe. You look through a scope at some people
 * a long way off; the handler names one of them by the thing that tells them apart, and you have
 * three rounds. Pull the trigger and the view leaves the scope to follow the bullet, slowly, out of
 * the muzzle, across to them and into whatever the crosshair was on. If that is a person, they are
 * seen through to the bones while it goes in, through whatever lies on its way, and out; then the
 * room's time comes back, and they go down with their hat or their glass falling after them.
 *
 * Five places, one after another and then round again with more people in each: a lit condo seen
 * from the roof opposite, a rooftop pool from a higher roof, the steps of a building from the
 * street below it, a café on the far bank from a moving car, a camp in the woods from a ridge.
 *
 * Every sound is a simulated airway (see `sounds/compose.py`): the room's talk and
 * screams, the handler, the rifle (a beatbox kit), the bullet (a long "sh" and a mouth going
 * "pyew"), your own breath and pulse.
 *
 * three.js draws the world into its own canvas, which is copied into the page's 2D canvas each
 * frame so the scope, the gauges and the glow pass are the 2D kit's own.
 *
 * A contract in the car opens from outside: the view goes slowly round the car and the rifle held
 * out of its window, says what is different here, and goes in at the scope.
 *
 * Controls: the mouse (or the arrow keys) aims, the wheel (or Z and X) zooms, shift holds your
 * breath, click or space fires, Esc or P pauses.
 */
import * as THREE from "three";
import { Beams } from "../ui/render/beams3d.ts";
import { Glow, dot, ring, seg } from "../ui/render/vector.ts";
import { V, mix } from "../ui/colors.ts";
import { Sound } from "./sound.ts";
import { Fx, BLOOD } from "./fx.ts";
import type { Crossing, Place } from "./place.ts";
import { Condo } from "./condo.ts";
import { Pool } from "./pool.ts";
import { Steps } from "./steps.ts";
import { Drive } from "./drive.ts";
import { Woods } from "./woods.ts";
import { Cast, TRAIT_TEXT, type Hit, type Passage, type Person } from "./people.ts";
import { CREW_HEAD, drawSeated } from "./crew.ts";

export type Phase = "menu" | "playing" | "paused" | "won" | "failed";
export interface Result {
  kind: "down" | "wrong" | "gone" | "empty";
  head: boolean;
  seconds: number;
  points: number;
}
export interface Snapshot {
  phase: Phase;
  contract: number;
  score: number;
  /** the mouse is captured (else the arrow keys aim too) */
  locked: boolean;
  result: Result | null;
  /** how the handler described the target */
  target: string;
  /** where this contract is, where the next one will be, and how the target gets away here */
  place: string;
  next: string;
  lost: string;
}

/** the places, in the order the contracts come to them */
const PLACES: (() => Place)[] = [() => new Condo(), () => new Pool(), () => new Steps(), () => new Drive(), () => new Woods()];

const ZOOMS = [4, 8, 16, 32];
const ROUNDS = 3;
/** a contract's opening: how slowly the room's time runs while the view goes round, how long before the round ends the view starts in at the scope, and how long that takes (s) */
const SLOW = 0.2, LEAD = 0.5, ENTER = 1.6;
/** the bullet's journey as the camera tells it: where it starts (the muzzle, m along its line), when it
 *  has cleared the rifle, when it reaches the last metres, how long those are and how fast it crawls them */
const S0 = 1, T1 = 0.9, T2 = 2.1, LAST = 7, CRAWL = 4.5, T3 = T2 + LAST / CRAWL;
/** what the handler's lines say (the clips are rendered from the same words) */
const LINES: Record<string, string> = {
  go: "One breath. One shot.",
  "win-1": "Target down.",
  "win-2": "Good shot. Target down.",
  "win-3": "Clean. Go home.",
  "wrong-1": "That was the wrong one.",
  "wrong-2": "Wrong target. We are done.",
  "miss-1": "You missed.",
  "miss-2": "Missed. They are running.",
  gone: "The target is gone.",
  empty: "You are out of rounds.",
};

interface Shot {
  o: THREE.Vector3;
  d: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  /** how far the bullet goes (m), and what stops it */
  L: number;
  hit: Hit | null;
  what: string | null;
  /** the people know about it when it lands */
  heard: boolean;
  glass: Crossing | null;
  broke: boolean;
  /** seconds since the trigger, and metres flown */
  t: number;
  s: number;
  wake: number;
  /** inside someone: how long it has been (s) and will be, and what it has yet to meet on the way */
  inside: boolean;
  into: number;
  thru: number;
  ahead: Passage[];
  /** what it has met, named on screen: each with where it was in the head's frame or the body's, so the name stays with it */
  met: (Passage & { age: number; on: [number, number, number] })[];
  /** it has done what it came to do (come out of someone, or stopped in something) */
  landed: boolean;
  after: number;
  /** the wall behind whoever it went through (m along its line), and whether it has got there */
  far: number;
  spent: boolean;
  beat: number;
  hiss: { src: AudioBufferSourceNode; gain: GainNode } | null;
  pyew: { src: AudioBufferSourceNode; gain: GainNode } | null;
  readonly camAt: THREE.Vector3;
  readonly lookAt: THREE.Vector3;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** the game's own lettering: Archivo, narrow and heavy enough to read small (the synth's single-stroke Hershey is not) */
const FACE = '"Archivo", system-ui, -apple-system, "Segoe UI", sans-serif';
interface TextOpts {
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  alpha?: number;
  weight?: number;
  /** letter spacing, in ems */
  ls?: number;
}
/**
 * Words on the gauges: solid, with a dark edge under them so that a line of the picture behind does
 * not run into the letters. Returns how wide they came out.
 */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): number {
  const size = o.size ?? 12, ls = (o.ls ?? 0.07) * size, align = o.align ?? "left";
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.font = `${o.weight ?? 600} semi-condensed ${size}px ${FACE}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls.toFixed(2)}px`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  // (the spacing after the last letter is not part of the word)
  const at = x + (align === "right" ? ls : align === "center" ? ls / 2 : 0);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, size * 0.3);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(s, at, y);
  ctx.fillStyle = o.color ?? V.white;
  ctx.fillText(s, at, y);
  const w = ctx.measureText(s).width - ls;
  ctx.restore();
  return w;
}
/** how far the room's time has come back (0 to 1), this long after a bullet came out of someone (s) */
const back = (after: number) => smooth((after - 0.4) / 0.9);
/** a value that eases from key to key: [time, value] pairs */
function keyed(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * smooth((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  return keys[keys.length - 1][1];
}
/** how far the bullet has flown t seconds after the trigger, on its way to L: slow out of the
 *  muzzle, fast over the street, slow again for the last metres */
function travel(t: number, L: number): number {
  const a = S0 + 6, b = Math.max(a + 1, L - LAST);
  if (t < T1) return S0 + 6 * (t / T1) ** 2;
  if (t < T2) {
    const h = T2 - T1, u = (t - T1) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * (12 / T1) + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * CRAWL;
  }
  return b + CRAWL * (t - T2);
}

export class Game {
  readonly stats = { ms: 0, fps: 0 };
  showStats = false;
  /** for the browser checks: the clock stops between frames, and only `frame(dt)` moves it */
  frozen = false;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly glCanvas = document.createElement("canvas");
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(10, 1, 0.05, 2500);
  private readonly places: (Place | null)[] = PLACES.map(() => null);
  private place!: Place;
  /** where the scope's eye is this frame */
  private readonly eye = new THREE.Vector3();
  /** blood and glass fall to the place's own ground */
  private readonly fx = new Fx((x, z) => this.place.floor(x, z));
  private readonly cast: Cast;
  private readonly live = new Beams({ fog: false });
  private readonly rifle = new THREE.Group();
  private readonly rifleLines = new Beams({ fog: false });
  private readonly glow = new Glow();
  private readonly keys = new Set<string>();
  private readonly ro: ResizeObserver;
  private readonly off: (() => void)[] = [];
  private raf = 0;
  private last = performance.now();
  private w = 1;
  private h = 1;
  private dpr = 1;
  private clock = 0;

  private phase: Phase = "menu";
  private locked = false;
  private contract = 0;
  private score = 0;
  private result: Result | null = null;
  private target: Person | null = null;
  /** seconds through the scope on this contract */
  private watch = 0;
  private rounds = ROUNDS;
  private alarmed = false;
  private pending: Result["kind"] | null = null;
  private pendingHead = false;
  private outcome: { result: Result; in: number } | null = null;
  private queue: { at: number; id: string }[] = [];
  private subtitle = { text: "", until: 0 };
  private banner = { text: "", sub: "", color: V.amber, age: 99 };

  private readonly aim = { yaw: 0, pitch: -0.052 };
  private zoom = 1;
  private fov = 40 / ZOOMS[1];
  private readonly breath = { air: 1, holding: false, spent: false, k: 1 };
  private pulse = 0;
  private beatIn = 0.5;
  private recoil = 0;
  private bolt = 0;
  private still = false;
  private shot: Shot | null = null;
  /** the contract's opening, while it lasts: seconds into it */
  private intro: { t: number } | null = null;
  /** the contracts whose opening has been shown (trying one again goes straight to the scope) */
  private readonly seen = new Set<number>();
  private wakes: { x: number; y: number; z: number; age: number }[] = [];
  private flashAt = -9;
  private shake = 0;
  private range = 0;

  private readonly fwd = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();

  static async create(canvas: HTMLCanvasElement, base: string, onChange: (s: Snapshot) => void, progress?: (done: number, of: number) => void): Promise<Game> {
    const sound = await Sound.load(base, progress);
    return new Game(canvas, sound, onChange);
  }

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly sound: Sound, private readonly onChange: (s: Snapshot) => void) {
    this.ctx = canvas.getContext("2d")!;
    this.gl = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    // the palette's sRGB values go straight through, as on the 2D screens
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setClearColor(0x000000, 1);
    this.cast = new Cast(sound, this.fx);
    this.rifle.add(this.rifleLines.group);
    this.rifle.visible = false;
    this.scene.add(this.cast.group, this.live.group, this.rifle, this.camera);

    this.fit();
    this.go(0);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
    this.placeCamera();
    this.cast.prewarm(this.camera);
    // somebody home behind the menu
    this.target = this.cast.populate(this.place, 4, 2);
    this.listen();
    // (a canvas draws in a stand-in face until its own has been asked for)
    void document.fonts?.load(`600 12px "Archivo"`);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const f of this.off) f();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.cast.clear();
    this.cast.dispose();
    for (const p of this.places) p?.dispose();
    this.live.dispose();
    this.rifleLines.dispose();
    this.sound.dispose();
    this.gl.dispose();
    // browsers allow few live WebGL contexts: give this one back now, not at garbage collection
    this.gl.forceContextLoss();
  }

  get snapshot(): Snapshot {
    const next = PLACES.length ? this.contract % PLACES.length : 0;
    return { phase: this.phase, contract: this.contract, score: this.score, locked: this.locked, result: this.result, target: this.target ? TRAIT_TEXT[this.target.trait] : "", place: this.place.name, next: (this.places[next] ?? this.make(next)).name, lost: this.place.lost.card };
  }

  private make(i: number): Place {
    const p = (this.places[i] = PLACES[i]());
    p.setResolution(this.w, this.h);
    p.sound = (name, rate, level) => void this.sound.hit(name, rate, level);
    return p;
  }

  /** to the i-th place */
  private go(i: number): void {
    const to = this.places[i] ?? this.make(i);
    if (to === this.place) return;
    if (this.place) this.scene.remove(this.place.group);
    this.place = to;
    this.scene.add(to.group);
    this.drawRifle(to.bipod);
  }

  /** Start, go on to the next contract, try again or resume. Call from the click itself: audio and the mouse need the gesture. */
  start(): void {
    this.sound.resume();
    if (this.phase === "menu" || this.phase === "won") this.brief(this.contract + 1);
    else if (this.phase === "failed") this.brief(this.contract);
    this.setPhase("playing");
    this.last = performance.now();
    this.capture();
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.keys.clear();
    this.letGo();
    void this.sound.ctx.suspend().catch(() => {});
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setPhase("paused");
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.onChange(this.snapshot);
  }

  private capture(): void {
    try {
      // a browser may refuse (no gesture, an embedded page): the mouse still aims over the view, and the arrow keys
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch {
      // not available here
    }
  }

  /** a new contract: the next place, new people in it, a new target, three rounds, the scope somewhere near them */
  private brief(n: number): void {
    this.contract = n;
    this.fx.clear();
    this.cast.clear();
    this.go((n - 1) % PLACES.length);
    const place = this.place, { n: count, strollers } = place.people(Math.floor((n - 1) / PLACES.length));
    place.reset();
    this.target = this.cast.populate(place, count, strollers);
    this.rounds = ROUNDS;
    this.watch = 0;
    this.alarmed = false;
    this.pending = null;
    this.outcome = null;
    this.result = null;
    this.shot = null;
    this.rifle.visible = false;
    this.intro = place.opening && !this.seen.has(n) ? { t: 0 } : null;
    this.seen.add(n);
    this.wakes = [];
    this.bolt = this.recoil = 0;
    this.still = false;
    Object.assign(this.breath, { air: 1, holding: false, spent: false, k: 1 });
    Object.assign(this.aim, place.look());
    this.zoom = 1;
    this.banner = { text: `CONTRACT ${n}`, sub: `${place.name} - TARGET: ${TRAIT_TEXT[this.target.trait]}`, color: V.amber, age: 0 };
    this.subtitle.until = 0;
    // the handler: where to look, who it is, go; each line waits for the one before
    const ids = [place.intro, `brief-${this.target.trait}`, "go"];
    let at = this.clock + 0.7;
    this.queue = ids.map((id) => {
      const clip = this.sound.clip(id), line = { at, id };
      at += (clip ? clip.end - clip.start : 1.5) + 0.6;
      return line;
    });
  }

  // ------------------------------------------------------------------ input
  private listen(): void {
    const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement | Window, type: K, f: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, f as EventListener, opts);
      this.off.push(() => target.removeEventListener(type, f as EventListener, opts));
    };
    on(window, "keydown", (e) => {
      if (this.phase !== "playing") return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space" || e.code === "KeyF") this.fire();
      if (e.code === "KeyZ") this.zoomBy(1);
      if (e.code === "KeyX") this.zoomBy(-1);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.hold();
      if (e.code === "KeyP" || e.code === "Escape") this.pause();
    });
    on(window, "keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.letGo();
    });
    on(window, "blur", () => this.pause());
    on(document, "pointerlockchange", () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      // Esc lets go of the mouse: that is the pause key
      if (was && !this.locked && this.phase === "playing") this.pause();
      else this.onChange(this.snapshot);
    });
    on(this.canvas, "mousemove", (e) => {
      // captured or not: where a page may not take the mouse, moving it over the view still aims
      if (this.phase !== "playing" || this.shot || this.intro) return;
      const k = 0.0024 * (this.fov / 40);
      this.turn(-e.movementX * k, -e.movementY * k);
    });
    on(this.canvas, "mousedown", (e) => {
      if (this.phase !== "playing" || e.button !== 0) return;
      if (!this.locked) this.capture();
      this.fire();
    });
    on(this.canvas, "wheel", (e) => {
      e.preventDefault();
      if (this.phase === "playing" && e.deltaY !== 0) this.zoomBy(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    on(this.canvas, "contextmenu", (e) => e.preventDefault());
  }

  private turn(dyaw: number, dpitch: number): void {
    this.still = false;
    const { yaw, pitch } = this.place;
    this.aim.yaw = Math.max(yaw[0], Math.min(yaw[1], this.aim.yaw + dyaw));
    this.aim.pitch = Math.max(pitch[0], Math.min(pitch[1], this.aim.pitch + dpitch));
  }

  private zoomBy(step: number): void {
    const z = Math.max(0, Math.min(ZOOMS.length - 1, this.zoom + step));
    if (z === this.zoom || this.shot || this.intro) return;
    this.zoom = z;
    this.sound.hit("t", 1.7, 0.18);
  }

  /** breathe in and hold: the crosshair settles, for as long as the air lasts */
  private hold(): void {
    const b = this.breath;
    if (b.holding || b.spent || this.shot || this.intro || this.phase !== "playing") return;
    b.holding = true;
    this.sound.hit("breath-in", 1.15, 0.5);
  }

  private letGo(): void {
    const b = this.breath;
    if (!b.holding) return;
    b.holding = false;
    this.sound.hit("breath-out", 1, 0.5);
  }

  private fit(): void {
    const b = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, b.width);
    this.h = Math.max(1, b.height);
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    for (const b3 of [this.live, this.rifleLines]) b3.setResolution(this.w, this.h);
    for (const p of this.places) p?.setResolution(this.w, this.h);
    this.cast.setResolution(this.w, this.h);
  }

  // ------------------------------------------------------------------ the loop
  private readonly loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.stats.fps += (1000 / Math.max(1, now - this.last) - this.stats.fps) * 0.05;
    this.last = now;
    const t0 = performance.now();
    this.frame(this.frozen ? 0 : dt);
    this.stats.ms += (performance.now() - t0 - this.stats.ms) * 0.05;
    this.raf = requestAnimationFrame(this.loop);
  };

  /** one frame: everything moves by dt (not at all while paused) and is drawn */
  frame(dt: number): void {
    const world = this.advance(this.phase === "paused" ? 0 : dt);
    this.draw(world);
  }

  /** Move everything on by dt of the player's time. Returns how much time passed in the room: almost none while a bullet is in the air. */
  private advance(dt: number): number {
    this.clock += dt;
    let world = dt;
    if (this.intro) world = dt * this.opening(dt);
    else if (this.shot) world = dt * this.flight(dt);
    else this.scope(dt);
    this.cast.pace = dt > 0 ? world / dt : 1;
    const sh = this.shot;
    // whoever the bullet is about to reach is seen through to the bones, until it is out and they fall
    if (sh?.hit) this.cast.seeThrough(sh.hit.person, sh.landed ? 1 - smooth(sh.after / 1.1) : smooth((1.3 - (sh.L - sh.s)) / 0.9));
    // (nobody moves while the bullet is on its way: it lands where the crosshair was)
    this.cast.update(sh && !sh.inside && !sh.landed ? 0 : world);
    this.fx.update(world);
    this.place.update(world);
    for (const k of this.wakes) k.age += dt;
    this.wakes = this.wakes.filter((k) => k.age < 1.2);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.banner.age += dt;
    // the target got away, or the chance went by
    if (!this.shot && !this.intro && !this.outcome && !this.pending && this.phase === "playing" && (this.target?.state === "gone" || this.place.over())) this.settle("gone", false);
    if (this.outcome && !this.shot) {
      this.outcome.in -= dt;
      if (this.outcome.in <= 0) {
        const r = this.outcome.result;
        this.outcome = null;
        this.result = r;
        this.score += r.points;
        this.letGo();
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        this.setPhase(r.kind === "down" ? "won" : "failed");
      }
    }
    return world;
  }

  /** the time through the scope: aiming, breathing, the pulse, the handler */
  private scope(dt: number): void {
    const playing = this.phase === "playing", b = this.breath, k = this.keys;
    if (playing) {
      const look = 0.5 * (this.fov / 40) * dt;
      const dy = (k.has("ArrowLeft") ? look : 0) - (k.has("ArrowRight") ? look : 0), dp = (k.has("ArrowUp") ? look : 0) - (k.has("ArrowDown") ? look : 0);
      if (dy || dp) this.turn(dy, dp);
      if (!this.outcome) this.watch += dt;
      // what the handler has to say, in order
      while (this.queue.length && this.clock >= this.queue[0].at) this.radio(this.queue.shift()!.id);
    } else if (this.phase === "menu") {
      this.aim.yaw = this.place.home.yaw + 0.035 * Math.sin(this.clock * 0.11);
      this.aim.pitch = this.place.home.pitch + 0.012 * Math.sin(this.clock * 0.07);
    }
    this.fov += (40 / ZOOMS[this.zoom] - this.fov) * Math.min(1, 12 * dt);

    // air: held, it runs out; out of it, the crosshair swims until it is back
    if (b.holding) {
      b.air -= dt / 5;
      if (b.air <= 0) {
        b.air = 0;
        b.spent = true;
        this.letGo();
      }
    } else {
      b.air = Math.min(1, b.air + dt / 3.5);
      if (b.spent && b.air > 0.55) b.spent = false;
    }
    b.k += ((b.holding ? 0.1 : b.spent ? 2.1 : 1) - b.k) * Math.min(1, 5 * dt);

    // the pulse: two soft kicks, quicker when the air is short, and a twitch of the crosshair with each
    this.pulse *= Math.exp(-9 * dt);
    this.beatIn -= dt;
    if (this.beatIn <= 0 && playing) {
      this.beatIn = 60 / (58 + 34 * (1 - b.air));
      this.pulse = 1;
      this.sound.hit("B", 0.42, 0.13);
      this.sound.hit("B", 0.36, 0.09, 0.17);
    }
    this.recoil *= Math.exp(-4 * dt);
    this.bolt = Math.max(0, this.bolt - dt);

  }

  private radio(id: string): void {
    const clip = this.sound.clip(id);
    if (clip) this.sound.say(clip, null, 1, 0.85);
    const text = LINES[id] ?? (clip ? clip.say : "");
    this.subtitle = { text: text.toUpperCase(), until: this.clock + (clip ? clip.end - clip.start : 1.5) + 0.9 };
  }

  // ------------------------------------------------------------------ the opening
  /** How far the view has come in from its round to the scope (0 to 1; 1 when there is no opening). */
  private entering(): number {
    const op = this.place.opening;
    return this.intro && op ? smooth((this.intro.t - (op.orbit - LEAD)) / ENTER) : 1;
  }

  /** The opening's time: the handler talks, the room runs slow. Returns how fast its time runs against the player's. */
  private opening(dt: number): number {
    this.intro!.t += dt;
    while (this.queue.length && this.clock >= this.queue[0].at) this.radio(this.queue.shift()!.id);
    this.fov = 40 / ZOOMS[this.zoom];
    const u = this.entering();
    if (u >= 1) {
      // in at the scope: it is the player's now, and the contract is named again where they are looking
      this.intro = null;
      this.rifle.visible = false;
      this.banner.age = 0;
      return 1;
    }
    return SLOW + (1 - SLOW) * u;
  }

  /** the view during the opening: round the rifle and what carries it, then in behind the scope and through it */
  private introCamera(): void {
    const cam = this.camera, op = this.place.opening!, eye = this.place.eye(this.eye);
    const k = smooth(this.intro!.t / op.orbit), u = this.entering();
    // (it ends its round straight behind the rifle, wherever that is pointing)
    const a = Math.PI / 2 - this.aim.yaw - 2 * Math.PI + op.sweep * (1 - k), r = op.far + (op.near - op.far) * k;
    const c = this.tmp.set(eye.x + op.centre[0], eye.y + op.centre[1], eye.z + op.centre[2]);
    cam.position.set(c.x + Math.cos(a) * r, c.y + op.high + (op.low - op.high) * k, c.z + Math.sin(a) * r);
    cam.lookAt(c.lerp(eye, 0.8 * k));
    cam.position.lerp(eye, u);
    cam.quaternion.slerp(this.tmpQ.setFromEuler(this.tmpE.set(this.aim.pitch, this.aim.yaw, 0, "YXZ")), u);
    // (the glass's own narrow view arrives late, so that the way in is seen)
    cam.fov = 46 * (this.fov / 46) ** (u * u);
  }

  /** during the opening: the rifle where it is held, whoever holds it, and the head of whoever else is with them */
  private crew(B: Beams, alpha: number, dt: number): void {
    const eye = this.eye, show = alpha > 0.5, K = CREW_HEAD;
    const q = this.tmpQ.setFromEuler(this.tmpE.set(this.aim.pitch, this.aim.yaw, 0, "YXZ"));
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    this.rifle.visible = show;
    this.rifle.position.copy(eye).addScaledVector(d, S0);
    this.rifle.quaternion.copy(q);
    // their eye is on the scope's own line, a hand's width behind its glass; the rest of them follows from that
    const head = eye.clone().addScaledVector(d, -0.36 - 9.6 * K).addScaledVector(up, 0.078 - 15.2 * K).addScaledVector(right, -3.3 * K);
    const fwd = new THREE.Vector3(d.x, 0, d.z).normalize(), across = new THREE.Vector3(right.x, 0, right.z).normalize();
    const hip = head.clone().addScaledVector(fwd, -0.14);
    hip.y -= 0.5;
    const handR = eye.clone().addScaledVector(d, -0.15).addScaledVector(up, -0.08), handL = eye.clone().addScaledVector(d, 0.3).addScaledVector(up, -0.035);
    drawSeated(B, { hip, neck: head, fwd, right: across, twist: 0.1, handR, handL }, mix(V.blue, V.white, 0.55), alpha);
    if (!show) return;
    const cam = this.camera.position, driver = this.place.driver;
    this.cast.extra(0, head, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, up, right)), cam, dt, K);
    if (driver) this.cast.extra(1, driver.pos, driver.q, cam, dt, K);
  }

  // ------------------------------------------------------------------ the shot
  /** Pull the trigger: the bullet goes where the crosshair is at this instant. (During an opening: get on with it.) */
  fire(): void {
    if (this.phase !== "playing" || this.shot || this.outcome || this.pending) return;
    if (this.intro) {
      this.intro.t = Math.max(this.intro.t, this.place.opening!.orbit - LEAD);
      return;
    }
    if (this.rounds <= 0 || this.bolt > 0) {
      if (this.rounds <= 0) this.sound.hit("click", 1.5, 0.3);
      return;
    }
    this.rounds--;
    this.letGo();
    this.placeCamera();
    const o = this.eye.clone(), d = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(d, this.camera.up).normalize(), up = new THREE.Vector3().crossVectors(right, d);
    const wall = this.place.raycast(o, d), body = this.cast.raycast(o, d), hit = body && body.t < wall.t ? body : null;
    const L = hit ? hit.t : wall.t, glass = this.place.glass(o, d);
    // the trigger is a tongue click; the shot a kick under a snare, slowed with everything else
    const snd = this.sound;
    snd.hit("click", 1.25, 0.6);
    snd.hit("B", 0.5, 1, 0.05);
    snd.hit("K", 0.7, 0.8, 0.05);
    snd.hit("Pf", 0.6, 0.7, 0.07);
    snd.hit("kch", 0.4, 0.5, 0.1);
    // its flight: a long "sh" sinking as it goes, and from the muzzle's far side a mouth going "pyew"
    const hiss = snd.hit("hiss", 0.8, 0.38, 0.15), pyew = snd.hit("pyew", 0.52, 0.45, T1), now = snd.ctx.currentTime;
    if (hiss) {
      const level = hiss.gain.gain.value;
      hiss.gain.gain.setValueAtTime(0, now);
      hiss.gain.gain.linearRampToValueAtTime(level * 0.5, now + 0.6);
      hiss.gain.gain.linearRampToValueAtTime(level, now + T3);
      hiss.src.playbackRate.setValueAtTime(0.8, now);
      hiss.src.playbackRate.linearRampToValueAtTime(0.42, now + T3);
    }
    this.cast.hush();
    this.shot = { o, d, right, up, L, hit, what: hit ? "person" : wall.what, heard: !!hit || wall.heard, glass: glass && glass.t < L ? glass : null, broke: false, t: 0, s: S0, wake: S0, inside: false, into: 0, thru: 1, ahead: [], met: [], landed: false, after: 0, far: wall.t, spent: !hit, beat: 0.5, hiss, pyew, camAt: new THREE.Vector3(), lookAt: new THREE.Vector3() };
    this.flashAt = this.clock;
    this.rifle.position.copy(o).addScaledVector(d, S0);
    this.rifle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
    this.rifle.visible = true;
  }

  /** The bullet's time. Returns how fast the room's time runs against the player's. */
  private flight(dt: number): number {
    const sh = this.shot!, snd = this.sound;
    sh.t += dt;
    for (const e of sh.met) e.age += dt;
    if (sh.landed) {
      sh.after += dt;
      if (!sh.spent) {
        // out of them and on, quicker and quicker, into the wall behind
        sh.s += (2 + 30 * sh.after) * dt;
        if (sh.s >= sh.far) {
          sh.s = sh.far;
          sh.spent = true;
          const at = this.tmp.copy(sh.o).addScaledVector(sh.d, sh.far);
          this.fx.ring(at.x, at.y, at.z, 0.3, V.amber, 0.04);
          snd.hit("K", 1.2, 0.35);
        }
      }
      if (sh.after > (sh.hit ? 3 : 1.1)) this.backToScope();
      // (out of someone, the room's time comes back: they fall, and what they had falls, at its own speed)
      return sh.hit ? 0.16 + 0.84 * back(sh.after) : 0.16;
    }
    if (sh.inside) {
      // through a body: slower still, and everything it meets is named
      const hit = sh.hit!;
      sh.into += dt;
      sh.s = hit.t + (hit.out - hit.t) * Math.min(1, sh.into / sh.thru);
      this.cast.bore(hit.person, this.tmp.copy(sh.o).addScaledVector(sh.d, sh.s));
      while (sh.ahead.length && sh.s >= sh.ahead[0].s - 1e-6) this.meet(sh, sh.ahead.shift()!);
      if (sh.into >= sh.thru) this.land(sh);
      return 0.004;
    }
    sh.s = Math.min(sh.L, travel(sh.t, sh.L));
    // rings of air left behind it, close together where it goes slowly
    const gap = sh.t < T1 || sh.t > T2 ? 0.45 : 5;
    while (sh.s - sh.wake > gap) {
      sh.wake += gap;
      this.wakes.push({ x: sh.o.x + sh.d.x * sh.wake, y: sh.o.y + sh.d.y * sh.wake, z: sh.o.z + sh.d.z * sh.wake, age: 0 });
    }
    // the pulse, slow
    sh.beat -= dt;
    if (sh.beat <= 0) {
      sh.beat = 1;
      snd.hit("B", 0.36, 0.3);
      snd.hit("B", 0.3, 0.2, 0.24);
    }
    if (sh.glass && !sh.broke && sh.s >= sh.glass.t) this.breakGlass(sh);
    if (sh.s >= sh.L) {
      if (sh.hit) this.enter(sh, sh.hit);
      else this.land(sh);
    } else if (sh.what === null && sh.t > 2.4) this.backToScope();
    return sh.t > T2 ? 0.05 : 0.012;
  }

  /** the bullet touches someone: its own sounds stop, and its way through them begins */
  private enter(sh: Shot, hit: Hit): void {
    this.quiet(sh, 0.03);
    sh.inside = true;
    sh.ahead = this.cast.enter(hit, sh.o, sh.d);
    // long enough to read what it meets, however little of them it goes through
    sh.thru = Math.max(0.8, Math.min(1.9, (hit.out - hit.t) / 0.15));
    this.raise();
  }

  /** inside someone, the bullet comes to something: say what, and let it be heard */
  private meet(sh: Shot, e: Passage): void {
    const snd = this.sound;
    sh.met.push({ ...e, age: 0, on: this.cast.local(sh.hit!.person, sh.hit!.head, e.at) });
    if (e.kind === "exit") return;
    this.cast.meet(sh.hit!.person, e, sh.d, sh.hit!.head);
    this.shake = Math.max(this.shake, 0.5);
    if (e.kind === "entry") {
      // skin: a wet lip pop
      snd.hit("pop", 0.7, 0.9);
      snd.hit("t", 0.7, 0.4, 0.01);
    } else if (e.kind === "bone") {
      // bone: a rimshot and a tongue click
      snd.hit("K", 1.5, 0.75);
      snd.hit("click", 0.8, 0.55, 0.01);
    } else {
      // something soft: a deeper pop over a low kick
      snd.hit("pop", 0.4, 0.9);
      snd.hit("B", 0.6, 0.5);
    }
  }

  /** stop the bullet's own voice */
  private quiet(sh: Shot, over: number): void {
    const t = this.sound.ctx.currentTime;
    for (const v of [sh.hiss, sh.pyew]) {
      if (!v) continue;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, over);
      try {
        v.src.stop(t + over * 8);
      } catch {
        // already stopped
      }
    }
    sh.hiss = sh.pyew = null;
  }

  private breakGlass(sh: Shot): void {
    const g = sh.glass!, snd = this.sound, d = sh.d;
    sh.broke = true;
    this.place.shatter(g);
    this.raise();
    for (let i = 0; i < 54; i++) {
      // splinters, thrown into the room round the bullet's line
      const a = Math.random() * Math.PI * 2, r = 0.03 + 0.4 * Math.random() ** 1.6, len = 0.02 + 0.09 * Math.random(), b = Math.random() * Math.PI;
      const x = g.x + Math.cos(a) * r, y = g.y + Math.sin(a) * r, push = 3 + 9 * Math.random(), out = 1 + 3 * Math.random();
      this.fx.shard(x - Math.cos(b) * len, y - Math.sin(b) * len, g.z, x + Math.cos(b) * len, y + Math.sin(b) * len, g.z, Math.random() < 0.3 ? V.white : V.blue, 0.85, d.x * push + Math.cos(a) * out, d.y * push + Math.sin(a) * out + 0.6, d.z * push);
    }
    this.fx.ring(g.x, g.y, g.z, 0.5, V.white, 0.03);
    snd.hit("tss", 1.5, 0.7);
    snd.hit("kch", 1.9, 0.55, 0.03);
    for (let i = 0; i < 6; i++) snd.hit("t", 1.5 + Math.random() * 1.2, 0.3, 0.08 + i * 0.09 + Math.random() * 0.05);
  }

  /** they know */
  private raise(): void {
    if (this.alarmed) return;
    this.alarmed = true;
    this.cast.alarm();
  }

  /** the bullet has done what it came to do: come out of someone, or stopped in something */
  private land(sh: Shot): void {
    const snd = this.sound, at = sh.o.clone().addScaledVector(sh.d, sh.hit ? sh.hit.out : sh.L);
    sh.landed = true;
    sh.inside = false;
    sh.s = sh.hit ? sh.hit.out : sh.L;
    sh.camAt.copy(this.camera.position);
    sh.lookAt.copy(at);
    this.shake = 1;
    this.quiet(sh, 0.03);
    if (sh.hit) {
      // out the far side: a burst of lips and teeth over a kick, and the cry (slow, like everything else just now)
      const p = sh.hit.person;
      while (sh.ahead.length) this.meet(sh, sh.ahead.shift()!);
      snd.hit("Pf", 0.5, 0.9);
      snd.hit("B", 0.9, 0.9);
      snd.hit("pop", 0.55, 0.7, 0.02);
      this.cast.shoot(p, at, sh.d, sh.hit.head, 0.62);
      this.raise();
      this.pending = p === this.target ? "down" : "wrong";
      this.pendingHead = sh.hit.head;
      return;
    }
    if (sh.what === null) return;
    // a wall, the ground, a table, the street: a rimshot and a tick, a ring and a few sparks
    snd.hit("K", 1.1, 0.9);
    snd.hit("t", 0.8, 0.5, 0.02);
    this.fx.ring(at.x, at.y, at.z, 0.35, V.amber, 0.04);
    for (let i = 0; i < 12; i++) {
      const vx = (Math.random() - 0.5) * 5 - sh.d.x * 2, vy = Math.random() * 4, vz = (Math.random() - 0.5) * 5 - sh.d.z * 3;
      this.fx.shard(at.x, at.y, at.z, at.x + vx * 0.015, at.y + vy * 0.015, at.z + vz * 0.015, i % 3 ? V.amber : V.white, 1.05, vx, vy, vz);
    }
    if (sh.heard) this.raise();
  }

  /** the bullet's story is over: the eye is back at the scope, the bolt is worked, the handler speaks */
  private backToScope(): void {
    const sh = this.shot!, snd = this.sound;
    this.quiet(sh, 0.05);
    this.cast.seeThrough(null, 0);
    this.shot = null;
    this.rifle.visible = false;
    this.recoil = 1;
    if (this.pending) {
      this.settle(this.pending, this.pendingHead);
      this.pending = null;
      return;
    }
    if (this.rounds <= 0) {
      this.settle("empty", false);
      return;
    }
    // work the bolt: up and back, the case rings on the ground, forward and down
    this.bolt = 0.95;
    snd.hit("t", 0.8, 0.45, 0.1);
    snd.hit("K", 1.3, 0.4, 0.3);
    snd.hit("click", 2.2, 0.16, 0.45);
    snd.hit("click", 2.5, 0.1, 0.58);
    snd.hit("kch", 1.6, 0.35, 0.64);
    snd.hit("t", 1.1, 0.45, 0.86);
    this.queue = [{ at: this.clock + 0.5, id: this.alarmed ? "miss-2" : "miss-1" }];
  }

  /** the contract is decided: say so, and in a moment show the card */
  private settle(kind: Result["kind"], head: boolean): void {
    const seconds = this.watch;
    const points = kind === "down" ? 1000 + (head ? 500 : 0) + Math.max(0, Math.round(500 - 8 * seconds)) + 250 * this.rounds : 0;
    this.outcome = { result: { kind, head, seconds, points }, in: 3.4 };
    const pick = (ids: string[]) => ids[Math.floor(Math.random() * ids.length)];
    const id = kind === "down" ? pick(["win-1", "win-2", "win-3"]) : kind === "wrong" ? pick(["wrong-1", "wrong-2"]) : kind;
    this.queue = [{ at: this.clock + 0.7, id }];
    this.banner =
      kind === "down" ? { text: "TARGET DOWN", sub: head ? "HEAD SHOT" : "", color: V.green, age: 0 }
      : kind === "wrong" ? { text: "WRONG TARGET", sub: "", color: BLOOD, age: 0 }
      : kind === "gone" ? { text: "TARGET LOST", sub: this.place.lost.banner, color: BLOOD, age: 0 }
      : { text: "OUT OF ROUNDS", sub: "", color: BLOOD, age: 0 };
  }

  /** the rifle, as the bullet's camera sees it: drawn for each place (on its bipod or held), its muzzle at its origin, looking down −z */
  private drawRifle(bipod: boolean): void {
    const B = this.rifleLines, steel = V.blue, hot = mix(V.blue, V.white, 0.4);
    const hoop = (z: number, r: number, y: number, color: string, width: number, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        B.seg(Math.cos(a0) * r, y + Math.sin(a0) * r, z, Math.cos(a1) * r, y + Math.sin(a1) * r, z, color, width);
      }
    };
    const tube = (z0: number, z1: number, r: number, y: number, color: string, width: number, n = 4) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        B.seg(Math.cos(a) * r, y + Math.sin(a) * r, z0, Math.cos(a) * r, y + Math.sin(a) * r, z1, color, width);
      }
    };
    B.begin();
    // the suppressor, the barrel, the receiver
    for (const z of [0, 0.08, 0.16, 0.24]) hoop(z, 0.022, 0, hot, 1.3);
    tube(0, 0.24, 0.022, 0, hot, 1.05, 6);
    hoop(0, 0.008, 0, V.white, 1.05, 6);
    tube(0.24, 0.9, 0.011, 0, steel, 1.05);
    for (const z of [0.5, 0.9]) hoop(z, 0.011, 0, steel, 0.85, 6);
    for (const x of [-0.026, 0.026]) for (const y of [-0.05, 0.028]) B.seg(x, y, 0.9, x, y, 1.26, steel, 1.3);
    for (const z of [0.9, 1.26]) {
      B.seg(-0.026, -0.05, z, 0.026, -0.05, z, steel, 1.3);
      B.seg(-0.026, 0.028, z, 0.026, 0.028, z, steel, 1.3);
      for (const x of [-0.026, 0.026]) B.seg(x, -0.05, z, x, 0.028, z, steel, 1.3);
    }
    // the magazine, the bolt handle, the stock
    for (const x of [-0.016, 0.016]) for (const z of [1.0, 1.1]) B.seg(x, -0.05, z, x, -0.14, z + 0.02, V.amber, 1.05);
    B.seg(-0.016, -0.14, 1.02, 0.016, -0.14, 1.02, V.amber, 1.05);
    B.seg(-0.016, -0.14, 1.12, 0.016, -0.14, 1.12, V.amber, 1.05);
    B.seg(0.026, 0, 1.2, 0.07, -0.03, 1.22, hot, 1.6);
    for (const x of [-0.02, 0.02]) {
      B.seg(x, 0.02, 1.26, x, 0.03, 1.66, steel, 1.05);
      B.seg(x, -0.05, 1.26, x, -0.11, 1.66, steel, 1.05);
      B.seg(x, 0.03, 1.66, x, -0.11, 1.66, steel, 1.3);
    }
    B.seg(-0.02, 0.03, 1.66, 0.02, 0.03, 1.66, steel, 1.3);
    B.seg(-0.02, -0.11, 1.66, 0.02, -0.11, 1.66, steel, 1.3);
    // the scope over it, and the bipod under
    tube(0.86, 1.2, 0.019, 0.078, hot, 1.05, 6);
    for (const z of [0.86, 1.2]) hoop(z, 0.019, 0.078, hot, 1.05, 8);
    for (const [z0, z1] of [[0.74, 0.86], [1.2, 1.3]]) {
      tube(z0, z1, 0.03, 0.078, hot, 1.05, 6);
      hoop(z0, 0.03, 0.078, hot, 1.3);
      hoop(z1, 0.03, 0.078, hot, 1.3);
    }
    for (const z of [0.95, 1.12]) B.seg(0, 0.028, z, 0, 0.06, z, steel, 1.3);
    for (const x of bipod ? [-1, 1] : []) {
      B.seg(0, -0.012, 0.52, x * 0.13, -0.3, 0.44, steel, 1.3);
      B.seg(x * 0.13, -0.3, 0.44, x * 0.16, -0.3, 0.44, steel, 1.6);
    }
    B.end();
  }

  // ------------------------------------------------------------------ the view
  private placeCamera(): void {
    const cam = this.camera, sh = this.shot;
    if (this.intro) this.introCamera();
    else if (!sh) {
      // through the scope: the aim, and on it the breath's drift, the pulse and the last shot's kick
      const t = this.clock, A = this.still ? 0 : 0.0011 * (1 + 0.12 * Math.max(0, this.contract - 1)) * this.breath.k * this.place.rough;
      const sx = A * (Math.sin(0.83 * t) + 0.5 * Math.sin(2.1 * t + 1) + 0.25 * Math.sin(4.7 * t));
      const sy = A * (Math.cos(0.61 * t) + 0.5 * Math.sin(1.7 * t + 2) + 0.25 * Math.cos(5.3 * t)) + (this.still ? 0 : 0.00028 * this.pulse);
      cam.fov = this.fov;
      cam.position.copy(this.place.eye(this.eye));
      cam.rotation.set(this.aim.pitch + sy + 0.014 * this.recoil * (this.fov / 5) + (this.still ? 0 : this.place.tilt()), this.aim.yaw + sx, 0, "YXZ");
    } else {
      cam.fov = 52;
      const jolt = this.shake * this.shake * 0.02;
      if (!sh.landed) {
        // waiting beside the muzzle as the bullet comes out and past, then after it over the street,
        // then round to its side for the last metres
        const t = sh.t;
        const back = t < T2 ? Math.min(0.9, sh.s - S0 - 1.3) : keyed(t, [[T2, 0.9], [T3, 0.12]]), side = keyed(t, [[0.35, 0.46], [T1, 0.22], [T2, 0.22], [T3, 1.0]]);
        const lift = keyed(t, [[0, 0.1], [T2, 0.08], [T3, 0.16]]), lead = t < T2 ? 6 * smooth((back - 0.15) / 0.75) : keyed(t, [[T2, 6], [T2 + 0.55, 0.9], [T3, 0.3]]);
        cam.position.copy(sh.o).addScaledVector(sh.d, sh.s - back).addScaledVector(sh.right, side).addScaledVector(sh.up, lift);
        const look = this.tmp.copy(sh.o).addScaledVector(sh.d, sh.s + lead);
        if (sh.hit) {
          // closing on someone: the view settles on the part of them the bullet will go through, and moves in while it does
          const mid = (sh.hit.t + sh.hit.out) / 2, settle = smooth((1.4 - (sh.L - sh.s)) / 1.4), near = sh.hit.head ? 0.5 : 0.72;
          const dist = 1 - (1 - near) * (sh.inside ? smooth(sh.into / sh.thru) : 0);
          cam.position.lerp(this.tmp2.copy(sh.o).addScaledVector(sh.d, mid - 0.08).addScaledVector(sh.right, dist).addScaledVector(sh.up, 0.12), settle);
          look.lerp(this.tmp2.copy(sh.o).addScaledVector(sh.d, mid), settle);
        }
        cam.lookAt(look);
      } else {
        // it has landed: draw back and up a little, and watch what it did (farther back from someone, to keep
        // in the picture what flies off them)
        const p = sh.hit?.person, u = smooth(sh.after / (p ? 1.6 : 2.2)), far = p ? 1.9 : 1;
        cam.position.copy(sh.camAt).addScaledVector(sh.right, 0.55 * far * u).addScaledVector(sh.up, 0.3 * far * u).addScaledVector(sh.d, -0.5 * far * u);
        if (p) this.tmp.copy(p.neck).lerp(p.pelvis, 0.3).lerp(sh.lookAt, 1 - u);
        else this.tmp.copy(sh.lookAt);
        cam.lookAt(this.tmp);
      }
      cam.rotateX((Math.random() - 0.5) * jolt);
      cam.rotateY((Math.random() - 0.5) * jolt);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  private draw(world: number): void {
    this.placeCamera();
    const cam = this.camera, c = cam.position;
    cam.getWorldDirection(this.fwd);
    this.sound.listener(c.x, c.y, c.z, this.fwd.x, this.fwd.y, this.fwd.z);

    const B = this.live;
    B.begin();
    // (what the rifle is in fades as the view goes in at the scope)
    const outside = this.intro ? 1 - smooth((this.entering() - 0.45) / 0.3) : this.shot ? 1 : 0;
    this.cast.hideExtras();
    this.place.draw(B, outside);
    if (this.intro) this.crew(B, outside, world);
    this.cast.draw(B, cam, world);
    this.fx.draw(B, cam);
    if (this.shot) this.drawBullet(B, this.shot);
    B.end();
    this.gl.render(this.scene, cam);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.glCanvas, 0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // what each throat is saying, at its mouth
    this.cast.drawWords(ctx, cam, this.w, this.h);
    if (this.intro) this.hudIntro(ctx);
    else if (this.shot) this.hudFlight(ctx, this.shot);
    else this.hudScope(ctx);
    this.glow.apply(this.canvas, ctx, this.dpr);
  }

  /** the bullet, larger than life: a spinning wire slug, the air it parts, the rings it leaves */
  private drawBullet(B: Beams, sh: Shot): void {
    const { o, d, right: R, up: U } = sh;
    const at = (s: number, r: number, a: number): [number, number, number] => {
      const cr = Math.cos(a) * r, sr = Math.sin(a) * r;
      return [o.x + d.x * s + R.x * cr + U.x * sr, o.y + d.y * s + R.y * cr + U.y * sr, o.z + d.z * s + R.z * cr + U.z * sr];
    };
    const line = (a: [number, number, number], b: [number, number, number], color: string, width: number, alpha = 1) => B.seg(a[0], a[1], a[2], b[0], b[1], b[2], color, width, alpha);
    // the rings it has left in the air
    for (const k of this.wakes) {
      const u = k.age / 1.2, r = 0.03 + 0.2 * Math.sqrt(u), n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.7) / n) * Math.PI * 2;
        B.seg(k.x + R.x * Math.cos(a0) * r + U.x * Math.sin(a0) * r, k.y + R.y * Math.cos(a0) * r + U.y * Math.sin(a0) * r, k.z + R.z * Math.cos(a0) * r + U.z * Math.sin(a0) * r, k.x + R.x * Math.cos(a1) * r + U.x * Math.sin(a1) * r, k.y + R.y * Math.cos(a1) * r + U.y * Math.sin(a1) * r, k.z + R.z * Math.cos(a1) * r + U.z * Math.sin(a1) * r, V.blue, 0.85, 0.55 * (1 - u));
      }
    }
    // the muzzle's flash: a star of gas, gone in a moment
    const since = this.clock - this.flashAt;
    if (since < 0.3) {
      const k = 1 - since / 0.3;
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, len = (0.08 + Math.random() * 0.22) * (0.5 + k);
        line(at(S0, 0.02, a), at(S0 + 0.05 + Math.random() * 0.2, len, a), i % 2 ? V.amber : V.white, 1.6, k);
      }
    }
    if (sh.landed && sh.spent) return;
    // (larger than life over the street; nearer its true size as it closes on someone, so it fits what it goes through)
    const size = sh.hit ? 1 - 0.68 * smooth((1.4 - (sh.L - sh.s)) / 1.4) : 1;
    const len = 0.13 * size, r = 0.019 * size, s = sh.s - len * 0.62, spin = sh.s * 26, n = 8;
    // where it has been
    line(at(Math.max(S0, s - 14, sh.landed && sh.hit ? sh.hit.out : 0), 0, 0), at(s - len, 0, 0), V.amber, 0.6, 0.35);
    // the slug: a base, a shoulder, an ogive to the tip
    const rings: [number, number][] = [[-len, r * 0.86], [-len * 0.35, r], [0, r * 0.8], [len * 0.36, r * 0.42]];
    for (let i = 0; i < n; i++) {
      const a0 = spin + (i / n) * Math.PI * 2, a1 = spin + ((i + 1) / n) * Math.PI * 2;
      rings.forEach(([x, rad], k) => {
        line(at(s + x, rad, a0), at(s + x, rad, a1), k < 2 ? V.amber : V.white, k === 1 ? 1.3 : 1.05);
        if (k < rings.length - 1 && i % 2 === 0) line(at(s + x, rad, a0), at(s + rings[k + 1][0], rings[k + 1][1], a0 + 0.25), k < 1 ? V.amber : V.white, 1.05);
      });
      if (i % 2 === 0) line(at(s + len * 0.36, r * 0.42, a0), at(s + len * 0.62, 0, 0), V.white, 1.05);
    }
    // the air it parts: a cone swept back from the tip
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      line(at(s + len * 0.62, 0, 0), at(s - 0.42 * size, 0.17 * size, a), V.white, 0.6, sh.inside ? 0 : 0.3);
    }
  }

  // ------------------------------------------------------------------ the gauges
  /** the scope's glass: the dark of its tube round a circle of radius R, and in the circle the reticle (this bright) */
  private glass(ctx: CanvasRenderingContext2D, R: number, lit = 1): void {
    const { w, h } = this, cx = w / 2, cy = h / 2;
    // everything outside the scope's circle is the inside of the tube
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    ring(ctx, cx, cy, R, V.blueMid, 1.8);
    ring(ctx, cx, cy, R - 5, V.blueDim, 1, { alpha: 0.7 });
    if (lit <= 0) return;

    // the reticle: heavy posts in from the rim, fine wires to the middle, a dot every mil
    const post = 0.38 * R, gap = 0.014 * R, mil = (0.001 / ((this.fov * Math.PI) / 180)) * h;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (dy !== -1) seg(ctx, cx + dx * R, cy + dy * R, cx + dx * post, cy + dy * post, V.blue, 3, { alpha: 0.9 * lit });
      seg(ctx, cx + dx * (dy === -1 ? 0.3 * R : post), cy + dy * (dy === -1 ? 0.3 * R : post), cx + dx * gap, cy + dy * gap, V.white, 1, { alpha: 0.8 * lit });
      const step = Math.max(mil, 7);
      for (let i = 1; i * step < post * 0.95 && i <= 12; i++) dot(ctx, cx + dx * i * step, cy + dy * i * step, i % 5 === 0 ? 2 : 1.3, V.white, 0.85 * lit);
    }
    dot(ctx, cx, cy, 1.3, V.red, lit);
  }

  /**
   * While a contract opens: a film's black bars, the contract's name, then what is different here
   * and what to do about it, then who to shoot as the scope's glass closes round the view.
   */
  private hudIntro(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this, op = this.place.opening!, t = this.intro!.t, u = this.entering(), cx = w / 2, bar = h * 0.1 * (1 - u);
    if (u > 0.35) this.glass(ctx, Math.min(w, h) * 0.47 * (1 + 3.5 * (1 - smooth((u - 0.35) / 0.65))), smooth((u - 0.6) / 0.4));
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    ctx.restore();
    seg(ctx, 0, bar, w, bar, V.blueDim, 1, { alpha: 0.7 * (1 - u) });
    seg(ctx, 0, h - bar, w, h - bar, V.blueDim, 1, { alpha: 0.7 * (1 - u) });
    /** there from one time to another, coming and going over a moment */
    const shown = (from: number, to: number) => smooth((t - from) / 0.4) * (1 - smooth((t - to) / 0.5));
    const y = h - h * 0.1 - Math.max(64, h * 0.13), turn = 3.1, last = op.orbit - LEAD - 0.3;
    const a1 = shown(0.3, turn - 0.5), a2 = shown(turn, last), a3 = smooth(u / 0.25) * (1 - smooth((u - 0.75) / 0.25));
    if (a1 > 0) {
      text(ctx, `CONTRACT ${this.contract}`, cx, y, { size: 40, color: V.amber, align: "center", weight: 800, ls: 0.16, alpha: a1 });
      text(ctx, this.place.name, cx, y + 30, { size: 18, align: "center", ls: 0.3, alpha: a1 });
    }
    if (a2 > 0) {
      text(ctx, op.rule, cx, y - 6, { size: 32, align: "center", weight: 800, ls: 0.12, alpha: a2 });
      op.more.forEach((line, i) => text(ctx, line, cx, y + 22 + i * 21, { size: 15, color: V.blue, align: "center", alpha: a2 }));
    }
    if (a3 > 0 && this.target) text(ctx, `TARGET: ${TRAIT_TEXT[this.target.trait]}`, cx, y, { size: 26, color: V.amber, align: "center", weight: 800, ls: 0.12, alpha: a3 });
    if (this.clock < this.subtitle.until) text(ctx, this.subtitle.text, cx, h * 0.1 + 34, { size: 18, align: "center", alpha: Math.min(1, (this.subtitle.until - this.clock) / 0.4) });
    if (u <= 0) text(ctx, "CLICK OR SPACE TO SKIP", w - 22, h - h * 0.05 + 5, { size: 12, color: V.blue, weight: 500, align: "right" });
  }

  private hudScope(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.47;
    this.glass(ctx, R);
    if (this.phase === "menu") return;

    // left: the contract. right: the glass. below: air and rounds
    const playing = this.phase === "playing";
    // (what a thing is called is in blue, what it is in white, and who to shoot in amber)
    const cw = text(ctx, `CONTRACT ${this.contract}`, 22, 38, { size: 18, weight: 700 });
    text(ctx, this.place.name, 22 + cw + 12, 38, { size: 18, color: V.blue });
    text(ctx, "TARGET", 22, 64, { size: 12, color: V.blue, ls: 0.18 });
    if (this.target) text(ctx, TRAIT_TEXT[this.target.trait], 22, 86, { size: 18, color: V.amber, weight: 700 });
    const sw = text(ctx, "SCORE", 22, 112, { size: 12, color: V.blue, ls: 0.18 });
    text(ctx, String(this.score), 22 + sw + 10, 112, { size: 15 });
    text(ctx, `${ZOOMS[this.zoom]}X`, w - 22, 44, { size: 26, weight: 700, align: "right" });
    text(ctx, this.range > 0 ? `${this.range.toFixed(0)} M` : "--- M", w - 22, 68, { size: 16, align: "right" });
    text(ctx, `${Math.floor(this.watch / 60)}:${String(Math.floor(this.watch % 60)).padStart(2, "0")}`, w - 22, 90, { size: 16, color: V.blue, align: "right" });

    const b = this.breath, bx = 22, by = h - 30, bw = Math.min(170, w * 0.22);
    const bc = b.spent ? BLOOD : b.holding ? V.green : V.blue;
    text(ctx, b.spent ? "OUT OF BREATH" : b.holding ? "HOLDING" : "BREATH", bx, by - 18, { size: 13, color: bc, ls: 0.16 });
    seg(ctx, bx, by - 8, bx + bw, by - 8, V.frame, 3);
    if (b.air > 0.01) seg(ctx, bx, by - 8, bx + bw * b.air, by - 8, bc, 3);
    text(ctx, "SHIFT HOLDS IT", bx, by + 12, { size: 12, color: V.blue, weight: 500, alpha: 0.85 });

    const ax = w - 22, ay = h - 30;
    text(ctx, this.bolt > 0 ? "BOLT" : "ROUNDS", ax, ay - 34, { size: 13, color: this.bolt > 0 ? V.amber : V.blue, align: "right", ls: 0.16 });
    for (let i = 0; i < ROUNDS; i++) {
      // a cartridge: case and bullet
      const x = ax - 8 - i * 16, live = i < this.rounds, color = live ? V.amber : V.frame;
      seg(ctx, x - 4, ay + 4, x - 4, ay - 12, color, 1.5);
      seg(ctx, x + 4, ay + 4, x + 4, ay - 12, color, 1.5);
      seg(ctx, x - 4, ay + 4, x + 4, ay + 4, color, 1.5);
      seg(ctx, x - 4, ay - 12, x, ay - 24, live ? V.white : V.frame, 1.5);
      seg(ctx, x + 4, ay - 12, x, ay - 24, live ? V.white : V.frame, 1.5);
    }

    if (this.banner.age < 3.2) {
      const a = Math.min(1, this.banner.age / 0.3) * Math.min(1, (3.2 - this.banner.age) / 0.8);
      text(ctx, this.banner.text, cx, cy - R * 0.56, { size: 38, color: this.banner.color, align: "center", alpha: a, weight: 800, ls: 0.16 });
      if (this.banner.sub) text(ctx, this.banner.sub, cx, cy - R * 0.56 + 30, { size: 16, align: "center", alpha: a, ls: 0.1 });
    }
    if (this.clock < this.subtitle.until) text(ctx, this.subtitle.text, cx, cy + R * 0.66, { size: 18, align: "center", alpha: Math.min(1, (this.subtitle.until - this.clock) / 0.4) });
    if (playing && !this.locked) text(ctx, "CLICK FIRES AND TAKES THE MOUSE - THE ARROW KEYS AIM TOO", cx, cy + R * 0.9, { size: 12, color: V.blue, weight: 500, align: "center" });
    if (this.showStats) text(ctx, `${this.stats.ms.toFixed(1)} MS  ${this.stats.fps.toFixed(0)} FPS`, cx, 20, { size: 12, color: V.blue, weight: 500, align: "center" });

    // what the crosshair is on, for the range line (cheap: once a frame)
    if (playing) {
      const d = this.camera.getWorldDirection(this.tmp), wall = this.place.raycast(this.eye, d), body = this.cast.raycast(this.eye, d);
      this.range = body && body.t < wall.t ? body.t : wall.what === null ? 0 : wall.t;
    }
  }

  /** while the bullet flies: a film's black bars, and how far it has to go */
  private hudFlight(ctx: CanvasRenderingContext2D, sh: Shot): void {
    const { w, h } = this, bar = h * 0.1;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    ctx.restore();
    seg(ctx, 0, bar, w, bar, V.blueDim, 1, { alpha: 0.7 });
    seg(ctx, 0, h - bar, w, h - bar, V.blueDim, 1, { alpha: 0.7 });
    const y = h - bar / 2 + 5;
    text(ctx, "7.62 MM   850 M/S", 22, y, { size: 14, color: V.blue });
    const left = Math.max(0, sh.L - sh.s);
    if (sh.landed || sh.inside) text(ctx, sh.hit ? (sh.hit.head ? "HEAD" : "BODY") : sh.what === null ? "" : "MISS", w - 22, y, { size: 18, color: sh.hit ? BLOOD : V.amber, align: "right", weight: 700, ls: 0.12 });
    else if (sh.what !== null) text(ctx, `${left.toFixed(1)} M`, w - 22, y, { size: 18, color: V.amber, align: "right", weight: 700 });
    const pace = sh.inside ? 4000 : sh.landed && sh.hit ? Math.round(190 ** (1 - back(sh.after))) : sh.landed || sh.t > T2 ? 190 : sh.t > T1 ? 10 : 60;
    text(ctx, `1 / ${pace}`, w / 2, y, { size: 14, align: "center" });

    // what the bullet has met inside them: each named where it was, on a line out to clear space
    const gone = sh.landed ? smooth((sh.after - 0.7) / 0.8) : 0;
    sh.met.forEach((e, i) => {
      const v = this.cast.world(sh.hit!.person, sh.hit!.head, e.on, this.tmp).project(this.camera);
      if (v.z > 1 || gone >= 1) return;
      const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h, a = Math.min(1, e.age / 0.15) * (1 - gone);
      // a column of names up the right of the picture, in the order it met them
      const lx = w * 0.7, ly = bar + 44 + i * 30;
      const color = e.kind === "bone" ? V.white : e.kind === "organ" ? BLOOD : V.amber;
      ring(ctx, px, py, 5, color, 1.4, { alpha: a });
      seg(ctx, px + 4, py - 4, lx - 28, ly - 5, color, 1, { alpha: 0.6 * a });
      seg(ctx, lx - 28, ly - 5, lx - 8, ly - 5, color, 1, { alpha: 0.6 * a });
      text(ctx, e.kind === "exit" ? "EXIT WOUND" : e.kind === "entry" ? "ENTRY WOUND" : e.text, lx, ly, { size: 17, color, weight: 700, alpha: a, ls: 0.1 });
    });
  }

  // ------------------------------------------------------------------ for tests and tuning
  /** Run everything forward without drawing (a hidden tab gets no animation frames). */
  debugRun(seconds: number, hz = 60): void {
    for (let i = 0; i < seconds * hz; i++) this.advance(1 / hz);
  }

  /** Put the crosshair dead on someone (the target, or the i-th person): the head, or the chest. The crosshair stays put until the mouse moves. */
  debugAim(who: "target" | number = "target", head = true): Person | null {
    const p = who === "target" ? this.target : this.cast.list[who];
    if (!p) return null;
    const to = head ? p.skull : this.tmp.copy(p.neck).lerp(p.pelvis, 0.4);
    const eye = this.place.eye(this.eye), dx = to.x - eye.x, dy = to.y - eye.y, dz = to.z - eye.z;
    this.aim.yaw = Math.atan2(-dx, -dz);
    this.aim.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.recoil = 0;
    this.still = true;
    return p;
  }

  /** Point the scope by hand (radians). */
  debugLook(yaw: number, pitch: number, zoom = this.zoom): void {
    this.aim.yaw = yaw;
    this.aim.pitch = pitch;
    this.zoom = zoom;
    this.fov = 40 / ZOOMS[zoom];
    this.still = true;
  }

  get debug() {
    return { intro: this.intro, aim: this.aim, breath: this.breath, cast: this.cast, place: this.place, eye: this.eye, sound: this.sound, fx: this.fx, camera: this.camera, shot: this.shot, target: this.target, rounds: this.rounds, outcome: this.outcome };
  }
}
