/**
 * The sniper game's sound: nothing is synthesized while the game runs. Every clip is a CHIMERA
 * airway rendered ahead of time (`sounds/compose.py` writes `public/shows/sniper/`):
 * the people's talk, screams and cries when shot, the handler's lines, and a beatbox kit for the
 * rifle, the bullet and the shooter's breath. A person's clip plays from where they stand (an HRTF
 * panner), a little faster or slower each time, and its recorded telemetry is read at the playhead
 * so the head in the scope moves as the engine did for that sound.
 */
import { TeleTrack } from "../show/tele.ts";
import type { TelemetryMessage } from "../worklet/protocol.ts";
import { spell } from "./words.ts";

export type BodyName = "male" | "female";
/** what a clip is (`sounds/compose.py`): the room's talk, the camp's, a phone call, a scream, a cry when shot, a line of the handler's */
export type Kind = "chat" | "camp" | "phone" | "scream" | "shot" | "line";

export interface Clip {
  id: string;
  kind: Kind;
  body: BodyName;
  /** what it says ("wine", "getdown", or the handler's whole line) */
  say: string;
  buffer: AudioBuffer;
  track: TeleTrack | null;
  /** where the sound starts and ends in the buffer (s) */
  start: number;
  end: number;
  gain: number;
  /** when each of its syllables sounds (s into the buffer) */
  words: { t0: number; t1: number; text: string }[];
}

interface KitSound {
  buffer: AudioBuffer;
  start: number;
  end: number;
  gain: number;
}

/** a clip being heard */
export interface Playing {
  clip: Clip;
  rate: number;
  /** context time at which the clip's `start` sounds */
  t0: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode | null;
  over: boolean;
  /** which playing this is, of all there have been (two plays of one clip are different sounds) */
  serial: number;
}

interface Manifest {
  clips: { id: string; kind: Kind; body: BodyName; say: string; wav: string; tele?: string; start: number; end: number; gain: number; words?: [number, number, string][] }[];
  kit: Record<string, { wav: string; start: number; end: number; gain: number }>;
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r;
}

export class Sound {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  /** the last node before the speakers: what is heard (a recording taps it) */
  readonly output: AudioNode;
  private readonly byKind = new Map<string, Clip[]>();
  private readonly byId = new Map<string, Clip>();
  private readonly kit = new Map<string, KitSound>();
  private readonly last = new Map<string, Clip>();
  private plays = 0;
  /** clips now sounding from somewhere in the world */
  readonly voices = new Set<Playing>();

