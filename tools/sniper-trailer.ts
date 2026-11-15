/**
 * Records a take of the game for its trailer: the game running live in Chromium,
 * its own canvas and its own audio output captured together by MediaRecorder as they happen.
 *
 * Nobody is at the mouse, so a scripted player plays the first contracts: it reads where the
 * people are and then does only what a player can do, through the page's real input events (mouse
 * movement to aim, the wheel to zoom, shift to hold its breath, the mouse button to fire). Each
 * contract it looks the tower over, zooms out on the room, goes from person to person, settles on
 * the target, zooms in, holds its breath and fires; afterwards it zooms out on the door to watch
 * the room empty. The game is not stepped, slowed or told what to do.
 *
 * It knows only the condo (the first contract's place): where its room and door are is written
 * here. The later places (the pool, the steps, the drive, the woods) need their own before this
 * can play them.
 *
 * The cards between contracts are HTML over the canvas, so they are not in the picture; this
 * script clicks their buttons.
 *
 * Usage: bun tools/sniper-trailer.ts <out.webm> [contracts] [--headed] [--url http://127.0.0.1:5337/]
 * Needs the dev server (bun run dev) and the game's voices (public/shows/sniper/).
 */
import { chromium } from "playwright-core";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args.splice(i, 2)[1] ?? "") : undefined;
};
const headed = args.includes("--headed") && !!args.splice(args.indexOf("--headed"), 1);
const url = flag("url") ?? "http://127.0.0.1:5337/";
const out = args[0] ?? "out/trailer/take.webm";
const contracts = Number(args[1] ?? 5);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, "");

