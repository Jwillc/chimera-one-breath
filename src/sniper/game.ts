/**
 * ONE BREATH: a sniper game in the head's own wireframe. You look through a scope at some people
 * a long way off; the handler names one of them by the thing that tells them apart, and you have
 * three rounds. Pull the trigger and the view leaves the scope to follow the bullet, slowly, out of
 * the muzzle, across to them and into whatever the crosshair was on. If that is a person, they are
 * seen through to the bones while it goes in, through whatever lies on its way, and out; then the
 * room's time comes back, and they go down with their hat or their glass falling after them.
 *
 * Six places, one after another and then round again with more people in each: a lit condo seen
 * from the roof opposite, a rooftop pool from a higher roof, the steps of a building from the
 * street below it, a café on the far bank from a moving car, a camp in the woods from a ridge, and
 * the stage of an opera house from the back of it, where the target is one of the players and a shot
 * under the aria's high note is not heard.
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
 * breath, click or space fires, Esc or P pauses. On a touch screen a finger dragged over the view
 * aims (the crosshair goes as far over the picture as the finger does, and a little more), two
 * fingers drawn apart or together zoom, and the page's buttons do the rest (`SniperPage.tsx`).
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
import { Opera } from "./opera.ts";
import { Block } from "./block.ts";
import { Cast, TRAIT_TEXT, type Hit, type Passage, type Person } from "./people.ts";
import { CREW_HEAD, drawSeated, type Sitter } from "./crew.ts";

/**
 * Safari, and the other browsers built on its engine alone (as every browser on an iPhone is). Its
 * mouse and its drawing order are its own, and what is done about them is done for it only.
 */
export const SAFARI = typeof navigator !== "undefined" && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\/|OPR\/|Android/.test(navigator.userAgent);

