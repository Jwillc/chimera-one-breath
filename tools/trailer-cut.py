# /// script
# dependencies = []
# ///
"""Cuts the trailer from the takes `tools/trailer-film.ts` filmed (ffmpeg).

    uv run tools/trailer-cut.py [outdir]        # writes <outdir>/one-breath-trailer.mp4 (1080 x 1920, 60 fps)

The order: one whole contract in the condo (look the room over, find the target, zoom, hold a
breath, fire, the bullet's flight and its way through them); then a few other places, quickly, each
cut from the shot to what it did; then the card that says where to play it. Each take's times come
from the marks filmed beside it, so a take filmed again still cuts in the right places.
"""
import json
import subprocess
import sys
from pathlib import Path

DIR = Path(sys.argv[1] if len(sys.argv) > 1 else "out/trailer")
FPS = 60
LAST = 5.5          # seconds of the last card
QUICK = ["pool", "drive", "woods"]


def take(name):
    return json.loads((DIR / f"{name}.json").read_text())


def s(frames):
    return frames / FPS


clips = []          # (take, from s, to s, [(card, from s, to s) within the clip])

# ---- the whole contract
h = take("hero")
m = h["marks"]
start, end = 0.35, s(m["back"]) + 1.5
words = [("find", s(m["survey"]) - start + 0.2, s(m["target"]) - start + 0.5),
         ("zoom", s(m["zoom"]) - start - 0.1, s(m["hold"]) - start),
         ("breath", s(m["hold"]) - start + 0.1, s(m["fire"]) - start + 0.1)]
clips.append(("hero", start, end, words))

# ---- the other places: the opening where there is one, the shot, and what it did
for i, name in enumerate(QUICK):
    t = take(name)
    m = t["marks"]
    fire, inside, landed = s(m["fire"]), s(m["inside"]), s(m["landed"])
    if "intro" in m:
        a = s(m["intro"]) + 0.5
        clips.append((name, a, a + 3.0, []))
    a, b = max(s(m.get("scope", 0)) + 0.1, fire - 2.3), fire + 0.95
    clips.append((name, a, b, [("places", 0.15, b - a - 0.9)] if i == 0 else []))
    clips.append((name, inside - 1.25, min(landed + 2.1, s(m["back"]) - 0.05), []))

# ---- the graph
takes = sorted({c[0] for c in clips})
cards = sorted({w[0] for c in clips for w in c[3]})
inputs, index = [], {}
for k, name in enumerate(takes):
    index[name] = k
    inputs += ["-i", str(DIR / f"{name}.mp4"), "-i", str(DIR / f"{name}.wav")]
n_takes = len(takes)
for k, card in enumerate(cards):
    index[card] = 2 * n_takes + k
    inputs += ["-loop", "1", "-framerate", str(FPS), "-i", str(DIR / f"{card}.png")]
last = 2 * n_takes + len(cards)
inputs += ["-loop", "1", "-framerate", str(FPS), "-t", str(LAST), "-i", str(DIR / "last.png")]

# the sound's level: the takes are the game's own mix; one gain for all of them brings the loudest to just under full
peak = max(take(n)["peak"] for n in takes)
gain = min(2.5, 0.92 / max(peak, 1e-6))

f, total = [], 0.0
for i, (name, a, b, words) in enumerate(clips):
    v, au = 2 * index[name], 2 * index[name] + 1
    f.append(f"[{v}:v]trim=start={a:.4f}:end={b:.4f},setpts=PTS-STARTPTS,fps={FPS},format=yuv420p[c{i}]")
    cur = f"c{i}"
    for k, (card, w0, w1) in enumerate(words):
        if w1 - w0 < 0.5:
            continue
        f.append(f"[{index[card]}:v]format=rgba,trim=duration={b - a:.4f},fade=t=in:st={w0:.3f}:d=0.25:alpha=1,fade=t=out:st={w1 - 0.3:.3f}:d=0.3:alpha=1[w{i}_{k}]")
        f.append(f"[{cur}][w{i}_{k}]overlay=enable='between(t,{w0:.3f},{w1:.3f})'[o{i}_{k}]")
        cur = f"o{i}_{k}"
    f.append(f"[{cur}]null[v{i}]")
    f.append(f"[{au}:a]atrim=start={a:.4f}:end={b:.4f},asetpts=PTS-STARTPTS,volume={gain:.3f},afade=t=in:st=0:d=0.03,afade=t=out:st={b - a - 0.04:.4f}:d=0.04[a{i}]")
    total += b - a
n = len(clips)
f.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[film][sound]")
# the last card comes up over black, and the sound goes out under it
f.append(f"[film]fade=t=in:st=0:d=0.35,fade=t=out:st={total - 0.3:.3f}:d=0.3[filmf]")
f.append(f"[{last}:v]format=yuv420p,fps={FPS},fade=t=in:st=0:d=0.5,fade=t=out:st={LAST - 0.5:.2f}:d=0.5[card]")
f.append("[filmf][card]concat=n=2:v=1:a=0[v]")
f.append(f"[sound]afade=t=in:st=0:d=0.2,afade=t=out:st={total - 0.35:.3f}:d=0.35,apad=pad_dur={LAST}[a]")

out = DIR / "one-breath-trailer.mp4"
r = subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
                    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-t", f"{total + LAST:.3f}", str(out)],
                   capture_output=True, text=True)
if r.returncode:
    sys.exit(r.stderr)
print(f"{out}: {total + LAST:.1f} s ({total:.1f} s of the game, {LAST} s of the card); sound gain {gain:.2f} (peak was {peak:.2f})")
for name, a, b, words in clips:
    print(f"  {name:6s} {a:6.2f} to {b:6.2f}  ({b - a:.2f} s)" + ("  words: " + ", ".join(w[0] for w in words) if words else ""))