  private constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    // many throats at once must not clip
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    this.master.connect(comp).connect(this.ctx.destination);
    this.output = comp;
  }

  static async load(base: string, progress?: (done: number, of: number) => void): Promise<Sound> {
    const s = new Sound();
    const man = (await (await fetchOk(base + "manifest.json")).json()) as Manifest;
    const of = man.clips.length + Object.keys(man.kit).length;
    let done = 0;
    const tick = () => progress?.(++done, of);
    const decode = async (file: string) => s.ctx.decodeAudioData(await (await fetchOk(base + file)).arrayBuffer());
    await Promise.all([
      ...man.clips.map(async (c) => {
        const [buffer, tele] = await Promise.all([decode(c.wav), c.tele ? fetchOk(base + c.tele).then((r) => r.arrayBuffer()) : null]);
        const clip: Clip = { id: c.id, kind: c.kind, body: c.body, say: c.say, buffer, track: tele ? new TeleTrack(tele) : null, start: c.start, end: c.end, gain: c.gain, words: (c.words ?? []).map(([t0, t1, text]) => ({ t0, t1, text })) };
        const key = `${c.body}-${c.kind}`;
        if (!s.byKind.has(key)) s.byKind.set(key, []);
        s.byKind.get(key)!.push(clip);
        s.byId.set(clip.id, clip);
        tick();
      }),
      ...Object.entries(man.kit).map(async ([name, k]) => {
        s.kit.set(name, { buffer: await decode(k.wav), start: k.start, end: k.end, gain: k.gain });
        tick();
      }),
    ]);
    return s;
  }

  /** Call from a tap or click: a browser only starts audio from a user's gesture. */
  resume(): void {
    void this.ctx.resume().catch(() => {});
  }

  dispose(): void {
    for (const v of this.voices) this.end(v);
    void this.ctx.close().catch(() => {});
  }

  /** every clip of a kind, for the pre-warmed heads' bodies */
  clipsOf(body: BodyName, kind: Kind): readonly Clip[] {
    return this.byKind.get(`${body}-${kind}`) ?? [];
  }

  /** one clip, by its name in the manifest */
  clip(id: string): Clip | null {
    return this.byId.get(id) ?? null;
  }

  /** a clip of this kind for this body, never the same one twice running */
  pick(body: BodyName, kind: Kind): Clip | null {
    const key = `${body}-${kind}`;
    const all = this.byKind.get(key);
    if (!all?.length) return null;
    const prev = this.last.get(key);
    let c = all[Math.floor(Math.random() * all.length)];
    if (c === prev && all.length > 1) c = all[(all.indexOf(c) + 1 + Math.floor(Math.random() * (all.length - 1))) % all.length];
    this.last.set(key, c);
    return c;
  }

  /** where the ears are: position, the way they face and up */
  listener(px: number, py: number, pz: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /**
   * Play a clip: from a place in the world, or (pos null) inside the listener's own head. `ref` is
   * how near (m) it is at its full level; it falls away beyond that.
   */
  say(clip: Clip, pos: { x: number; y: number; z: number } | null, rate = 1, level = 1, ref = 2.5): Playing {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate;
    const gain = c.createGain();
    gain.gain.value = clip.gain * level;
    let panner: PannerNode | null = null;
    if (pos) {
      panner = c.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = ref;
      panner.rolloffFactor = 1.1;
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
      src.connect(gain).connect(panner).connect(this.master);
    } else src.connect(gain).connect(this.master);
    const t0 = c.currentTime + 0.005;
    const p: Playing = { clip, rate, t0, src, gain, panner, over: false, serial: ++this.plays };
    src.onended = () => this.end(p);
    src.start(t0, clip.start, clip.end - clip.start);
    this.voices.add(p);
    return p;
  }

  move(p: Playing, x: number, y: number, z: number): void {
    if (!p.panner || p.over) return;
    const t = this.ctx.currentTime;
    p.panner.positionX.setTargetAtTime(x, t, 0.03);
    p.panner.positionY.setTargetAtTime(y, t, 0.03);
    p.panner.positionZ.setTargetAtTime(z, t, 0.03);
  }

  /** cut a voice short (the room hushed by the trigger) */
  stop(p: Playing, fade = 0.04): void {
    if (p.over) return;
    const t = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setTargetAtTime(0, t, fade / 3);
    try {
      p.src.stop(t + fade);
    } catch {
      // already stopped
    }
    // its head stops moving now, not when the fade has run out
    this.end(p);
  }

  private end(p: Playing): void {
    if (p.over) return;
    p.over = true;
    this.voices.delete(p);
    const { src, gain, panner } = p;
    src.onended = null;
    // the nodes go once the fade (if any) has been heard
    setTimeout(() => {
      src.disconnect();
      gain.disconnect();
      panner?.disconnect();
    }, 200);
  }

  /** the clip's own time now being heard (s into its file), or −1 when it is over */
  clipTime(p: Playing): number {
    if (p.over) return -1;
    const c = this.ctx;
    const heard = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    const t = p.clip.start + Math.max(0, heard - p.t0) * p.rate;
    return t > p.clip.end ? -1 : t;
  }

  /** the engine's telemetry for what a voice is sounding now (null: silent, or no recording) */
  tele(p: Playing | null): TelemetryMessage | null {
    if (!p || !p.clip.track) return null;
    const t = this.clipTime(p);
    if (t < 0) return null;
    return p.clip.track.message(p.clip.track.indexAt(t));
  }

  /**
   * The syllable a voice is on now, as written (its vowel drawn out the longer it has been held);
   * `key` is the same for as long as it is the same syllable of the same playing.
   */
  word(p: Playing | null): { key: string; text: string } | null {
    if (!p) return null;
    const t = this.clipTime(p);
    if (t < 0) return null;
    const words = p.clip.words;
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      if (t >= w.t0) return t <= w.t1 + 0.08 ? { key: `${p.serial}:${i}`, text: spell(w.text, (t - w.t0) / p.rate) } : null;
    }
    return null;
  }

  /**
   * One beatbox sound, in the listener's head (the rifle, the bolt, the bullet). Returns its nodes, for a
   * caller that bends or fades it while it sounds.
   */
  hit(name: string, rate = 1, level = 1, delay = 0): { src: AudioBufferSourceNode; gain: GainNode } | null {
    const k = this.kit.get(name);
    if (!k) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = k.buffer;
    src.playbackRate.value = rate;
    const gain = c.createGain();
    gain.gain.value = k.gain * level;
    src.connect(gain).connect(this.master);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    src.start(c.currentTime + 0.003 + delay, k.start, k.end - k.start);
    return { src, gain };
  }
}
