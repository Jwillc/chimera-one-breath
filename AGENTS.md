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
  `drive.ts`, `woods.ts`, `opera.ts`, `block.ts`: the seven, in the order of `PLACES` in `game.ts`.
  `looks.ts`: how a crowd of strangers is dressed, and what is said of one to tell them apart.
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
- **A place may have its own players and its own crowd.** `Place.traits` is what tells its possible
  targets apart, and it need not be the six ordinary things: the opera's are what its players are
  playing (`sing`, `crown`, `sword`, `cape`, `skull`), each with its line from the handler
  (`brief-<trait>` in `sounds/compose.py`) and, where it is a thing, its shape in `things.ts`.
  Spots marked `crowd` hold people who can be hit like anyone and are never the target
  (`Place.crowd()` says how many); they get an ordinary thing only to be somebody.
- **At the opera the song is the cover.** Whoever has the trait `sing` stands at the spot marked
  `sings` and sings. A shot fired while `Cast.loud()` is at or over the place's `drown` alarms
  nobody (`Shot.covered`) and is worth 500 more, unless it is the singer who is hit. The aria is
  six takes (`SONG` in `sounds/compose.py`), each played at its own marking; only the fifth, the
  long high note, is over the line, and `tests/sniper-opera.test.ts` holds it to that. No words in it.
- **A heard shot empties the opera.** The audience is in two kinds: a dozen people of the cast in
  the seats and boxes (heads, voices, as shootable as anyone), and some three hundred who are only
  a head and shoulders, drawn once while they sit (`Opera.sitting`) and one by one once
  `Place.alarm()` has been called, each along their row to an aisle and out. At most nine screams
  sound at once (`SCREAMS` in `people.ts`). Twenty heads cost about 8 ms a frame on a desktop:
  `Place.crowd(lap, light)` gives fewer where the game is played by touch.
- **On the block the target is told by how they look.** A place with `looks` set gets a crowd from
  `dress()` in `looks.ts`: each person a head (hair of one of five colours, or bald, or a hat over
  it), clothes of one of six colours and perhaps one thing (`HAS`: a `bag` and `plain`, nothing,
  besides the ordinary six), no two the same in all three. `tell()` finds the fewest of those that
  nobody else shares, and the target is someone it takes at least two to tell, where there is one.
  The handler says them one clip each (`look-target`, then `SAID[...].id`, in `sounds/compose.py`)
  and the gauges show a line for each (`Cast.wanted`, `Game.told()`). A new colour or thing needs
  its entry in `SAID` and its clip; `tests/sniper-block.test.ts` holds every clause to having one.
  Twenty heads there (fourteen by touch: `Place.people(lap, light)`), about 8 ms a frame on a desktop.
- **The block has forty seconds.** `Place.limit` is how long there is at the scope; the countdown is
  drawn at the foot of the glass either side of the post (`hudScope`), the handler says "fifteen
  seconds", the last ten tick. At nought `Game.caught()` starts the arrest (`arrest`, `bustCamera`,
  `hudBust`, `BUST` seconds): two officers out of `limit.door`, drawn like the crew (`drawSeated`
  with `legs` given is anyone, standing or kneeling), their lines in `OFFICERS` in
  `sounds/compose.py`; then the card, result kind `caught`. The clock stops while a bullet flies.
- **Not in front, not heard.** A contract under way pauses when the window loses focus; behind a
  card the sound is suspended instead (`Game.hush`), and comes back with the focus.
- **The people are adults.**
- A place may have an `opening` (the drive, the opera and the block do): the view goes round whoever has the
  rifle, with a line of what is different here, then in at the scope. Seen once per contract,
  skipped by a click, not replayed on "Try again". The drive's is in slow motion round the car;
  the opera's is at the room's own speed (`pace: 1`, the aria is being sung) and `assemble`s the
  rifle: he sits in the gallery as one of the audience, takes it from a case at his feet and fits
  it together part by part (`BUILD` and `assembly` in `game.ts`; the rifle's lines are kept by part).
  The block's is the same assembly kept out of sight (`stealth`): in at a crouch with the case in
  one hand, a look over each shoulder, the rifle put together on one knee below the roof's low wall,
  and only then up and over the edge. The wall and the roof's furniture are drawn by the place
  (`Block.roof`), set from where the eye is, since whoever kneels there is placed from the eye.
- **From a roof the square is faint.** `Place.hear` is how near a voice is at full level and
  `Place.talk` how many may talk at once and the quiet between: the block's are 16 m (the people
  are 45 to 90 m off, so some 12 to 16 dB down, the nearer the louder), one voice, 3.5 s or so.

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
