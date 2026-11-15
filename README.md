# ONE BREATH

A wireframe sniper game for the browser. You look through a scope at a few people a long way off;
a handler on the radio names one of them by the thing that tells them apart; you have three rounds.

**Play it: https://jwillc.github.io/chimera-one-breath/**

When you fire, the view leaves the scope and follows the bullet, slowly, to whatever the crosshair
was on. If that is a person they are seen through to the bones while it goes in and out, and each
thing it meets on the way is named. Then time comes back, they go down, and whatever they had (a
hat, a glass, a phone) falls after them.

Every sound in it is a synthesized voice: the people's talk and screams, the handler, the rifle
(a beatboxer's kick, snare and tongue click), the bullet, your own breath.

It plays with a mouse and keyboard, or on a phone or tablet with fingers, upright or on its side.

## Controls

| Mouse and keys | On a touch screen | What it does |
|---|---|---|
| Mouse (or the arrow keys) | Drag a finger over the view | Aim |
| Wheel (or `Z` and `X`) | Pinch, or the `+` and `−` buttons | Zoom: 4x, 8x, 16x, 32x |
| `Shift` | Hold the `BREATH` button | Hold your breath: the crosshair settles, for as long as the air lasts |
| Click (or `Space`) | The `FIRE` button | Fire |
| Click (or `Space`) | Tap anywhere | During a contract's opening: skip it |
| `Esc` (or `P`) | The `II` button | Pause |

On a touch screen the crosshair goes as far across the picture as the finger does (and a quarter
more), at any zoom, and a touch on the view never fires: only the button does.

## The contracts

Seven places, one after another, then round again with more people in each.

1. **The condo.** A lit room in a tower, from the roof opposite.
2. **The pool.** A hotel's roof deck, from a taller roof.
3. **The steps.** Three people on their way up to a building's door, from the street below. Once
   the target is inside, the chance is gone.
4. **The drive.** A café on the far bank of a river, from the back seat of a car that does not stop.
5. **The woods.** Three men at a camp, from a ridge. A tree trunk stops a bullet.
6. **The opera.** The stage of a full house, from the booth at the back of it. The target is one
   of the players: the one who is singing, the one in the crown, the one with the sword, the one in
   the cape, the one holding the skull. The crowd is all round them, in the boxes and the seats;
   hit one of the guests in a box and it is the wrong target. The soprano's aria has no words. Fire
   under her one long high note (the gauge marked ARIA says when) and nobody hears it: the house
   goes on watching, and the shot is worth more. Fire at any other moment and the whole house is
   on its feet, shouting, and rushing up the aisles for the doors. It opens on one of the audience
   in the gallery, who takes a rifle out of a case at his feet and puts it together.
7. **The block.** A square in the city, from a roof across the road. Twenty strangers in it (fourteen
   on a phone), no two alike: each has their own hair (or none, or a hat over it), clothes of one
   colour, and perhaps glasses, a tie, a drink, a phone, a cigar or a bag. The handler tells you
   the target by the fewest of those things that nobody else there shares ("red hair, dressed in
   blue"), so the others are nearly right. From up there their talk comes faint, one voice at a
   time. There are forty seconds (counted down at the foot of the scope): after it the police are up the
   stairs, and the view goes out to the roof to watch the arrest. It opens on the roof: someone comes to its edge at a crouch, puts the rifle together on one
   knee below the wall, and leans it over.

Add `?contract=7` to the address to begin at a given contract.

If the people are outside the scope's circle, small red marks on its rim point toward them (toward all
of them alike: which one is yours is for you to find).

A shot that lands near them and they run for the way out. Hit somebody else and the contract is
lost.

## How it works

- `src/sniper/game.ts` is the game: the scope, the breath and pulse, the bullet's flight and its
  camera, the gauges, the drive's opening shot.
- `src/sniper/people.ts` is the people: wire bodies in clothes under a simulated head, with a
  skeleton, heart, lungs and brain that show only while a bullet goes through.
- `src/sniper/place.ts` is what a place is; `condo.ts`, `pool.ts`, `steps.ts`, `drive.ts`,
  `woods.ts`, `opera.ts` and `block.ts` are the seven. `looks.ts` is how a crowd of strangers is
  dressed and how one of them is told from the rest.
- `src/sniper/things.ts` is the hat, glasses, cigar, glass and phone as small rigid bodies. Where
  one ends up is not scripted: it is let go with the speed of the place it sat and the push of the
  bullet that went by, and falls, tumbles, bounces, breaks, floats or sinks from there.
  `tests/sniper-things.test.ts` checks that nothing gains energy and everything comes to rest.
- `src/sniper/sound.ts` plays the voices; each person's head moves from the engine's own record of
  what its throat was doing for that sound.

The sounds (`public/shows/sniper/`) were all rendered with CHIMERA, a physical model of a voice.
`sounds/compose.py` is the script that made them; it needs a command-line build of the engine that
is not part of this repo, so the rendered files are checked in.

## Run it locally

You need [Bun](https://bun.sh) and [Rust](https://rustup.rs) with the wasm target
(`rustup target add wasm32-unknown-unknown`).

```bash
bun install
bun run dev        # http://127.0.0.1:5337
```

```bash
bun run test       # the tests
bun run build      # the site, in dist/
```

Pushing to `main` builds and publishes the site to GitHub Pages
(`.github/workflows/pages.yml`).

## Credits

- Built on [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth) by Jameson Hodge, a
  physically modelled voice synthesizer (MIT). The voice engine in `crates/`, the head renderer and
  the supporting code under `src/ui`, `src/wasm`, `src/worklet`, `src/audio` and `src/show` come
  from it, with changes.
- Fonts: AV Hershey Simplex and Archivo; their licences are in `public/fonts/`.

MIT licensed; see `LICENSE`.