const browser = await chromium.launch({
  channel: "chromium",
  headless: !headed,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
page.on("console", (m) => m.type() === "error" && console.log("page error:", m.text()));
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.exposeFunction("__chunk", (b64: string) => appendFileSync(out, Buffer.from(b64, "base64")));
await page.goto(url, { waitUntil: "networkidle" });
const start = page.getByRole("button", { name: "Start" });
await start.waitFor({ timeout: 30000 });

// ---- in the page: the recorder and the scripted player
await page.evaluate((contracts) => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const g = (window as any).__sniper, W = window as any;
  const canvas = document.querySelector(".fps canvas") as HTMLCanvasElement;
  const EYE_Y = 41, FAR = 105, FLOOR = 34;
  const log: [number, string][] = (W.__log = []);
  let t0 = 0, last = 0, frames = 0, running = false;
  const note = (what: string) => log.push([(performance.now() - t0) / 1000, what]);

  // ---- the recorder: the game's canvas and what its audio sends to the speakers
  const sound = g.debug.sound, dest = sound.ctx.createMediaStreamDestination();
  sound.output.connect(dest);
  const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 28_000_000, audioBitsPerSecond: 256_000 });
  let sending: Promise<void> = Promise.resolve();
  rec.ondataavailable = (e) => {
    sending = sending.then(async () => {
      const bytes = new Uint8Array(await e.data.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await W.__chunk(btoa(s));
    });
  };

  // ---- the player's hands
  const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));
  /** the mouse: whole counts only, the fractions carried over */
  let restX = 0, restY = 0;
  const look = (dyaw: number, dpitch: number) => {
    const k = 0.0024 * (g.debug.camera.fov / 40);
    restX += -dyaw / k;
    restY += -dpitch / k;
    const mx = Math.trunc(restX), my = Math.trunc(restY);
    if (!mx && !my) return;
    restX -= mx;
    restY -= my;
    canvas.dispatchEvent(new MouseEvent("mousemove", { movementX: mx, movementY: my, bubbles: true }));
  };
  const wheel = (dir: 1 | -1) => canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 * dir, bubbles: true, cancelable: true }));
  let shift = false;
  const breath = (hold: boolean) => {
    if (hold === shift) return;
    shift = hold;
    window.dispatchEvent(new KeyboardEvent(hold ? "keydown" : "keyup", { code: "ShiftLeft", bubbles: true }));
  };
  const trigger = () => {
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    setTimeout(() => window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })), 80);
  };

  type V3 = { x: number; y: number; z: number };
  const angles = (v: V3) => ({ yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y - EYE_Y, Math.hypot(v.x, v.z)) });
  let vy = 0, vp = 0;
  /** swing the scope towards a point, no faster than `speed` views a second, easing in and out; returns how far off the aim still is (rad) */
  const steer = (to: V3, dt: number, speed = 1.2): number => {
    const d = g.debug, fov = (d.camera.fov * Math.PI) / 180, a = angles(to), ey = a.yaw - d.aim.yaw, ep = a.pitch - d.aim.pitch;
    const k = Math.min(1, 9 * dt);
    vy += (clamp(ey * 5, speed * fov) - vy) * k;
    vp += (clamp(ep * 5, speed * fov) - vp) * k;
    look(vy * dt, vp * dt);
    return Math.hypot(ey, ep);
  };
  /** how far the crosshair itself (the aim and its drift) is from a point just now (rad) */
  const off = (to: V3): number => {
    const e = g.debug.camera.matrixWorld.elements, dx = to.x, dy = to.y - EYE_Y, dz = to.z, l = Math.hypot(dx, dy, dz);
    return Math.acos(Math.min(1, (-e[8] * dx - e[9] * dy - e[10] * dz) / l));
  };
  const mid = (a: V3, b: V3, u: number): V3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
  const chest = (p: any) => mid(p.neck, p.pelvis, 0.28), upper = (p: any) => mid(p.skull, p.pelvis, 0.35);

  // ---- the player's head: what to do next
  /** how each contract is shot, and how many of the others are looked at first */
  const PLAN: { head: boolean; visits: number }[] = [{ head: true, visits: 2 }, { head: false, visits: 2 }, { head: true, visits: 3 }, { head: false, visits: 3 }, { head: true, visits: 2 }];
  const ROOM: V3 = { x: 0, y: FLOOR + 1.3, z: -FAR - 3 }, DOOR: V3 = { x: 0.3, y: FLOOR + 1.25, z: -FAR - 6.5 };
  const S = { stage: "arrive", since: 0, contract: 0, done: 0, visits: [] as any[], at: 0, steps: 0, dwell: -1, fired: 0, flew: false, phase: "" };
  const go = (stage: string) => {
    S.stage = stage;
    S.since = 0;
    S.steps = 0;
    S.dwell = -1;
    note(stage);
  };
  /** do the i-th thing of a stage once, when the stage is this old */
  const once = (i: number, at: number, f: () => void) => {
    if (S.steps === i && S.since >= at) {
      S.steps++;
      f();
    }
  };

  const tick = (now: number) => {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++;
    S.since += dt;
    const d = g.debug, snap = g.snapshot, target = d.target, plan = PLAN[(snap.contract - 1) % PLAN.length];
    if (snap.phase !== S.phase) note(`phase ${(S.phase = snap.phase)}${snap.result ? ` ${snap.result.kind}${snap.result.head ? " head" : ""}` : ""}`);

    // between contracts: the card is up (not in the picture); watch the room a little longer, then ask for the next
    if (snap.phase === "won" || snap.phase === "failed") {
      if (S.stage !== "card") {
        breath(false);
        if (snap.phase === "won") S.done++;
        go("card");
      }
      if (S.steps === 0 && S.since > 2.6) {
        S.steps = 1;
        if (S.done >= contracts) W.__done = true;
        else W.__want = snap.phase === "won" ? "Next contract" : "Try again";
      }
      return;
    }
    if (snap.phase !== "playing") return;
    if (S.stage === "card" && S.since > 0.2) {
      // a new contract has begun
      S.contract = snap.contract;
      note(`contract ${snap.contract}: ${snap.target}, ${d.cast.list.length} people`);
      go("arrive");
    }

    if (d.shot) {
      // the bullet is on its way: hands off
      if (!S.flew) {
        S.flew = true;
        breath(false);
        note(`shot at ${d.shot.what}${d.shot.hit ? ` ${d.shot.hit.part}` : ""}`);
      }
      if (d.shot.inside && S.stage !== "inside") go("inside");
      if (d.shot.landed && S.stage !== "landed") go("landed");
      return;
    }
    if (S.flew) {
      S.flew = false;
      go(d.outcome ? "after" : "target");
    }

    if (S.stage === "arrive") {
      // somewhere up the tower's face: take it in
      if (S.since > 1.1) go("room");
    } else if (S.stage === "room") {
      // down to the lit window, zooming out to see all of it
      const err = steer(ROOM, dt, 0.9);
      once(0, 0.5, () => wheel(-1));
      if (S.since > 2.0 && err < 0.004) {
        // the others, farthest from the target first, so the search ends beside them
        const others = d.cast.list.filter((p: any) => p !== target).sort((a: any, b: any) => Math.abs(b.x - target.x) - Math.abs(a.x - target.x));
        S.visits = others.slice(0, plan.visits);
        S.at = 0;
        go("close");
      }
    } else if (S.stage === "close") {
      // in on the room
      steer(S.visits[0] ? upper(S.visits[0]) : upper(target), dt, 0.8);
      once(0, 0.15, () => wheel(1));
      once(1, 0.5, () => wheel(1));
      if (S.since > 0.9) go("visit");
    } else if (S.stage === "visit") {
      // one person after another: is it this one?
      const p = S.visits[S.at];
      if (!p) go("target");
      else {
        const err = steer(upper(p), dt, 1.0);
        if (S.dwell < 0 && err < 0.0025) S.dwell = S.since;
        if (S.dwell >= 0 && S.since > S.dwell + 0.75) {
          S.at++;
          S.dwell = -1;
          note(`looked at ${p.trait}`);
        }
      }
    } else if (S.stage === "target") {
      // this one: closer, then onto the head or the heart
      const on = S.dwell >= 0 && S.since > S.dwell + 0.55;
      const err = steer(on ? (plan.head ? target.skull : chest(target)) : upper(target), dt, 1.0);
      if (S.dwell < 0 && err < 0.0025) S.dwell = S.since;
      if (S.dwell >= 0) once(0, S.dwell + 0.45, () => d.camera.fov > 1.6 && wheel(1));
      if (S.dwell >= 0 && S.since > S.dwell + 1.5) go("hold");
    } else if (S.stage === "hold") {
      // a breath in, held; the crosshair settles; squeeze
      const to = plan.head ? target.skull : chest(target);
      steer(to, dt, 0.6);
      once(0, 0.1, () => breath(true));
      const steady = target.gait < 0.2 || S.since > 3;
      if (S.since > 1.25 && steady && off(to) < (plan.head ? 0.00045 : 0.0005) && d.rounds > 0 && d.breath.holding) {
        S.fired++;
        note(`fire ${plan.head ? "head" : "chest"} at ${target.trait}`);
        trigger();
        go("fired");
      }
      // out of air: let go, wait, try again
      if (S.since > 4.6) {
        breath(false);
        go("target");
      }
    } else if (S.stage === "after") {
      // the eye is back at the scope: out, and over to the door to watch them go
      steer(DOOR, dt, 0.9);
      once(0, 0.3, () => wheel(-1));
      once(1, 0.65, () => wheel(-1));
    }
  };

  W.__go = () => {
    rec.start(500);
    running = true;
    t0 = last = performance.now();
    S.contract = g.snapshot.contract;
    S.phase = "playing";
    note(`contract ${g.snapshot.contract}: ${g.snapshot.target}, ${g.debug.cast.list.length} people`);
    go("arrive");
    requestAnimationFrame(tick);
  };
  W.__stop = async () => {
    running = false;
    breath(false);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.stop();
    await stopped;
    await sending;
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return { log, seconds: (performance.now() - t0) / 1000, fps: frames / ((performance.now() - t0) / 1000), stats: g.stats, snapshot: g.snapshot, fired: S.fired, gpu: info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : "?" };
  };
}, contracts);

type Win = { __go(): void; __stop(): Promise<{ log: [number, string][] }>; __want?: string; __done?: boolean };
await start.click();
await page.evaluate(() => (window as unknown as Win).__go());
console.log(`recording ${contracts} contracts to ${out} …`);
const began = Date.now();
for (;;) {
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => {
    const w = window as unknown as Win, want = w.__want;
    w.__want = undefined;
    return { want, done: !!w.__done };
  });
  // the card's button: a real click, so the page may take the mouse again
  if (state.want) await page.getByRole("button", { name: state.want }).click();
  if (state.done || Date.now() - began > (contracts * 45 + 20) * 1000) break;
}
const result = await page.evaluate(() => (window as unknown as Win).__stop());
await browser.close();
const { log, ...rest } = result;
console.log(JSON.stringify(rest));
for (const [t, what] of log) console.log(`${t.toFixed(2).padStart(7)}  ${what}`);
writeFileSync(out.replace(/\.webm$/, ".log.json"), JSON.stringify(result, null, 1));