export type Phase = "menu" | "playing" | "paused" | "won" | "failed";
export interface Result {
  kind: "down" | "wrong" | "gone" | "empty" | "caught";
  head: boolean;
  /** nobody heard it (fired under the singing) */
  unheard: boolean;
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
const PLACES: (() => Place)[] = [() => new Condo(), () => new Pool(), () => new Steps(), () => new Drive(), () => new Woods(), () => new Opera(), () => new Block()];

const ZOOMS = [4, 8, 16, 32];
const ROUNDS = 3;
/** a contract's opening: how slowly the room's time runs while the view goes round, how long before the round ends the view starts in at the scope, and how long that takes (s) */
const SLOW = 0.2, LEAD = 0.5, ENTER = 1.6;
/** where there is only so long at the scope: how long the arrest that ends it is watched before the card (s) */
const BUST = 7.8;
/**
 * The rifle put together in an opening: when the hands go down to the case, each part's time (s into
 * the opening), where it comes in from and where the hand that fits it is (both in the rifle's own
 * frame: its muzzle at the origin, the stock toward +z), the sound of it going on; and when it is raised.
 */
const BUILD: { reach: number; raise: number; parts: { part: string; when: number; from: [number, number, number]; hold: [number, number, number]; say: [string, number, number, number][] }[] } = {
  reach: 2.3,
  raise: 5.9,
  parts: [
    { part: "receiver", when: 2.9, from: [0, -0.4, 0.1], hold: [0, -0.02, 1.0], say: [["t", 0.9, 0.3, 0]] },
    { part: "barrel", when: 3.6, from: [0, 0, -0.45], hold: [0, -0.02, 0.6], say: [["click", 1.1, 0.4, 0.3], ["K", 1.6, 0.2, 0.34]] },
    { part: "suppressor", when: 4.3, from: [0, 0, -0.3], hold: [0, 0, 0.12], say: [["t", 1.6, 0.25, 0.2], ["t", 1.7, 0.25, 0.3], ["t", 1.8, 0.25, 0.4]] },
    { part: "scope", when: 4.9, from: [0, 0.28, 0], hold: [0, 0.1, 1.03], say: [["click", 1.6, 0.4, 0.33]] },
    { part: "magazine", when: 5.4, from: [0, -0.25, 0], hold: [0, -0.13, 1.06], say: [["K", 1.3, 0.4, 0.3], ["click", 2, 0.25, 0.34]] },
  ],
};
/** a finger on the view: how far the crosshair goes over the picture for the finger's own travel, and how much two fingers must spread or close for a step of zoom */
const FINGER = 1.25, PINCH = 1.22;
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
  /** fired under singing loud enough to hide it: nobody will know of it */
  covered: boolean;
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
  /** no wider than this: set smaller if it would be (a phone held upright is narrow) */
  max?: number;
}
/**
 * Words on the gauges: solid, with a dark edge under them so that a line of the picture behind does
 * not run into the letters. Returns how wide they came out.
 */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): number {
  let size = o.size ?? 12, ls = (o.ls ?? 0.07) * size;
  const align = o.align ?? "left";
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = o.alpha ?? 1;
  const set = () => {
    ctx.font = `${o.weight ?? 600} semi-condensed ${size.toFixed(1)}px ${FACE}`;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls.toFixed(2)}px`;
  };
  set();
  const wide = o.max ? ctx.measureText(s).width - ls : 0;
  if (o.max && wide > o.max) {
    ls *= o.max / wide;
    size *= o.max / wide;
    set();
  }
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
  /** the most canvas pixels to a CSS pixel: more than this costs a phone frames for nothing seen (a film of the game asks for more) */
  private maxDpr = 1.5;
  private clock = 0;

  private phase: Phase = "menu";
  private locked = false;
  /** played with fingers (the page says): its buttons carry the breath and the rounds, and nothing takes the mouse */
  touch = false;
  /** when a finger was last on the view: the mouse events a browser makes up after a touch are not the mouse */
  private fingered = -1e9;
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
  private pendingQuiet = false;
  /** the stage's loudness as its gauge shows it (eased, so the bar does not flicker) */
  private stage = 0;
  private outcome: { result: Result; in: number } | null = null;
  /** out of time (`Place.limit`): the arrest, seconds into it; and what the clock has already said on the way there */
  private bust: { t: number; done: Set<string> } | null = null;
  private warned = false;
  private ticked = 0;
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
  private intro: { t: number; done: Set<string> } | null = null;
  /** the rifle's lines by part (the suppressor, the barrel, the receiver, the magazine, the scope) */
  private readonly rifleParts = new Map<string, { a: number[]; color: string; width: number }[]>();
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
    return { phase: this.phase, contract: this.contract, score: this.score, locked: this.locked, result: this.result, target: this.target ? this.told().join(", ") : "", place: this.place.name, next: (this.places[next] ?? this.make(next)).name, lost: this.result?.kind === "caught" && this.place.limit ? this.place.limit.card : this.place.lost.card };
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
    if (!this.touch) this.capture();
  }

  /** how the handler described the target: one thing, or (a stranger in a crowd) each thing said of how they look */
  private told(): string[] {
    return this.cast.wanted?.lines ?? (this.target ? [TRAIT_TEXT[this.target.trait]] : []);
  }

  /** From the menu: begin at the n-th contract (for trying a place without playing up to it). */
  skipTo(n: number): void {
    if (this.phase === "menu" && n >= 1) this.contract = Math.floor(n) - 1;
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.keys.clear();
    this.letGo();
    void this.sound.ctx.suspend().catch(() => {});
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setPhase("paused");
  }

  /** The room behind a card goes silent (when the page is not the one in front). */
  private hush(): void {
    if (this.phase === "playing") return;
    try {
      void this.sound.ctx.suspend().catch(() => {});
    } catch {
      // (a context that cannot be suspended so)
    }
  }
  private frontIn = 0;

  private setPhase(p: Phase): void {
    this.phase = p;
    this.onChange(this.snapshot);
  }

  /** for finding out what a browser nobody here can drive is doing: what happened, to whoever is listening (`?diag`) */
  onNote: ((what: string) => void) | null = null;
  private noted = new Map<string, number>();
  private note(what: string, more = ""): void {
    if (!this.onNote) return;
    // (the first few of each kind, then one in fifty)
    const n = (this.noted.get(what) ?? 0) + 1;
    this.noted.set(what, n);
    if (n <= 6 || n % 50 === 0) this.onNote(`${what}${more ? ` ${more}` : ""} | n ${n} phase ${this.phase} locked ${this.locked} yaw ${this.aim.yaw.toFixed(4)}`);
  }

  private capture(): void {
    this.note("capture", `has ${typeof this.canvas.requestPointerLock}`);
    try {
      // a browser may refuse (no gesture, an embedded page): the mouse still aims over the view, and the arrow keys
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.((e: unknown) => this.note("capture refused", String(e)));
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
    const place = this.place, { n: count, strollers } = place.people(Math.floor((n - 1) / PLACES.length), this.touch);
    place.reset();
    this.target = this.cast.populate(place, count, strollers, place.crowd(Math.floor((n - 1) / PLACES.length), this.touch));
    this.rounds = ROUNDS;
    this.watch = 0;
    this.alarmed = false;
    this.pending = null;
    this.outcome = null;
    this.bust = null;
    this.warned = false;
    this.ticked = 0;
    this.result = null;
    this.shot = null;
    this.rifle.visible = false;
    this.intro = place.opening && !this.seen.has(n) ? { t: 0, done: new Set() } : null;
    this.seen.add(n);
    this.wakes = [];
    this.bolt = this.recoil = 0;
    this.still = false;
    Object.assign(this.breath, { air: 1, holding: false, spent: false, k: 1 });
    Object.assign(this.aim, place.look());
    this.zoom = 1;
    this.banner = { text: `CONTRACT ${n}`, sub: `${place.name} - TARGET: ${this.told().join(", ")}`, color: V.amber, age: 0 };
    this.subtitle.until = 0;
    // the handler: where to look, who it is, go; each line waits for the one before
    const ids = [place.intro, ...(this.cast.wanted?.ids ?? [`brief-${this.target.trait}`]), "go"];
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
    // behind another window or tab it makes no sound: a contract under way is paused (below), and the room behind a card is hushed until the window is back
    const hush = () => this.hush();
    const back = () => {
      if (this.phase !== "paused" && !document.hidden && document.hasFocus()) this.sound.resume();
    };
    on(window, "blur", hush);
    on(window, "focus", back);
    on(document, "visibilitychange", () => (document.hidden ? hush() : back()));
    // Safari has its own ways with the window's focus and the mouse (below); the others are left as they were
    if (!SAFARI) on(window, "blur", () => this.pause());
    else {
      // (not on the instant: it may take the window's focus for a moment of its own and give it straight back)
      on(window, "blur", () => {
        this.note("blur");
        setTimeout(() => !document.hasFocus() && this.pause(), 300);
      });
      on(document, "visibilitychange", () => document.hidden && this.pause());
    }
    let lockedAt = 0;
    on(document, "pointerlockchange", () => {
      const was = this.locked, now = performance.now();
      this.locked = document.pointerLockElement === this.canvas;
      this.note(`pointerlockchange ${this.locked ? "locked" : "free"}`);
      if (this.locked) lockedAt = now;
      // Esc lets go of the mouse: that is the pause key. (In Safari, a mouse given and taken straight back
      // is nobody's Esc: the game goes on, and the mouse aims over the view.)
      if (was && !this.locked && this.phase === "playing" && (!SAFARI || now - lockedAt > 1000)) this.pause();
      else this.onChange(this.snapshot);
    });
    on(document, "pointerlockerror", () => this.note("pointerlockerror"));
    const mouse = () => performance.now() - this.fingered > 800;
    const aim = (dx: number, dy: number) => {
      const k = 0.0024 * (this.fov / 40);
      this.turn(-dx * k, -dy * k);
    };
    if (!SAFARI) {
      on(this.canvas, "mousemove", (e) => {
        // captured or not: where a page may not take the mouse, moving it over the view still aims
        this.moves[0]++;
        this.moves[1] += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (this.phase !== "playing" || this.shot || this.intro || !mouse()) return;
        aim(e.movementX, e.movementY);
      });
    } else {
      // Safari rolls several of the mouse's movements into one event and gives, as how far it moved, only
      // the last of them: aiming by that, the crosshair crawled. So: with the mouse captured, the sum over
      // the movements the event was rolled from; free, how far the pointer has gone over the page.
      const seen = { x: 0, y: 0, any: false };
      on(document, "pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const parts = this.locked ? (e.getCoalescedEvents?.() ?? []) : [];
        let dx = 0, dy = 0;
        for (const part of parts) {
          dx += part.movementX;
          dy += part.movementY;
        }
        if (!this.locked) {
          dx = seen.any ? e.clientX - seen.x : 0;
          dy = seen.any ? e.clientY - seen.y : 0;
        } else if (!dx && !dy) {
          dx = e.movementX;
          dy = e.movementY;
        }
        Object.assign(seen, { x: e.clientX, y: e.clientY, any: true });
        this.moves[0]++;
        this.moves[1] += Math.abs(dx) + Math.abs(dy);
        this.moves[2] += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.moves[3] += parts.length;
        this.note("pointermove", `own ${e.movementX},${e.movementY} parts ${parts.length} used ${dx},${dy} target ${(e.target as Element | null)?.tagName}`);
        if (this.phase !== "playing" || this.shot || this.intro || !mouse()) return;
        if (!this.locked && e.target !== this.canvas) return;
        aim(dx, dy);
      });
    }
    on(this.canvas, "mousedown", (e) => {
      this.note("mousedown");
      if (this.phase !== "playing" || e.button !== 0 || !mouse()) return;
      if (!this.locked) this.capture();
      this.fire();
    });
    // fingers: one dragged over the view turns the scope, two drawn apart or together change the zoom
    // (a touch on the view never fires: that is the page's button, so that aiming cannot loose a round)
    const fingers = new Map<number, { x: number; y: number }>();
    let spread = 0;
    on(this.canvas, "pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      e.preventDefault();
      this.fingered = performance.now();
      if (this.phase !== "playing") return;
      // (during an opening, a touch anywhere gets on with it)
      if (this.intro || this.bust) return this.fire();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // some pointers cannot be captured
      }
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spread = 0;
    });
    on(this.canvas, "pointermove", (e) => {
      const f = fingers.get(e.pointerId);
      if (!f) return;
      this.fingered = performance.now();
      const dx = e.clientX - f.x, dy = e.clientY - f.y;
      f.x = e.clientX;
      f.y = e.clientY;
      if (this.phase !== "playing" || this.shot || this.intro) return;
      if (fingers.size === 1) {
        // the picture is `fov` high: this many radians to a pixel of it
        const k = (FINGER * this.fov * Math.PI) / 180 / this.h;
        this.turn(-dx * k, -dy * k);
      } else if (fingers.size === 2) {
        const [a, b] = [...fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!spread) spread = d;
        else if (d > spread * PINCH || d < spread / PINCH) {
          this.zoomBy(d > spread ? 1 : -1);
          spread = d;
        }
      }
    });
    const lift = (e: PointerEvent) => {
      if (fingers.delete(e.pointerId)) this.fingered = performance.now();
      spread = 0;
    };
    on(this.canvas, "pointerup", lift);
    on(this.canvas, "pointercancel", lift);
    // (a browser that would rather scroll, zoom or make up a mouse from a touch on the view is told not to:
    // if it took the gesture, the finger's moves would stop coming)
    for (const type of ["touchstart", "touchmove"] as const) on(this.canvas, type, (e) => e.cancelable && e.preventDefault(), { passive: false });
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

  /** the page's buttons (a touch screen): a step of zoom in or out; a breath taken and held, or let go */
  zoomStep(step: 1 | -1): void {
    if (this.phase === "playing") this.zoomBy(step);
  }
  breathe(hold: boolean): void {
    if (hold) this.hold();
    else this.letGo();
  }
  /** what those buttons show, read each frame */
  get gauges() {
    return { air: this.breath.air, holding: this.breath.holding, spent: this.breath.spent, rounds: this.rounds, of: ROUNDS, bolt: this.bolt > 0, zoom: ZOOMS[this.zoom], busy: !!this.shot || !!this.intro || !!this.outcome || !!this.bust };
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
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
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
    const t0 = performance.now();
    const world = this.advance(this.phase === "paused" ? 0 : dt);
    this.cost[0] += performance.now() - t0;
    this.draw(world);
    // (when someone is listening: where a frame's time goes, every couple of seconds)
    if (this.onNote && ++this.cost[5] >= 120) {
      const c = this.cost, n = c[5], ms = (i: number) => (c[i] / n).toFixed(1);
      this.onNote(`cost | ${this.stats.fps.toFixed(0)} fps | ms a frame: move ${ms(0)} scene ${ms(1)} copy ${ms(2)} words and gauges ${ms(3)} glow ${ms(4)} | canvas ${this.canvas.width}x${this.canvas.height} dpr ${this.dpr} | mouse: ${this.moves[0]} moves, ${this.moves[1]} px used (${this.moves[2]} by the events' own word, from ${this.moves[3]} parts) in these ${n} frames | phase ${this.phase}${this.shot ? " shot" : ""}`);
      c.fill(0);
      this.moves = [0, 0, 0, 0];
    }
  }
  private cost = [0, 0, 0, 0, 0, 0];
  private moves = [0, 0, 0, 0];

  /** Move everything on by dt of the player's time. Returns how much time passed in the room: almost none while a bullet is in the air. */
  private advance(dt: number): number {
    this.clock += dt;
    // (a page that was never in front, or lost the front without being told, is silent too: looked at twice a second)
    if (this.phase !== "playing" && (this.frontIn -= dt) <= 0) {
      this.frontIn = 0.5;
      if ((document.hidden || !document.hasFocus()) && this.sound.ctx.state === "running") this.hush();
    }
    let world = dt;
    if (this.intro) world = dt * this.opening(dt);
    else if (this.bust) this.arresting(dt);
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
    if (!this.shot && !this.intro && !this.bust && !this.outcome && !this.pending && this.phase === "playing" && (this.target?.state === "gone" || this.place.over())) this.settle("gone", false);
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
      const limit = this.place.limit;
      if (limit && !this.outcome && !this.pending) {
        // only so long here: the handler says when it is nearly gone, the last seconds tick, and then they come
        const left = limit.seconds - this.watch;
        if (left <= 15 && !this.warned) {
          this.warned = true;
          this.radio("hurry");
        }
        if (left <= 10 && left > 0 && Math.ceil(left) !== this.ticked) {
          this.ticked = Math.ceil(left);
          this.sound.hit("t", 1.9, 0.22);
        }
        if (left <= 0) return this.caught();
      }
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
    const pace = this.place.opening!.pace ?? SLOW;
    return pace + (1 - pace) * u;
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
    // on an upright screen the view is opened up, so the car is as wide in it as on one lying down
    const wide = (Math.atan(Math.tan((23 * Math.PI) / 180) * Math.min(1.9, Math.max(1, 1 / cam.aspect))) * 360) / Math.PI;
    // (the glass's own narrow view arrives late, so that the way in is seen)
    cam.fov = wide * (this.fov / wide) ** (u * u);
  }

  /** during the opening: the rifle where it is held, whoever holds it, and the head of whoever else is with them */
  private crew(B: Beams, alpha: number, dt: number): void {
    if (this.place.opening?.assemble) return this.assembly(B, alpha, dt);
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

  /**
   * An opening in which the rifle is not there at first: whoever will hold it sits as one of the
   * crowd, hands on their knees; then reaches down to a case at their feet, and puts the rifle
   * together across their knees, part by part (each goes on with a sound of its own); then brings
   * it up to the shoulder and leans in to the scope.
   */
  private assembly(B: Beams, alpha: number, dt: number): void {
    const it = this.intro!, t = it.t, eye = this.eye, K = CREW_HEAD, snd = this.sound, low = !!this.place.opening!.stealth;
    const q = new THREE.Quaternion().setFromEuler(this.tmpE.set(this.aim.pitch, this.aim.yaw, 0, "YXZ"));
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const fwd = new THREE.Vector3(d.x, 0, d.z).normalize(), across = new THREE.Vector3(right.x, 0, right.z).normalize();
    const P = (base: THREE.Vector3, f: number, r: number, u: number) => base.clone().addScaledVector(fwd, f).addScaledVector(across, r).setY(base.y + u);
    this.rifle.visible = false;
    // where they end up (the eye at the scope) says where they sit; before that they sit up straight
    const leant = eye.clone().addScaledVector(d, -0.36 - 9.6 * K).addScaledVector(up, 0.078 - 15.2 * K).addScaledVector(right, -3.3 * K);
    const raise = smooth((t - BUILD.raise) / 0.9);
    let hip = P(leant, -0.14, 0, -0.5), neck = P(hip, 0.02, 0, 0.52).lerp(leant, raise), legs: Sitter["legs"], carried: THREE.Vector3 | null = null, down = 0;
    let box = P(hip, 0.45, 0, -0.5);
    if (low) {
      // keeping out of sight: in at a crouch from behind, a case in one hand; down on one knee under the wall; up on that knee only to lean the rifle over
      const creep = 1.8 * (1 - smooth(t / 1.7)), settle = smooth((t - 1.3) / 0.6);
      const kneel = P(leant, -0.2, 0, -0.5), floor = kneel.y - 0.5, squat = P(kneel, -0.15 - creep, 0, -0.2);
      const ground = (f: number, r: number, u = 0) => P(squat, f, r, 0).setY(floor + u);
      hip = squat.clone().lerp(kneel, raise);
      neck = P(squat, 0.3, 0, 0.3).lerp(leant, raise);
      const stride = (side: number) => {
        const ph = t * 7 + (side > 0 ? 0 : Math.PI);
        return { knee: P(hip, 0.36 + 0.08 * Math.sin(ph), side * 0.12, 0.1), foot: ground(0.14 + 0.2 * Math.sin(ph), side * 0.12, 0.07 * Math.max(0, Math.cos(ph))) };
      };
      const R = stride(1), L = stride(-1), footL = ground(0.38 + 0.2 * raise, -0.14);
      legs = { kneeR: R.knee.lerp(ground(0.33, 0.1, 0.03), settle), footR: R.foot.lerp(ground(-0.09, 0.1, 0.03), settle), kneeL: L.knee.lerp(P(footL, 0.02, 0, 0.45), settle), footL: L.foot.lerp(footL, settle) };
      // the case: carried at arm's length, then set down by the knee
      down = smooth((t - 1.5) / 0.5);
      carried = P(hip, 0.12, 0.3, -0.02);
      box = P(carried, 0, 0, -0.12).lerp(ground(0.42, 0.36, 0.1), down);
    }
    // the rifle: across the knees while it is put together, pointing off to their left; then up to where it is aimed
    const qLap = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), across.clone().multiplyScalar(-0.9).addScaledVector(fwd, 0.4).setY(-0.08).normalize());
    const lap = P(hip, 0.3, 0, 0.2).sub(new THREE.Vector3(0, 0, 1.1).applyQuaternion(qLap));
    const M = new THREE.Matrix4().compose(lap.lerp(eye.clone().addScaledVector(d, S0), raise), qLap.slerp(q, raise), new THREE.Vector3(1, 1, 1));
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    let busy: THREE.Vector3 | null = null;
    for (const { part, when, from, hold, say } of BUILD.parts) {
      if (t < when) continue;
      if (!it.done.has(part)) {
        it.done.add(part);
        for (const [name, rate, level, delay] of say) snd.hit(name, rate, level, delay);
      }
      // each part comes in from where it was held, and is there
      const k = 1 - smooth((t - when) / 0.4), ox = from[0] * k, oy = from[1] * k, oz = from[2] * k, a = alpha * Math.min(1, (t - when) / 0.2);
      for (const l of this.rifleParts.get(part) ?? []) {
        const p0 = at(l.a[0] + ox, l.a[1] + oy, l.a[2] + oz), p1 = at(l.a[3] + ox, l.a[4] + oy, l.a[5] + oz);
        B.seg(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, l.color, l.width, a);
      }
      if (t < when + 0.5) busy = at(hold[0] + ox, hold[1] + oy, hold[2] + oz);
    }
    // the hands: on the knees; down to the case and up with the first of it; then one at the grip, the other at whatever is going on (or under the barrel)
    const first = BUILD.parts[0].when, has = t >= first, reach = smooth((t - BUILD.reach) / 0.35) * (1 - smooth((t - first) / 0.3));
    const handR = has ? at(0.03, -0.07, 1.15) : (carried ? carried.clone().lerp(P(hip, 0.3, 0.12, 0.14), down) : P(hip, 0.38, 0.1, 0.1)).lerp(box, reach);
    const handL = busy ?? (has ? at(0, -0.035, 0.72) : P(hip, low ? 0.3 : 0.38, low ? -0.14 : -0.1, low ? 0.14 : 0.1).lerp(box, reach));
    if (low && t <= BUILD.reach) {
      // the case, shut: in the hand, then on the roof
      const c = [P(box, -0.14, -0.3, -0.06), P(box, -0.14, 0.3, -0.06), P(box, 0.14, 0.3, -0.06), P(box, 0.14, -0.3, -0.06)], a = alpha * 0.9;
      c.forEach((p0, i) => {
        const p1 = c[(i + 1) % 4];
        B.seg(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, V.blueMid, 1.05, a);
        B.seg(p0.x, p0.y - 0.1, p0.z, p1.x, p1.y - 0.1, p1.z, V.blueMid, 0.85, a);
        B.seg(p0.x, p0.y, p0.z, p0.x, p0.y - 0.1, p0.z, V.blueMid, 0.85, a);
      });
      if (down >= 1 && !it.done.has("set")) {
        it.done.add("set");
        snd.hit("B", 1.4, 0.12);
      }
    }
    if (t > BUILD.reach) {
      // the case it came in, open at their feet
      const a = alpha * (low ? 1 : smooth((t - BUILD.reach) / 0.3)) * 0.9, c = [P(box, -0.14, -0.3, -0.06), P(box, -0.14, 0.3, -0.06), P(box, 0.14, 0.3, -0.06), P(box, 0.14, -0.3, -0.06)];
      c.forEach((p0, i) => {
        const p1 = c[(i + 1) % 4];
        B.seg(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, V.blueMid, 1.05, a);
        B.seg(p0.x, p0.y, p0.z, p0.x, p0.y - 0.1, p0.z, V.blueMid, 0.85, a);
      });
      for (const i of [0, 1]) B.seg(c[i].x, c[i].y, c[i].z, c[i].x - fwd.x * 0.2, c[i].y + 0.22, c[i].z - fwd.z * 0.2, V.blueMid, 0.85, a);
      if (!it.done.has("case")) {
        it.done.add("case");
        snd.hit("click", 0.8, 0.3);
        snd.hit("click", 0.95, 0.25, 0.12);
      }
    }
    drawSeated(B, { hip, neck, fwd, right: across, twist: 0.1 * raise, handR, handL, legs }, mix(V.blue, V.white, 0.55), alpha);
    if (alpha <= 0.5) return;
    // the head: to the stage (or, keeping low, over one shoulder and the other); down at the hands while they work; then in to the scope
    const bowed = smooth((t - BUILD.reach) / 0.4) * (1 - raise), about = low ? 1.0 * Math.sin(t * 2.7) * (1 - smooth((t - 1.9) / 0.4)) : 0;
    const headQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, up, right)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), about)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.55 * bowed));
    this.cast.extra(0, neck, headQ, this.camera.position, dt, K);
  }

  // ------------------------------------------------------------------ out of time
  /** The time at the scope is up (`Place.limit`): the view goes outside, to watch them come. */
  private caught(): void {
    const limit = this.place.limit!;
    this.letGo();
    this.keys.clear();
    this.bust = { t: 0, done: new Set() };
    this.queue = [];
    this.subtitle.until = 0;
    this.banner = { text: "OUT OF TIME", sub: limit.banner, color: BLOOD, age: 0 };
  }

  /** the arrest's time: at its end, the card */
  private arresting(dt: number): void {
    const b = this.bust!;
    if (this.phase !== "playing") return;
    b.t += dt;
    if (b.t < BUST) return;
    this.result = { kind: "caught", head: false, unheard: false, seconds: this.watch, points: 0 };
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setPhase("failed");
  }

  /** the view of the arrest: from out over the street, looking back at the roof's edge, the door behind whoever is at it; drawing in */
  private bustCamera(): void {
    const cam = this.camera, eye = this.place.eye(this.eye), k = smooth(this.bust!.t / BUST);
    cam.position.set(eye.x - 2.6 - 0.6 * k, eye.y + 1.35 - 0.35 * k, eye.z - 3.3 + 0.9 * k);
    cam.lookAt(this.tmp.set(eye.x + 0.7 - 0.6 * k, eye.y - 0.2 - 0.15 * k, eye.z + 1.6 - 0.7 * k));
    cam.fov = (Math.atan(Math.tan((23 * Math.PI) / 180) * Math.min(1.9, Math.max(1, 1 / cam.aspect))) * 360) / Math.PI;
  }

  /**
   * The arrest: whoever has the rifle is at the edge, on one knee, as the opening left them. A
   * door bangs open behind; two officers come out of it at a run, one with a light; the head at
   * the scope comes round; the hands go up; one officer covers while the other closes, takes the
   * wrists behind the back and bends their prisoner over the wall.
   */
  private arrest(B: Beams, dt: number): void {
    const b = this.bust!, T = b.t, eye = this.place.eye(this.eye), K = CREW_HEAD, snd = this.sound, cam = this.camera.position, UP = new THREE.Vector3(0, 1, 0);
    /** once, when its time comes */
    const once = (key: string, at: number, f: () => void) => {
      if (T < at || b.done.has(key)) return;
      b.done.add(key);
      f();
    };
    const shout = (id: string, from: THREE.Vector3, rate: number) => {
      const clip = snd.clip(id);
      if (!clip) return;
      snd.say(clip, from, rate, 1.3, 4);
      this.subtitle = { text: clip.say.toUpperCase(), until: this.clock + (clip.end - clip.start) / rate + 0.7 };
    };
    // the rifle where it was left, over the edge; whoever knelt behind it (not wherever the scope was last pointing: straight out)
    const q = new THREE.Quaternion().setFromEuler(this.tmpE.set(-0.32, 0, 0, "YXZ")), fwd = new THREE.Vector3(0, 0, -1), across = new THREE.Vector3(1, 0, 0);
    const d = fwd.clone().applyQuaternion(q), up = UP.clone().applyQuaternion(q);
    const P = (base: THREE.Vector3, f: number, r: number, u: number) => base.clone().addScaledVector(fwd, f).addScaledVector(across, r).setY(base.y + u);
    this.rifle.visible = true;
    this.rifle.position.copy(eye).addScaledVector(d, S0);
    this.rifle.quaternion.copy(q);
    const leant = eye.clone().addScaledVector(d, -0.36 - 9.6 * K).addScaledVector(up, 0.078 - 15.2 * K).addScaledVector(across, -3.3 * K);
    const hip = P(leant, -0.2, 0, -0.5), floor = hip.y - 0.5, ground = (f: number, r: number, u = 0) => P(hip, f, r, 0).setY(floor + u);
    // round comes the head; up go the hands, and they sit back from the scope; behind the back; over the wall
    const turn = smooth((T - 0.5) / 0.3) * (1 - smooth((T - 4.5) / 0.6)), rise = smooth((T - 2.1) / 0.6), held = smooth((T - 4.5) / 0.6), bent = smooth((T - 5.6) / 0.7);
    const neck = leant.clone().lerp(P(hip, 0.02, 0, 0.55), rise).lerp(P(hip, 0.4, 0, 0.36), bent);
    const backR = P(hip, -0.2, 0.07, 0.16 + 0.1 * bent), backL = P(hip, -0.2, -0.07, 0.16 + 0.1 * bent);
    const handR = eye.clone().addScaledVector(d, -0.15).addScaledVector(up, -0.08).lerp(P(neck, 0.02, 0.3, 0.32), rise).lerp(backR, held);
    const handL = eye.clone().addScaledVector(d, 0.3).addScaledVector(up, -0.035).lerp(P(neck, 0.02, -0.3, 0.32), rise).lerp(backL, held);
    const footL = ground(0.43, -0.14), legs = { kneeR: ground(0.18, 0.1, 0.03), footR: ground(-0.24, 0.1, 0.03), kneeL: P(footL, 0.02, 0, 0.45), footL };
    drawSeated(B, { hip, neck, fwd, right: across, twist: 0.1 * (1 - rise), handR, handL, legs }, mix(V.blue, V.white, 0.55), 1);
    const qHead = new THREE.Quaternion().setFromEuler(this.tmpE.set(-0.32 * (1 - rise), 0, 0, "YXZ"));
    const headQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd.clone().applyQuaternion(qHead), UP.clone().applyQuaternion(qHead), across))
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, -1.9 * turn)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.6 * bent));
    this.cast.extra(0, neck, headQ, cam, dt, K);

    // the door: thrown open, and the lights of the cars below coming up the stairs behind them
    const limit = this.place.limit!, door = new THREE.Vector3(limit.door[0], floor, limit.door[1]), flash = Math.floor(T * 7) % 2 ? V.red : V.blue;
    for (const x of [-0.5, -0.17, 0.17, 0.5]) B.seg(door.x + x, floor + 0.1, door.z + 0.12, door.x + x, floor + 1.95, door.z + 0.12, flash, 1.6, 0.85);
    for (const x of [-0.5, 0.5]) B.seg(door.x + x, floor, door.z, door.x + x * 3.4, floor + 0.01, door.z - 3, flash, 0.85, 0.4);
    B.seg(door.x - 0.5, floor + 2, door.z + 0.05, door.x + 0.5, floor + 2, door.z + 0.05, V.white, 2.1, 0.95);
    once("door", 0.05, () => {
      snd.hit("B", 0.7, 0.55);
      snd.hit("K", 0.8, 0.4, 0.06);
    });
    once("radio", 0.25, () => this.radio("caught"));
    for (let n = 0; n < 9; n++) once(`step${n}`, 0.45 + n * 0.26, () => snd.hit("Pf", 0.75 + 0.1 * (n % 2), 0.1));

    /** an officer: where they stand at each time (out of sight before the first), and what their hands are doing */
    const officer = (i: number, stops: [number, THREE.Vector3][], light: boolean, grabs: boolean): THREE.Vector3 | null => {
      if (T < stops[0][0]) return null;
      const where = (t: number) => {
        let k = 0;
        while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
        const [t0, a] = stops[k], [t1, c] = stops[k + 1];
        return a.clone().lerp(c, smooth((t - t0) / (t1 - t0)));
      };
      const pos = where(T), speed = pos.distanceTo(where(T - 0.05)) / 0.05, go = Math.min(1, speed / 2.5);
      // (they face whoever they have come for, all the way)
      const f = this.tmp.set(hip.x - pos.x, 0, hip.z - pos.z).normalize().clone(), r = new THREE.Vector3(-f.z, 0, f.x);
      const at = (base: THREE.Vector3, ff: number, rr: number, uu: number) => base.clone().addScaledVector(f, ff).addScaledVector(r, rr).addScaledVector(UP, uu);
      const ph = T * 9.5 + i, h = at(pos, 0, 0, 0.92 + 0.03 * go * Math.abs(Math.sin(ph))), n = at(h, 0.14 * go + 0.04, 0, 0.56);
      const leg = (side: number) => {
        const a = ph + (side > 0 ? 0 : Math.PI);
        const foot = at(pos, 0.32 * go * Math.sin(a) + side * 0.1 * (1 - go), side * 0.12, 0.1 * go * Math.max(0, Math.cos(a)));
        return { knee: at(h, 0, side * 0.1, 0).lerp(foot, 0.5).addScaledVector(f, 0.1 + 0.08 * go), foot };
      };
      const R = leg(1), L = leg(-1), aim = 1 - go, take = grabs ? held : 0;
      // the pistol: low while they run, up and out at arm's length when they stop; (the one who closes puts it away and takes the wrists)
      const gun = at(h, 0.3, 0.1, 0.2).lerp(at(n, 0.56, 0.06, -0.06), aim);
      const hR = gun.clone().lerp(backR, take), hL = (light ? at(n, 0.42, -0.24, 0.02) : at(gun, -0.02, -0.08, -0.03)).lerp(light ? at(n, 0.42, -0.24, 0.02) : backL, take);
      const cloth = V.blue;
      drawSeated(B, { hip: h, neck: n, fwd: f, right: r, twist: 0, handR: hR, handL: hL, legs: { kneeR: R.knee, footR: R.foot, kneeL: L.knee, footL: L.foot } }, cloth, 1);
      if (take < 0.5) {
        const tip = at(gun, 0.19, 0, 0.02);
        B.seg(gun.x, gun.y + 0.02, gun.z, tip.x, tip.y, tip.z, V.white, 2.1, 1 - take);
        B.seg(gun.x, gun.y + 0.02, gun.z, gun.x, gun.y - 0.08, gun.z, V.white, 1.6, 1 - take);
      }
      if (light) {
        // the light: a cone from the hand to their prisoner's back
        const to = hip.clone().lerp(neck, 0.5);
        for (const [dx, dy] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) B.seg(hL.x, hL.y, hL.z, to.x + r.x * dx, to.y + dy, to.z + r.z * dx, V.white, 0.6, 0.3);
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
          B.seg(to.x + r.x * Math.cos(a0) * 0.22, to.y + Math.sin(a0) * 0.22, to.z + r.z * Math.cos(a0) * 0.22, to.x + r.x * Math.cos(a1) * 0.22, to.y + Math.sin(a1) * 0.22, to.z + r.z * Math.cos(a1) * 0.22, V.white, 0.85, 0.45);
        }
      }
      // the cap: a band, a wider crown, the peak out over the eyes, a badge
      const c = at(n, -0.01, 0, 0), ring = (y: number, rf: number, rs: number) => Array.from({ length: 10 }, (_, k) => at(c, Math.cos((k / 10) * Math.PI * 2) * rf, Math.sin((k / 10) * Math.PI * 2) * rs, y));
      const band = ring(0.255, 0.125, 0.11), crown = ring(0.32, 0.15, 0.135);
      for (let k = 0; k < 10; k++) {
        const j = (k + 1) % 10;
        B.seg(band[k].x, band[k].y, band[k].z, band[j].x, band[j].y, band[j].z, V.white, 1.3, 1);
        B.seg(crown[k].x, crown[k].y, crown[k].z, crown[j].x, crown[j].y, crown[j].z, V.white, 1.05, 1);
        if (k % 2 === 0) B.seg(band[k].x, band[k].y, band[k].z, crown[k].x, crown[k].y, crown[k].z, V.white, 0.85, 0.9);
      }
      const peak = [-1, -0.5, 0, 0.5, 1].map((s) => at(c, 0.125 + 0.09 * (1 - s * s * 0.8), s * 0.105, 0.245));
      for (let k = 0; k < 4; k++) B.seg(peak[k].x, peak[k].y, peak[k].z, peak[k + 1].x, peak[k + 1].y, peak[k + 1].z, V.white, 1.3, 1);
      const badge = at(c, 0.14, 0, 0.29);
      B.seg(badge.x, badge.y - 0.02, badge.z, badge.x, badge.y + 0.02, badge.z, V.amber, 2.6, 1);
      this.cast.extra(i, n, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, UP, r)), cam, dt, K);
      return n;
    };
    const first = officer(1, [[0.35, door], [2.0, ground(-1.9, 1.4)], [3.7, ground(-1.9, 1.4)], [4.5, ground(-0.62, 0.14)], [99, ground(-0.62, 0.14)]], false, true);
    const second = officer(2, [[0.85, door], [2.9, ground(-1.9, -0.75)], [99, ground(-1.9, -0.75)]], true, false);
    if (first) once("hands", 1.25, () => shout("cop-hands", first, 1));
    if (second) once("still", 3.3, () => shout("cop-still", second, 0.92));
    if (first) once("arrest", 5.3, () => shout("cop-arrest", first, 1));
    once("cuffs", 6.5, () => {
      snd.hit("click", 1.7, 0.4);
      snd.hit("click", 2.0, 0.35, 0.22);
    });
  }

  // ------------------------------------------------------------------ the shot
  /** Pull the trigger: the bullet goes where the crosshair is at this instant. (During an opening: get on with it.) */
  fire(): void {
    if (this.phase !== "playing" || this.shot || this.outcome || this.pending) return;
    if (this.bust) {
      // (once it has been seen what is happening: get on with it)
      if (this.bust.t > 1.5) this.bust.t = Math.max(this.bust.t, BUST - 0.02);
      return;
    }
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
    // where there is singing, a shot under its loudest is nobody's business
    const loud = this.cast.loud(), covered = this.place.drown !== null && loud !== null && loud >= this.place.drown;
    this.cast.hush();
    this.shot = { o, d, right, up, L, hit, what: hit ? "person" : wall.what, heard: !!hit || wall.heard, covered, glass: glass && glass.t < L ? glass : null, broke: false, t: 0, s: S0, wake: S0, inside: false, into: 0, thru: 1, ahead: [], met: [], landed: false, after: 0, far: wall.t, spent: !hit, beat: 0.5, hiss, pyew, camAt: new THREE.Vector3(), lookAt: new THREE.Vector3() };
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
    if (this.alarmed || this.shot?.covered) return;
    this.alarmed = true;
    this.cast.alarm();
    this.place.alarm();
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
      // (if it is the singer who is hit, the song stops: there is no hiding that)
      if (p.sings) sh.covered = false;
      this.cast.shoot(p, at, sh.d, sh.hit.head, 0.62);
      this.raise();
      this.pending = p === this.target ? "down" : "wrong";
      this.pendingHead = sh.hit.head;
      this.pendingQuiet = sh.covered;
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
      this.settle(this.pending, this.pendingHead, this.pendingQuiet);
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
  private settle(kind: Result["kind"], head: boolean, unheard = false): void {
    const seconds = this.watch;
    const points = kind === "down" ? 1000 + (head ? 500 : 0) + (unheard ? 500 : 0) + Math.max(0, Math.round(500 - 8 * seconds)) + 250 * this.rounds : 0;
    this.outcome = { result: { kind, head, unheard, seconds, points }, in: 3.4 };
    const pick = (ids: string[]) => ids[Math.floor(Math.random() * ids.length)];
    const id = kind === "down" ? pick(["win-1", "win-2", "win-3"]) : kind === "wrong" ? pick(["wrong-1", "wrong-2"]) : kind;
    this.queue = [{ at: this.clock + 0.7, id }];
    this.banner =
      kind === "down" ? { text: "TARGET DOWN", sub: [head ? "HEAD SHOT" : "", unheard ? "UNHEARD" : ""].filter(Boolean).join(" - "), color: V.green, age: 0 }
      : kind === "wrong" ? { text: "WRONG TARGET", sub: "", color: BLOOD, age: 0 }
      : kind === "gone" ? { text: "TARGET LOST", sub: this.place.lost.banner, color: BLOOD, age: 0 }
      : { text: "OUT OF ROUNDS", sub: "", color: BLOOD, age: 0 };
  }

  /** the rifle, as the bullet's camera sees it: drawn for each place (on its bipod or held), its muzzle at its origin, looking down −z */
  private drawRifle(bipod: boolean): void {
    const B = this.rifleLines, steel = V.blue, hot = mix(V.blue, V.white, 0.4), parts = this.rifleParts;
    parts.clear();
    // (each line is kept under the part it belongs to, for the opening in which the rifle is put together)
    let part = "";
    const put = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, width: number) => {
      B.seg(x0, y0, z0, x1, y1, z1, color, width);
      if (!parts.has(part)) parts.set(part, []);
      parts.get(part)!.push({ a: [x0, y0, z0, x1, y1, z1], color, width });
    };
    const hoop = (z: number, r: number, y: number, color: string, width: number, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        put(Math.cos(a0) * r, y + Math.sin(a0) * r, z, Math.cos(a1) * r, y + Math.sin(a1) * r, z, color, width);
      }
    };
    const tube = (z0: number, z1: number, r: number, y: number, color: string, width: number, n = 4) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        put(Math.cos(a) * r, y + Math.sin(a) * r, z0, Math.cos(a) * r, y + Math.sin(a) * r, z1, color, width);
      }
    };
    B.begin();
    part = "suppressor";
    for (const z of [0, 0.08, 0.16, 0.24]) hoop(z, 0.022, 0, hot, 1.3);
    tube(0, 0.24, 0.022, 0, hot, 1.05, 6);
    hoop(0, 0.008, 0, V.white, 1.05, 6);
    // the barrel, and the bipod under it
    part = "barrel";
    tube(0.24, 0.9, 0.011, 0, steel, 1.05);
    for (const z of [0.5, 0.9]) hoop(z, 0.011, 0, steel, 0.85, 6);
    for (const x of bipod ? [-1, 1] : []) {
      put(0, -0.012, 0.52, x * 0.13, -0.3, 0.44, steel, 1.3);
      put(x * 0.13, -0.3, 0.44, x * 0.16, -0.3, 0.44, steel, 1.6);
    }
    // the receiver, the bolt handle, the stock, the scope's mounts
    part = "receiver";
    for (const x of [-0.026, 0.026]) for (const y of [-0.05, 0.028]) put(x, y, 0.9, x, y, 1.26, steel, 1.3);
    for (const z of [0.9, 1.26]) {
      put(-0.026, -0.05, z, 0.026, -0.05, z, steel, 1.3);
      put(-0.026, 0.028, z, 0.026, 0.028, z, steel, 1.3);
      for (const x of [-0.026, 0.026]) put(x, -0.05, z, x, 0.028, z, steel, 1.3);
    }
    put(0.026, 0, 1.2, 0.07, -0.03, 1.22, hot, 1.6);
    for (const x of [-0.02, 0.02]) {
      put(x, 0.02, 1.26, x, 0.03, 1.66, steel, 1.05);
      put(x, -0.05, 1.26, x, -0.11, 1.66, steel, 1.05);
      put(x, 0.03, 1.66, x, -0.11, 1.66, steel, 1.3);
    }
    put(-0.02, 0.03, 1.66, 0.02, 0.03, 1.66, steel, 1.3);
    put(-0.02, -0.11, 1.66, 0.02, -0.11, 1.66, steel, 1.3);
    for (const z of [0.95, 1.12]) put(0, 0.028, z, 0, 0.06, z, steel, 1.3);
    part = "magazine";
    for (const x of [-0.016, 0.016]) for (const z of [1.0, 1.1]) put(x, -0.05, z, x, -0.14, z + 0.02, V.amber, 1.05);
    put(-0.016, -0.14, 1.02, 0.016, -0.14, 1.02, V.amber, 1.05);
    put(-0.016, -0.14, 1.12, 0.016, -0.14, 1.12, V.amber, 1.05);
    part = "scope";
    tube(0.86, 1.2, 0.019, 0.078, hot, 1.05, 6);
    for (const z of [0.86, 1.2]) hoop(z, 0.019, 0.078, hot, 1.05, 8);
    for (const [z0, z1] of [[0.74, 0.86], [1.2, 1.3]]) {
      tube(z0, z1, 0.03, 0.078, hot, 1.05, 6);
      hoop(z0, 0.03, 0.078, hot, 1.3);
      hoop(z1, 0.03, 0.078, hot, 1.3);
    }
    B.end();
  }

  // ------------------------------------------------------------------ the view
  private placeCamera(): void {
    const cam = this.camera, sh = this.shot;
    if (this.intro) this.introCamera();
    else if (this.bust) this.bustCamera();
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

    const t0 = performance.now();
    const B = this.live;
    B.begin();
    // (what the rifle is in fades as the view goes in at the scope)
    const outside = this.intro ? 1 - smooth((this.entering() - 0.45) / 0.3) : this.shot || this.bust ? 1 : 0;
    this.cast.hideExtras();
    this.place.draw(B, outside);
    if (this.intro) this.crew(B, outside, world);
    else if (this.bust) this.arrest(B, world);
    this.cast.draw(B, cam, world);
    this.fx.draw(B, cam);
    if (this.shot) this.drawBullet(B, this.shot);
    B.end();
    this.gl.render(this.scene, cam);
    const t1 = performance.now();

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.glCanvas, 0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const t2 = performance.now();
    // what each throat is saying, at its mouth
    this.cast.drawWords(ctx, cam, this.w, this.h);
    if (this.intro) this.hudIntro(ctx);
    else if (this.bust) this.hudBust(ctx);
    else if (this.shot) this.hudFlight(ctx, this.shot);
    else this.hudScope(ctx);
    const t3 = performance.now();
    this.glow.apply(this.canvas, ctx, this.dpr);
    const t4 = performance.now(), cost = this.cost;
    cost[1] += t1 - t0;
    cost[2] += t2 - t1;
    cost[3] += t3 - t2;
    cost[4] += t4 - t3;
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
    // (a window with no size yet has no glass to draw)
    if (R < 6) return;
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
    const y = h - h * 0.1 - Math.max(64, h * 0.13), turn = 3.1, last = op.orbit - LEAD - 0.3, max = w - 24;
    const a1 = shown(0.3, turn - 0.5), a2 = shown(turn, last), a3 = smooth(u / 0.25) * (1 - smooth((u - 0.75) / 0.25));
    if (a1 > 0) {
      text(ctx, `CONTRACT ${this.contract}`, cx, y, { size: 40, color: V.amber, align: "center", weight: 800, ls: 0.16, alpha: a1, max });
      text(ctx, this.place.name, cx, y + 30, { size: 18, align: "center", ls: 0.3, alpha: a1 });
    }
    if (a2 > 0) {
      text(ctx, op.rule, cx, y - 6, { size: 32, align: "center", weight: 800, ls: 0.12, alpha: a2, max });
      op.more.forEach((line, i) => text(ctx, line, cx, y + 22 + i * 21, { size: 15, color: V.blue, align: "center", alpha: a2, max }));
    }
    if (a3 > 0 && this.target) text(ctx, `TARGET: ${this.told().join(", ")}`, cx, y, { size: 26, color: V.amber, align: "center", weight: 800, ls: 0.12, alpha: a3, max });
    if (this.clock < this.subtitle.until) text(ctx, this.subtitle.text, cx, h * 0.1 + 34, { size: 18, align: "center", alpha: Math.min(1, (this.subtitle.until - this.clock) / 0.4), max });
    if (u <= 0) text(ctx, this.touch ? "TAP TO SKIP" : "CLICK OR SPACE TO SKIP", w - 22, h - h * 0.05 + 5, { size: 12, color: V.blue, weight: 500, align: "right" });
  }

  /**
   * Where the people are, for whoever cannot find them: a small mark just inside the scope's rim
   * toward each one who is outside its circle, gone once they are in it. Everyone is marked alike:
   * it says where to look, never who to shoot.
   */
  private whereabouts(ctx: CanvasRenderingContext2D, R: number): void {
    const { w, h } = this, cx = w / 2, cy = h / 2, cam = this.camera;
    // how many pixels of the picture to a radian off its middle
    const f = h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    for (const p of this.cast.list) {
      // (not the crowd: there may be a houseful of them, and none of them is who is being looked for)
      if (p.state === "dead" || p.state === "gone" || p.crowd) continue;
      const v = this.tmp.copy(p.neck).applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -0.5) continue;
      const sx = (v.x / -v.z) * f, sy = (-v.y / -v.z) * f, r = Math.hypot(sx, sy);
      // (it comes up as they near the rim from inside, so it is never the thing that gives them away in the glass)
      const a = 0.9 * smooth((r - 0.8 * R) / (0.25 * R));
      if (a <= 0.01) continue;
      // (red: nothing else on the rim is, so it is seen at once)
      const ux = sx / r, uy = sy / r, tx = cx + ux * (R - 9), ty = cy + uy * (R - 9), bx = tx - ux * 9, by = ty - uy * 9;
      seg(ctx, tx, ty, bx - uy * 5.5, by + ux * 5.5, V.red, 2, { alpha: a });
      seg(ctx, tx, ty, bx + uy * 5.5, by - ux * 5.5, V.red, 2, { alpha: a });
    }
  }

  /** while the arrest is watched: a film's black bars, what it is, and what is being shouted */
  private hudBust(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this, t = this.bust!.t, cx = w / 2, bar = h * 0.1, max = w - 24;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    ctx.restore();
    seg(ctx, 0, bar, w, bar, V.blueDim, 1, { alpha: 0.7 });
    seg(ctx, 0, h - bar, w, h - bar, V.blueDim, 1, { alpha: 0.7 });
    const a = smooth(t / 0.3) * (1 - smooth((t - 3.4) / 0.6)), y = h - bar - Math.max(64, h * 0.13);
    if (a > 0) {
      text(ctx, this.banner.text, cx, y, { size: 40, color: this.banner.color, align: "center", weight: 800, ls: 0.16, alpha: a, max });
      text(ctx, this.banner.sub, cx, y + 30, { size: 16, align: "center", ls: 0.14, alpha: a, max });
    }
    if (this.clock < this.subtitle.until) text(ctx, this.subtitle.text, cx, bar + 34, { size: 18, align: "center", alpha: Math.min(1, (this.subtitle.until - this.clock) / 0.4), max });
    if (t > 1.5 && this.phase === "playing") text(ctx, this.touch ? "TAP TO SKIP" : "CLICK OR SPACE TO SKIP", w - 22, h - h * 0.05 + 5, { size: 12, color: V.blue, weight: 500, align: "right" });
  }

  private hudScope(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.47;
    this.glass(ctx, R);
    if (this.phase === "menu") return;
    this.whereabouts(ctx, R);

    // left: the contract. right: the glass. below: air and rounds
    const playing = this.phase === "playing";
    // (what a thing is called is in blue, what it is in white, and who to shoot in amber)
    const cw = text(ctx, `CONTRACT ${this.contract}`, 22, 38, { size: 18, weight: 700 });
    text(ctx, this.place.name, 22 + cw + 12, 38, { size: 18, color: V.blue });
    text(ctx, "TARGET", 22, 64, { size: 12, color: V.blue, ls: 0.18 });
    // (told by how they look: a line for each thing said of them)
    const told = this.target ? this.told() : [], below = 22 * Math.max(0, told.length - 1);
    told.forEach((line, i) => text(ctx, line, 22, 86 + 22 * i, { size: 18, color: V.amber, weight: 700 }));
    const sw = text(ctx, "SCORE", 22, 112 + below, { size: 12, color: V.blue, ls: 0.18 });
    text(ctx, String(this.score), 22 + sw + 10, 112 + below, { size: 15 });
    text(ctx, `${ZOOMS[this.zoom]}X`, w - 22, 44, { size: 26, weight: 700, align: "right" });
    text(ctx, this.range > 0 ? `${this.range.toFixed(0)} M` : "--- M", w - 22, 68, { size: 16, align: "right" });
    const limit = this.place.limit, clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    if (!limit) text(ctx, clock(this.watch), w - 22, 90, { size: 16, color: V.blue, align: "right" });
    else {
      // only so long here: what is left of it, at the foot of the glass either side of the post (red, and beating, when it is nearly gone)
      const left = Math.max(0, limit.seconds - this.watch), late = left <= 10, y = cy + R * 0.82;
      text(ctx, "TIME", cx - 12, y - 2, { size: 12, color: late ? BLOOD : V.blue, align: "right", ls: 0.18 });
      text(ctx, clock(Math.ceil(left)), cx + 12, y, { size: 22, color: late ? BLOOD : V.white, weight: 700, alpha: late ? 0.65 + 0.35 * Math.cos(left * Math.PI * 2) : 1 });
    }
    // where there is singing: how loud it is now, and (the mark on the bar) how loud it has to be to hide a shot
    const need = this.place.drown;
    if (need !== null) {
      const loud = this.cast.loud() ?? 0, on = loud >= need, x1 = w - 22, x0 = x1 - 120, y0 = 126;
      this.stage += (loud - this.stage) * 0.3;
      text(ctx, on ? "COVERED" : "ARIA", x1, 114, { size: 12, color: on ? V.green : V.blue, align: "right", ls: 0.18, weight: on ? 800 : 600 });
      seg(ctx, x0, y0, x1, y0, V.frame, 4);
      if (this.stage > 0.01) seg(ctx, x0, y0, x0 + 120 * Math.min(1, this.stage), y0, on ? V.green : V.white, 4);
      seg(ctx, x0 + 120 * need, y0 - 6, x0 + 120 * need, y0 + 6, V.amber, 1.5);
    }

    // (on a touch screen the page's buttons are here, and they carry the breath and the rounds)
    const b = this.breath, bx = 22, by = h - 30, bw = Math.min(170, w * 0.22), keys = !this.touch;
    const bc = b.spent ? BLOOD : b.holding ? V.green : V.blue;
    if (keys) text(ctx, b.spent ? "OUT OF BREATH" : b.holding ? "HOLDING" : "BREATH", bx, by - 18, { size: 13, color: bc, ls: 0.16 });
    if (keys) seg(ctx, bx, by - 8, bx + bw, by - 8, V.frame, 3);
    if (keys && b.air > 0.01) seg(ctx, bx, by - 8, bx + bw * b.air, by - 8, bc, 3);
    if (keys) text(ctx, "SHIFT HOLDS IT", bx, by + 12, { size: 12, color: V.blue, weight: 500, alpha: 0.85 });

    const ax = w - 22, ay = h - 30;
    if (keys) text(ctx, this.bolt > 0 ? "BOLT" : "ROUNDS", ax, ay - 34, { size: 13, color: this.bolt > 0 ? V.amber : V.blue, align: "right", ls: 0.16 });
    for (let i = 0; keys && i < ROUNDS; i++) {
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
      text(ctx, this.banner.text, cx, cy - R * 0.56, { size: 38, color: this.banner.color, align: "center", alpha: a, weight: 800, ls: 0.16, max: 1.6 * R });
      if (this.banner.sub) text(ctx, this.banner.sub, cx, cy - R * 0.56 + 30, { size: 16, align: "center", alpha: a, ls: 0.1, max: 1.7 * R });
    }
    if (this.clock < this.subtitle.until) text(ctx, this.subtitle.text, cx, cy + R * 0.66, { size: 18, align: "center", alpha: Math.min(1, (this.subtitle.until - this.clock) / 0.4), max: 1.45 * R });
    if (playing && !this.locked && keys) text(ctx, "CLICK FIRES AND TAKES THE MOUSE - THE ARROW KEYS AIM TOO", cx, cy + R * 0.9, { size: 12, color: V.blue, weight: 500, align: "center" });
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
      text(ctx, e.kind === "exit" ? "EXIT WOUND" : e.kind === "entry" ? "ENTRY WOUND" : e.text, lx, ly, { size: 17, color, weight: 700, alpha: a, ls: 0.1, max: w - lx - 10 });
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
