/**
 * Films takes of the game for a trailer, as a phone shows it: upright, with the on-screen buttons.
 *
 * Not a screen recording. The page runs on a clock this script owns (`performance.now` and the
 * animation frames are replaced before it loads), so each step is exactly one video frame however
 * long it takes to draw and capture, and none is dropped. The game's sound runs on the same clock:
 * its AudioContext is swapped for an offline one that is rendered a frame at a time, so what is
 * written beside each take is the game's own mix (its panning, its compressor), in step with the
 * picture to the sample.
 *
 * A scripted player plays each take with fingers, through the page's real touch events: it drags
 * over the view to aim, taps the zoom, holds BREATH and taps FIRE. It reads where the people are and
 * then does only what a player can do. Each finger is shown as a ring, so the film shows the controls.
 *
 * Each take is written as <outdir>/<name>.mp4 (picture), <name>.wav (sound) and <name>.json (what
 * happened on which frames). A take is filmed again until the target is down. `cards` writes the
 * words that go over the picture and the last card (PNG).
 *
 * Usage: bun tools/trailer-film.ts <outdir> [take ...] [--url http://127.0.0.1:5337/]
 *        takes: cards hero pool steps drive woods (default: all). Needs the dev server and ffmpeg.
 */
import { chromium, type Page } from "playwright-core";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const at = args.indexOf("--url");
const url = at >= 0 ? args.splice(at, 2)[1] : "http://127.0.0.1:5337/";
const out = args.shift() ?? "out/trailer";
mkdirSync(out, { recursive: true });

/** the picture: a 9:16 phone, 405 x 720 CSS px drawn at 8/3, so 1080 x 1920 */
const W = 405, H = 720, SCALE = 8 / 3, FPS = 60;
/** the sound: its rate, and the most of it one take may need (s) */
const RATE = 48000, SOUND = 110;

interface Take {
  contract: number;
  /** a head shot, or the chest */
  head: boolean;
  /** start zoomed out and look the place over first, going to this many of the others before the target */
  wide: boolean;
  visits: number;
  /** the take is filmed only if the target is told apart by one of these, and is on their feet */
  want?: string[];
  /** seconds filmed after the eye is back at the scope */
  after: number;
}
const TAKES: Record<string, Take> = {
  hero: { contract: 1, head: true, wide: true, visits: 2, want: ["hat"], after: 1.8 },
  pool: { contract: 2, head: false, wide: false, visits: 0, after: 1.4 },
  steps: { contract: 3, head: true, wide: false, visits: 0, after: 1.4 },
  drive: { contract: 4, head: false, wide: false, visits: 0, after: 1.4 },
  woods: { contract: 5, head: true, wide: false, visits: 0, after: 1.4 },
};
const wanted = args.length ? args : ["cards", ...Object.keys(TAKES)];

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, hasTouch: true, isMobile: true });

