# ONE BREATH

A browser game on the CHIMERA voice engine: a sniper's scope, one named target among a few people,
a slow-motion bullet camera with an X-ray pass. See the README. Live at
https://jwillc.github.io/chimera-one-breath/; a push to `main` rebuilds and redeploys it
(`.github/workflows/pages.yml`).

## Map

- `src/sniper/game.ts`: the scope, input, the shot and its camera, the gauges, a contract's opening.
- `src/sniper/people.ts`: the cast (bodies, minds, wounds, the X-ray). `things.ts`: what they carry,
  worn or loose. `crew.ts`: the shooter and driver seen in an opening.
- `src/sniper/place.ts`: what a place is (`Place`, `Scene`). `condo.ts`, `pool.ts`, `steps.ts`,
  `drive.ts`, `woods.ts`: the five, in the order of `PLACES` in `game.ts`.
- `src/sniper/sound.ts`, `fx.ts`, `words.ts`: playing the voices, blood and glass, how a cry is spelled.
- `src/sniper/SniperPage.tsx` and `sniper.css`: the card over the canvas.
- `public/shows/sniper/`: every sound, rendered ahead. `sounds/compose.py`: the script that renders
  them (it needs a command-line engine that is not in this repo).
- `crates/`, `src/ui`, `src/wasm`, `src/worklet`, `src/audio`, `src/show`: the parts of CHIMERA the
  game imports. Change them only when the game needs it.

## How the game is meant to be

- **Every sound is a CHIMERA voice.** No recordings. A new sound is rendered by `sounds/compose.py`
  or played from the kit already there.
- **No bed under it.** No ambient hum, wind or drone. Single quiet sounds (a fire's tick, a road's
  thud) are as far as it goes.
- **Simulated, not scripted.** What a loose thing does comes out of `things.ts`; tune its numbers
  and re-run the tests rather than writing where it lands.
- **The bullet lands where the crosshair was.** Nobody moves while it is in the air (`Cast.update`
  gets no time until it is inside someone or has landed). A pose that ignores elapsed time breaks this.
- **A thing is the same lines worn and loose** (`thingOf`), so it does not change as it leaves.
- **The game's own lettering is Archivo**, drawn by `text()` in `game.ts`: names of things in blue,
  values in white, the target in amber, nothing in the dim blues. The words at people's mouths and
  the "Chimera" wordmark stay in Hershey.
- **It plays on a phone**, upright or on its side. A finger on the view aims and never fires; the
  buttons (`Pad` in `SniperPage.tsx`) sit in the bottom corners, outside the scope's circle, and
  carry the breath and the rounds, which the canvas then does not draw. Canvas text that could be
  wider than a phone takes `max` in `text()`. Anything added to the screen has to fit 375 px wide.
- **The rim's marks say where, not who.** A small red mark inside the scope's rim points at each person
  outside its circle (`whereabouts` in `game.ts`), all alike. Nothing on the screen singles out the
  target: finding which one it is, is the game.
- **Safari is handled apart** (`SAFARI` in `game.ts`, the `.safari` class on the page): its card is
  given a stacking order (it drew the canvas over the card), its mouse is read from `pointermove`
  (its `movementX` undercounts), and a lost focus or mouse capture is not at once a pause. The
  other browsers keep the plain handling. Nobody here can run Safari: `?diag` on the dev server
  makes the page write what it sees to `out/diag.log`.
- **The people are adults.**
- A place may have an `opening` (only the drive does): seen once per contract, skipped by a click,
  not replayed on "Try again".

## Checks

| When you touch | Run |
|---|---|
| anything | `bun run build` (wasm, typecheck, bundle) and `bun run test` |
| `things.ts` | read what `tests/sniper-things.test.ts` pins before moving a number |
| the game, a place, the card | `bun run dev`, then drive it in a browser (below) and look at screenshots |
| the card, the gauges, the buttons, CSS | the same at 375x812 and 812x375 with touch on (a `touchstart` on `window` turns it on) |

In the browser the game is `window.__sniper`. Set `frozen = true` and step with `frame(1/60)`;
`g["brief"](n)` then `g["setPhase"]("playing")` jumps to contract n; `debugAim("target" | index,
head)` puts the crosshair on someone and `fire()` shoots; `debugLook(yaw, pitch, zoom)` points the
scope. `debug` has the cast (`debug.cast.list`, `debug.cast.things.list`), the place, the shot and
the opening (`debug.intro`).

The trailer: `bun tools/trailer-film.ts out/trailer` films takes in phone layout frame by frame on a
clock it owns (a scripted player using real touch events, each finger shown as a ring), with the
game's own sound rendered offline in step with the picture; `uv run tools/trailer-cut.py out/trailer`
cuts them, with the words over the picture and the last card, into `out/trailer/one-breath-trailer.mp4`.
`out/` is not committed. (`tools/sniper-trailer.ts` is the older live recorder; it knows only the
condo's geometry.)

Nobody can hear the sounds or feel the mouse from a scripted run: say so when reporting.

Commit small, with what changed and what was run. Pushing to `main` publishes.