// ---- the words over the picture and the last card: plain pages in the game's own type
if (wanted.includes("cards")) {
  const page = await context.newPage();
  // on the game's own page, so that its typefaces are the ones already loaded there
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__sniper", null, { polling: 100, timeout: 60000 });
  const card = async (name: string, html: string, clear: boolean) => {
    await page.evaluate(
      ({ html, clear }) => {
        document.documentElement.style.background = clear ? "transparent" : "#000";
        document.body.innerHTML = `<style>
        html, body { margin: 0; height: 100%; }
        body { background: ${clear ? "transparent" : "#000"}; font-family: Archivo, sans-serif; font-stretch: 87.5%; text-transform: uppercase; text-align: center; color: #eef6f8; }
        .over { position: absolute; left: 0; right: 0; top: 127px; font-size: 21px; font-weight: 800; letter-spacing: 0.18em; text-shadow: 0 0 3px #000, 0 0 3px #000, 0 0 12px rgba(0, 0, 0, 0.9); }
        .last { height: 100%; display: grid; place-content: center; justify-items: center; gap: 15px; padding: 0 18px; }
        .mark { font-family: Hershey, sans-serif; font-weight: 500; font-size: 15px; letter-spacing: 0.34em; margin-right: -0.34em; color: #4fb6f2; }
        .name { white-space: nowrap; font-stretch: 100%; font-size: 39px; font-weight: 800; letter-spacing: 0.16em; margin-right: -0.16em; line-height: 1.1; color: #ffb340; text-shadow: 0 0 20px rgba(255, 179, 64, 0.5); }
        .what { font-size: 15px; font-weight: 600; letter-spacing: 0.12em; line-height: 1.5; color: #4fb6f2; margin-bottom: 26px; }
        .play { white-space: nowrap; font-size: 17px; font-weight: 800; letter-spacing: 0.14em; }
        .where { white-space: nowrap; text-transform: none; font-size: 18.5px; font-weight: 700; letter-spacing: 0.01em; color: #0a0a0a; background: #ffb340; padding: 11px 16px; box-shadow: 0 0 16px rgba(255, 179, 64, 0.45); }
        .how { font-size: 13px; font-weight: 600; letter-spacing: 0.16em; color: #4fb6f2; }
      </style>${html}`;
      },
      { html, clear },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}.png`, omitBackground: clear });
    console.log(`wrote ${out}/${name}.png`);
  };
  await card("find", `<div class="over">Find your target</div>`, true);
  await card("zoom", `<div class="over">Zoom in</div>`, true);
  await card("breath", `<div class="over">Hold your breath</div>`, true);
  await card("places", `<div class="over">Five contracts</div>`, true);
  await card(
    "last",
    `<div class="last"><div class="mark">Chimera</div><div class="name">One Breath</div><div class="what">A sniper game where every sound<br>is a simulated voice</div><div class="play">Play it free in your browser</div><div class="where">jwillc.github.io/chimera-one-breath</div><div class="how">Phone or desktop</div></div>`,
    false,
  );
  await page.close();
}

/** One take: a fresh page (its sound starts from nothing), filmed until the take is over. Returns how it ended. */
async function film(name: string, take: Take): Promise<{ kind: string | null; frames: number; marks: Record<string, number> }> {
  const page: Page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("page error:", m.text()));
  page.on("pageerror", (e) => console.log("page error:", e.message));
  const wav = `${out}/${name}.wav`;
  writeFileSync(wav, "");
  await page.exposeFunction("__chunk", (b64: string) => appendFileSync(wav, Buffer.from(b64, "base64")));
  // the page's clock and its sound: time only moves when __step says so, and sound only as far as it is asked to
  await page.addInitScript(
    ({ RATE, SOUND }) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const Wn = window as any;
      let now = 0, next = 0;
      const waiting = new Map<number, FrameRequestCallback>();
      performance.now = () => now;
      window.requestAnimationFrame = (f) => (waiting.set(++next, f), next);
      window.cancelAnimationFrame = (i) => void waiting.delete(i);
      Wn.__step = (ms: number) => {
        now += ms;
        const run = [...waiting.values()];
        waiting.clear();
        for (const f of run) f(now);
      };
      Wn.AudioContext = function () {
        const c: any = new OfflineAudioContext(2, RATE * SOUND, RATE);
        const A = (Wn.__audio = { c, suspend: c.suspend.bind(c), resume: c.resume.bind(c), t: 0, rendering: null as Promise<AudioBuffer> | null });
        // (the game's own pausing and resuming of its sound are nothing to an offline one)
        c.suspend = () => Promise.resolve();
        c.resume = () => Promise.resolve();
        c.close = () => Promise.resolve();
        Wn.__audioStart = async () => {
          A.t = 128 / RATE;
          const there = A.suspend(A.t);
          A.rendering = c.startRendering();
          await there;
        };
        Wn.__audioStep = async (s: number) => {
          A.t += s;
          const there = A.suspend(A.t);
          A.resume();
          await there;
        };
        return c;
      };
    },
    { RATE, SOUND },
  );
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__sniper", null, { polling: 100, timeout: 60000 });

  // ---- in the page: the fingers and the player
  await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const Wn = window as any, g = Wn.__sniper;
    const canvas = document.querySelector(".fps canvas") as HTMLCanvasElement;
    // sharper than a phone needs: this is a film of it
    g["maxDpr"] = 3;
    g["fit"]();
    const F: any = (Wn.__film = { on: false, frame: 0, marks: {}, kind: null, over: false, audio0: 0, head: false });
    const mark = (what: string) => {
      if (!(what in F.marks)) F.marks[what] = F.frame;
    };
    const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));

    // ---- fingers: each one on the glass is a ring in the picture
    const rings = new Map<string, HTMLElement>();
    const ring = (id: string, x: number | null, y = 0) => {
      let el = rings.get(id);
      if (x === null) {
        el?.remove();
        rings.delete(id);
        return;
      }
      if (!el) {
        el = document.createElement("div");
        el.style.cssText = "position:fixed;z-index:9;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(238,246,248,.8);background:rgba(238,246,248,.2);box-shadow:0 0 10px rgba(238,246,248,.3);pointer-events:none";
        document.body.append(el);
        rings.set(id, el);
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    const send = (el: Element, type: string, id: number, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true }));

    // the finger that aims: it comes down in the lower half of the scope, drags, and when it has gone far is lifted and put back
    const HOME = { x: innerWidth / 2 + 34, y: innerHeight / 2 + 62 };
    const finger = { down: false, x: 0, y: 0, rest: 0 };
    const lift = (rest = 0) => {
      if (finger.down) {
        send(canvas, "pointerup", 1, finger.x, finger.y);
        finger.down = false;
        ring("aim", null);
      }
      finger.rest = Math.max(finger.rest, rest);
    };
    const drag = (dx: number, dy: number) => {
      if (finger.rest > 0) return void finger.rest--;
      if (!finger.down) {
        finger.down = true;
        finger.x = HOME.x;
        finger.y = HOME.y;
        send(canvas, "pointerdown", 1, finger.x, finger.y);
      }
      finger.x += dx;
      finger.y += dy;
      send(canvas, "pointermove", 1, finger.x, finger.y);
      ring("aim", finger.x, finger.y);
      if (Math.hypot(finger.x - HOME.x, finger.y - HOME.y) > 88) lift(5);
    };

    // the thumbs on the buttons: down for so many frames (or until let go)
    const IDS: Record<string, number> = { "Zoom out": 21, "Zoom in": 22, "Hold your breath": 23, Fire: 24 };
    const held = new Map<string, { el: Element; x: number; y: number; left: number }>();
    const press = (label: string, frames: number): boolean => {
      const el = document.querySelector(`.sniper-pad [aria-label="${label}"]`);
      if (!el || held.has(label)) return false;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      send(el, "pointerdown", IDS[label], x, y);
      held.set(label, { el, x, y, left: frames });
      ring(label, x, y);
      return true;
    };
    const release = (label: string) => {
      const h = held.get(label);
      if (!h) return;
      send(h.el, "pointerup", IDS[label], h.x, h.y);
      held.delete(label);
      ring(label, null);
    };

    // ---- the player's eyes
    type V3 = { x: number; y: number; z: number };
    const mid = (a: V3, b: V3, u: number): V3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
    const chest = (p: any) => mid(p.neck, p.pelvis, 0.28), upper = (p: any) => mid(p.skull, p.pelvis, 0.35);
    const bearing = (v: V3) => {
      const e = g.debug.eye, dx = v.x - e.x, dy = v.y - e.y, dz = v.z - e.z;
      return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    };
    /** how far the crosshair itself (the aim and its drift) is from a point just now (rad) */
    const off = (v: V3): number => {
      const m = g.debug.camera.matrixWorld.elements, e = g.debug.eye, dx = v.x - e.x, dy = v.y - e.y, dz = v.z - e.z;
      return Math.acos(Math.min(1, (-m[8] * dx - m[9] * dy - m[10] * dz) / Math.hypot(dx, dy, dz)));
    };
    /** the crosshair is on this person, with nothing in the way */
    const clear = (who: any): boolean => {
      const d = g.debug, dir = d.camera.getWorldDirection(d.eye.clone()), o = d.eye.clone();
      const wall = d.place.raycast(o, dir), body = d.cast.raycast(o, dir);
      return !!body && body.person === who && body.t < wall.t;
    };
    let vy = 0, vp = 0, was: { key: string; yaw: number; pitch: number } | null = null;
    /**
     * Drag the scope toward a point, no faster than `speed` views a second, easing in and out, and
     * keeping up with it if it is moving across the view (the car). Returns how far off the aim still is (rad).
     */
    const steer = (key: string, to: V3, dt: number, speed: number): number => {
      const d = g.debug, fov = (d.camera.fov * Math.PI) / 180, a = bearing(to);
      const same = was && was.key === key, fy = same ? (a.yaw - was!.yaw) / dt : 0, fp = same ? (a.pitch - was!.pitch) / dt : 0;
      was = { key, ...a };
      const ey = a.yaw - d.aim.yaw, ep = a.pitch - d.aim.pitch, k = Math.min(1, 10 * dt);
      vy += (fy + clamp(ey * 6, speed * fov) - vy) * k;
      vp += (fp + clamp(ep * 6, speed * fov) - vp) * k;
      // a finger's pixel is worth this much of a turn (the game's own rule)
      const px = (1.25 * fov) / innerHeight;
      drag((-vy * dt) / px, (-vp * dt) / px);
      return Math.hypot(ey, ep);
    };

    // ---- the player's head: what to do next
    let S: any;
    const go = (stage: string) => {
      S.stage = stage;
      S.t = 0;
      S.dwell = -1;
      S.next = 0;
      mark(stage);
    };
    Wn.__begin = (take: any) => {
      for (let tries = 0; tries < 300; tries++) {
        g["seen"].clear();
        g["brief"](take.contract);
        const t = g.debug.target;
        if (!take.want || (take.want.includes(t.trait) && t.sit < 0.5)) break;
      }
      g["setPhase"]("playing");
      S = { take, stage: "open", t: 0, dwell: -1, next: 0, at: 0, visits: [], zoomed: -1, flew: false };
      Object.assign(F, { on: true, frame: 0, marks: {}, kind: null, over: false, head: false, audio0: Wn.__audio.c.currentTime, trait: g.debug.target.trait, place: g.snapshot.place });
    };
    const player = (dt: number) => {
      const d = g.debug, target = d.target, take = S.take, zoom = g.gauges.zoom;
      for (const [label, h] of held) if (--h.left <= 0) release(label);
      // a contract's opening: hands off
      if (d.intro) return mark("intro");
      S.t += dt;
      const point = take.head ? target.skull : chest(target);
      if (S.stage === "open") {
        mark("scope");
        if (take.wide && S.t > 0.7 && zoom > 4) press("Zoom out", 7);
        if (S.t > (take.wide ? 1.3 : 0.5)) go(take.wide ? "survey" : "target");
      } else if (S.stage === "survey") {
        // the whole of them, from far out
        const all = d.cast.list.filter((p: any) => p.state !== "gone"), c = { x: 0, y: 0, z: 0 };
        for (const p of all) {
          c.x += p.neck.x / all.length;
          c.y += p.neck.y / all.length;
          c.z += p.neck.z / all.length;
        }
        const err = steer("all", c, dt, 0.7);
        if ((S.t > 2.2 && err < 0.012) || S.t > 5) {
          // the others, farthest from the target first, so the search ends beside them
          S.visits = all.filter((p: any) => p !== target).sort((a: any, b: any) => Math.hypot(b.x - target.x, b.z - target.z) - Math.hypot(a.x - target.x, a.z - target.z)).slice(0, take.visits);
          S.at = 0;
          go("visit");
        }
      } else if (S.stage === "visit") {
        // one after another: is it this one?
        const p = S.visits[S.at];
        if (!p) go("target");
        else {
          const err = steer(`visit ${S.at}`, upper(p), dt, 0.9);
          if (S.dwell < 0 && err < 0.004) S.dwell = S.t;
          if ((S.dwell >= 0 && S.t > S.dwell + 0.6) || S.t > 5) {
            S.at++;
            S.dwell = -1;
            S.t = 0;
          }
        }
      } else if (S.stage === "target") {
        // this one: onto them, closer, then onto the head or the heart
        const err = steer("target", zoom >= 16 ? point : upper(target), dt, 1.0);
        if (S.dwell < 0 && err < 0.004) S.dwell = S.t;
        if (S.dwell >= 0 && zoom < 16 && S.t > Math.max(S.dwell + 0.35, S.next) && press("Zoom in", 7)) {
          S.next = S.t + 0.5;
          mark("zoom");
        }
        if (zoom >= 16 && S.zoomed < 0) S.zoomed = S.t;
        if (S.zoomed >= 0 && S.t > S.zoomed + 0.7) go("hold");
      } else if (S.stage === "hold") {
        // a breath in, held; the crosshair settles; squeeze
        steer("target", point, dt, 0.6);
        if (S.t > 0.15) press("Hold your breath", 1e9);
        if (S.t > 1.3 && off(point) < (take.head ? 0.00045 : 0.0006) && clear(target) && g.gauges.holding && press("Fire", 7)) {
          mark("fire");
          go("flight");
        } else if (g.gauges.spent || S.t > 4.7) {
          // out of air: let go, wait, try again
          release("Hold your breath");
          go("rest");
        }
      } else if (S.stage === "rest") {
        steer("target", point, dt, 0.6);
        if (g.gauges.air > 0.85 && S.t > 1.2) go("hold");
      } else if (S.stage === "flight") {
        if (S.t > 0.25) {
          release("Hold your breath");
          lift();
        }
        if (d.shot) {
          S.flew = true;
          F.head = !!d.shot.hit?.head;
          F.hit = d.shot.hit ? d.shot.hit.part : d.shot.what;
          if (d.shot.inside) mark("inside");
          if (d.shot.landed) mark("landed");
        } else if (S.flew) {
          mark("back");
          go("after");
        }
      } else if (S.stage === "after" && S.t > take.after) {
        F.kind = d.outcome ? d.outcome.result.kind : (g.snapshot.result?.kind ?? "none");
        F.over = true;
      }
    };

    Wn.__frame = async (ms: number) => {
      if (F.on && !F.over) player(ms / 1000);
      Wn.__step(ms);
      await Wn.__audioStep(ms / 1000);
      if (F.on) F.frame++;
      return { on: F.on, over: F.over, kind: F.kind, stage: S?.stage };
    };
    /** the take's sound, from where filming began to now: rendered out, and sent as a WAV file */
    Wn.__finish = async () => {
      const A = Wn.__audio, end = A.c.currentTime, rate = A.c.sampleRate;
      A.resume();
      const buf: AudioBuffer = await A.rendering;
      const i0 = Math.round(F.audio0 * rate), n = Math.round(end * rate) - i0, L = buf.getChannelData(0), R = buf.getChannelData(1);
      const bytes = new Uint8Array(44 + n * 4), v = new DataView(bytes.buffer);
      const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
      text(0, "RIFF");
      v.setUint32(4, 36 + n * 4, true);
      text(8, "WAVEfmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 2, true);
      v.setUint32(24, rate, true);
      v.setUint32(28, rate * 4, true);
      v.setUint16(32, 4, true);
      v.setUint16(34, 16, true);
      text(36, "data");
      v.setUint32(40, n * 4, true);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const l = L[i0 + i], r = R[i0 + i];
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        v.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, l)) * 32767), true);
        v.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, r)) * 32767), true);
      }
      for (let i = 0; i < bytes.length; i += 300000) {
        let s = "";
        const part = bytes.subarray(i, i + 300000);
        for (let k = 0; k < part.length; k += 0x8000) s += String.fromCharCode(...part.subarray(k, k + 0x8000));
        await Wn.__chunk(btoa(s));
      }
      return { seconds: n / rate, peak, marks: F.marks, head: F.head, hit: F.hit, trait: F.trait, place: F.place };
    };
  });

  const frame = (ms: number) => page.evaluate((ms) => (window as any).__frame(ms), ms) as Promise<{ on: boolean; over: boolean; kind: string | null; stage: string }>;
  await page.evaluate(() => (window as any).__audioStart());
  // a moment of the menu first, so that nothing of it is left sounding when the take begins
  for (let k = 0; k < 12; k++) await frame(1000 / FPS);
  const file = `${out}/${name}.mp4`;
  const ffmpeg = Bun.spawn(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file],
    { stdin: "pipe", stdout: "inherit", stderr: "inherit" },
  );
  await page.evaluate((t) => (window as any).__begin(t), take);
  // (a frame for the page to put its buttons up)
  await page.waitForTimeout(120);
  let frames = 0, kind: string | null = null, stage = "";
  for (let k = 0; k < 75 * FPS; k++) {
    const s = await frame(1000 / FPS);
    ffmpeg.stdin.write(await page.screenshot({ type: "jpeg", quality: 93 }));
    frames++;
    kind = s.kind;
    if (s.stage !== stage) console.log(`  ${name} ${(frames / FPS).toFixed(2).padStart(6)} s  ${(stage = s.stage)}`);
    if (s.over) break;
  }
  await ffmpeg.stdin.end();
  if (await ffmpeg.exited) throw new Error("ffmpeg failed");
  const done = (await page.evaluate(() => (window as any).__finish())) as { seconds: number; peak: number; marks: Record<string, number>; head: boolean; hit: string; trait: string; place: string };
  await page.close();
  writeFileSync(`${out}/${name}.json`, JSON.stringify({ name, fps: FPS, frames, kind, ...done }, null, 1));
  console.log(`${name}: ${kind} (${done.hit}${done.head ? ", head" : ""}; ${done.place}, ${done.trait}), ${frames} frames, sound ${done.seconds.toFixed(2)} s peak ${done.peak.toFixed(2)}`);
  return { kind, frames, marks: done.marks };
}

for (const name of wanted.filter((n) => n in TAKES)) {
  for (let tries = 1; ; tries++) {
    const started = Date.now(), r = await film(name, TAKES[name]);
    console.log(`${name} (try ${tries}): ${r.kind === "down" ? "kept" : "filmed again"}, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    if (r.kind === "down") break;
    if (tries >= 5) throw new Error(`${name}: the target would not go down`);
  }
}
await browser.close();
