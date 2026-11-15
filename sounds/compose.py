# /// script
# dependencies = ["numpy"]
# ///
"""ONE BREATH -- the voices of the wireframe sniper game.

Every sound in the game is a CHIMERA airway. The people in the scope talk, scream and cry out
(each rendered with its telemetry, so the head in the scope moves as the engine did). The handler
on the radio is the engine's own speech. The rifle is a beatbox kit: a tongue click for the
trigger, a kick under a snare for the shot, hi-hats for the bolt. The bullet in flight is a long
"sh" and a mouth going "pyew"; the shooter's breath is a whisper.

    SPEECH_ENGINE=/path/to/chimera uv run compose.py     # renders the takes and writes ../public/shows/sniper/
    SPEECH_ENGINE=/path/to/chimera uv run compose.py sing intro-opera     # only these (kinds or ids), added to what is there

The rendered sounds are in the repo, so the game does not need this run. To run it you need a build
of the CHIMERA command-line engine (`chimera render notes | text | speech | beatbox`): the engine in
this repo's crates/ is the browser's, without the command line.
"""
import json
import os
import shutil
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ENGINE = Path(os.environ.get("SPEECH_ENGINE") or HERE.parent.parent / "chimera-vocal-synth/target/release/chimera")
TAKES = HERE / "takes"
GAME = HERE.parent / "public/shows/sniper"
SR = 48000

SAY = {"ha": "hɑ", "oh": "oʊ", "ah": "ɑ", "uh": "ʌ", "huh": "hʌ", "ugh": "ʌɡ", "oof": "ʊf", "agh": "æ",
       "hoo": "hu", "hah": "hɑ", "pyoo": "pju", "oo": "u"}
# where each body speaks from (MIDI): talk sits a little above it, a scream well over an octave up
BASE = {"male": 45, "female": 57}

# kind -> [(name, [(word, semitones above the base, seconds), ...], source)]
# a word ending in "-" runs on into the next one ("mon-" "ey"); "~" holds the syllable before it
TALK = dict(pressure=8.5, tension=.5, roughness=.06)
SCREAM = dict(pressure=18, tension=.72, roughness=.25)
SHOT = dict(pressure=15, tension=.5, roughness=.35, breathiness=.2)
CLIPS = {
    "chat": [
        ("ha", [("ha", 7, .16), ("ha", 5, .16), ("ha", 3, .16), ("ha", 0, .3)], TALK),
        ("no", [("no", 4, .22), ("no", 2, .22), ("no", -1, .4)], TALK),
        ("wine", [("more", 2, .25), ("wine", 5, .45)], TALK),
        ("view", [("what", 3, .18), ("a", 2, .12), ("view", 5, .5)], TALK),
        ("money", [("show", 2, .2), ("me", 3, .16), ("the", 2, .12), ("mon-", 6, .2), ("ey", 1, .35)], TALK),
        ("cheers", [("cheers", 6, .5)], TALK),
        ("really", [("oh", 2, .2), ("real-", 7, .22), ("ly", 3, .35)], TALK),
        ("said", [("so", 3, .2), ("I", 4, .16), ("said", 5, .22), ("no", 0, .45)], TALK),
        ("night", [("not", 2, .2), ("to-", 3, .15), ("night", 0, .45)], TALK),
        ("uhhuh", [("uh", 2, .2), ("huh", 5, .3)], TALK),
    ],
    # the men at the camp in the woods, waiting for the end of the world
    "camp": [
        ("grid", [("off", 3, .2), ("the", 2, .12), ("grid", 0, .45)], TALK),
        ("beans", [("beans", 4, .3), ("a-", 2, .12), ("gain", 0, .4)], TALK),
        ("anyday", [("an-", 3, .16), ("y", 4, .14), ("day", 5, .25), ("now", 0, .45)], TALK),
        ("hear", [("did", 3, .14), ("you", 4, .14), ("hear", 6, .25), ("that", 2, .4)], TALK),
        ("ready", [("stay", 3, .25), ("read-", 5, .2), ("y", 1, .35)], TALK),
    ],
    "phone": [
        ("yes", [("yes", 3, .3)], TALK),
        ("howmuch", [("how", 4, .2), ("much", 1, .4)], TALK),
        ("callme", [("call", 3, .2), ("me", 4, .16), ("back", 0, .4)], TALK),
        ("doit", [("do", 4, .2), ("it", 0, .3)], TALK),
        ("sell", [("sell", 5, .22), ("it", 3, .14), ("all", 0, .45)], TALK),
    ],
    # whoever has the rifle, at home at the end of it all, lying down (src/sniper/ending.ts): low, tired, falling away
    "home": [
        ("day", [("a-", 1, .11), ("noth-", 3, .2), ("er", 1, .15), ("day", 2, .55),
                 ("a-", 0, .11), ("noth-", 2, .2), ("er", 0, .15), ("con-", 1, .26), ("tract", -4, .6)], dict(pressure=7, tension=.38, roughness=.1, breathiness=.18)),
    ],
    "scream": [
        ("ah", [("ah", 19, .5), ("~", 21, .6)], SCREAM),
        ("no", [("no", 16, .25), ("~", 19, .5)], SCREAM),
        ("run", [("run", 17, .4)], SCREAM),
        ("help", [("help", 18, .45)], SCREAM),
        ("getdown", [("get", 15, .18), ("down", 18, .5)], SCREAM),
        ("ohno", [("oh", 17, .22), ("no", 20, .3), ("~", 16, .35)], SCREAM),
        ("ohgod", [("oh", 16, .2), ("god", 20, .5)], SCREAM),
    ],
    # shot: a cry knocked out of the body, falling away as it goes down
    "shot": [
        ("agh", [("agh", 12, .14), ("~", 6, .3), ("~", -3, .7)], SHOT),
        ("ugh", [("ugh", 8, .2), ("uh", 0, .8)], SHOT),
        ("oof", [("oof", 9, .22), ("oh", -2, .8)], SHOT),
        ("ohh", [("oh", 11, .2), ("~", 3, .4), ("~", -5, .6)], SHOT),
    ],
}

# The singer at the opera: an aria with no words, in "oo" and "ah". Six phrases, sung one after another
# and round again. Each is its own take so that each has its own breath: soft at first, a climb, and
# then one long high note sung with everything (the note a shot can hide under), and a soft way down.
# The engine evens out how loud a take comes, whatever breath is put behind it, so each phrase also
# has its marking, soft to full (the last number): the game plays it that loud against the high note.
SONG = [
    ("1", [("oo", 12, 1.0), ("~", 15, .8), ("~", 14, .8), ("oo", 12, 1.5)], dict(pressure=7.5, tension=.45, breathiness=.12, vibrato=16), .45),
    ("2", [("ah", 12, .8), ("~", 16, .8), ("~", 19, 1.2), ("~", 17, .6), ("oo", 16, 1.6)], dict(pressure=8.5, tension=.5, breathiness=.08, vibrato=18), .55),
    ("3", [("ah", 16, .7), ("~", 19, .7), ("ah", 21, 1.0), ("~", 19, .7), ("oo", 17, 1.5)], dict(pressure=9.5, tension=.55, breathiness=.06, vibrato=20), .7),
    ("4", [("ah", 19, .6), ("~", 21, .6), ("~", 23, .9)], dict(pressure=11, tension=.6, breathiness=.05, vibrato=18), .85),
    ("5", [("ah", 24, 3.4), ("~", 21, .9)], dict(pressure=18, tension=.7, breathiness=.02, vibrato=28), 1),
    ("6", [("oo", 19, 1.0), ("~", 17, 1.0), ("oo", 12, 2.2)], dict(pressure=7.5, tension=.45, breathiness=.12, vibrato=16), .45),
]

# the handler on the radio: the engine's own speech (id -> what she says)
# the police, when they reach whoever has the rifle before the target is found (men's voices; the handler is a woman)
OFFICERS = {
    "cop-hands": "Police! Hands up!",
    "cop-still": "Do not move.",
    "cop-arrest": "You are under arrest.",
}
HANDLER = {
    "intro": "Eyes on the lit window.",
    "intro-pool": "Eyes on the pool, below you.",
    "intro-steps": "Eyes on the steps. They are going in.",
    "intro-drive": "Eyes on the far bank. We are not stopping.",
    "intro-woods": "Eyes on the camp, through the trees.",
    "intro-opera": "Eyes on the stage. Fire on the high note.",
    "intro-block": "Eyes on the square, below you.",
    # a stranger in a crowd is told by how they look: "your target", then each thing said of them (src/sniper/looks.ts)
    "look-target": "Your target.",
    "look-blond": "Blond hair.",
    "look-red": "Red hair.",
    "look-white": "White hair.",
    "look-pink": "Pink hair.",
    "look-green": "Green hair.",
    "look-bald": "Bald.",
    "look-hat": "Wearing a hat.",
    "look-in-red": "Dressed in red.",
    "look-in-green": "Dressed in green.",
    "look-in-blue": "Dressed in blue.",
    "look-in-pink": "Dressed in pink.",
    "look-in-white": "Dressed in white.",
    "look-in-orange": "Dressed in orange.",
    "look-glasses": "Wearing glasses.",
    "look-tie": "Wearing a tie.",
    "look-drink": "Holding a drink.",
    "look-phone": "On the phone.",
    "look-cigar": "Smoking.",
    "look-bag": "Carrying a bag.",
    "brief-hat": "Your target is wearing a hat.",
    "brief-tie": "Your target is wearing a red tie.",
    "brief-drink": "Your target is holding a drink.",
    "brief-phone": "Your target is on the phone.",
    "brief-glasses": "Your target is wearing glasses.",
    "brief-cigar": "Your target is smoking.",
    "brief-sing": "Your target is singing.",
    "brief-crown": "Your target is wearing a crown.",
    "brief-sword": "Your target is holding a sword.",
    "brief-cape": "Your target is wearing a cape.",
    "brief-skull": "Your target is holding a skull.",
    "go": "One breath. One shot.",
    # where there is only so long (a roof somebody will come up to): near the end, and at it
    "hurry": "Fifteen seconds.",
    "caught": "They are on the roof.",
    "win-1": "Target down.",
    "win-2": "Good shot. Target down.",
    "win-3": "Clean. Go home.",
    "wrong-1": "That was the wrong one.",
    "wrong-2": "Wrong target. We are done.",
    "miss-1": "You missed.",
    "miss-2": "Missed. They are running.",
    "gone": "The target is gone.",
    "empty": "You are out of rounds.",
}

# sounds with no place in the world, played in the listener's head: name -> (melody, body)
WHISPER = dict(pressure=6.5, tension=.15, breathiness=1.0)
ONESHOT = {
    # the bullet's own voice: a mouth going "pyew"
    "pyew": ([("pyoo", 24, .12), ("~", 20, .14), ("~", 14, .2), ("~", 7, .3), ("~", 0, .55)], dict(pressure=13, tension=.6, roughness=.05), "female"),
    # the shooter's own breath in and out
    "breath-in": ([("hah", 0, .9)], WHISPER, "male"),
    "breath-out": ([("hoo", -2, 1.1)], WHISPER, "male"),
}
KIT = {"B": "B", "K": "K", "Pf": "Pf", "kch": "kch", "t": "t", "tss": "tss", "inK": "_K", "pop": "P_", "click": "_"}


def melody(score, base, source):
    words, run = "", False
    for w, _, _ in score:
        words += ("" if run or not words else " ") + w
        run = w.endswith("-")
    return {"bpm": 60, "vibrato": 0, "t0": .1, "lyrics": words, "pronunciations": SAY,
            "notes": [[base + st, s] for _, st, s in score], **source}


def spans(score, t0=.1):
    """When each syllable sounds in the file (s): [start, end, text], a held "~" lengthening its syllable."""
    out, t = [], t0
    for word, _, seconds in score:
        if word == "~" and out:
            out[-1][1] = round(t + seconds, 3)
        else:
            out.append([round(t, 3), round(t + seconds, 3), word.rstrip("-")])
        t += seconds
    return out


def run(*args):
    r = subprocess.run([str(ENGINE), "render", *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{args}: {r.stderr}")


def read(path):
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768


def measure(path, target=.2):
    """Where the sound starts and ends (s), and the gain that brings its loud part to `target` rms."""
    x = read(path)
    peak = max(np.abs(x).max(), 1e-9)
    env = np.convolve(np.abs(x), np.ones(240) / 240, "same")
    on = np.nonzero(env > .04 * env.max())[0]
    start = max(0., on[0] / SR - .012)
    end = min(len(x) / SR, on[-1] / SR + .12)
    loud = x[np.abs(x) > .25 * peak]
    gain = min(target / max(np.sqrt(np.mean(loud ** 2)), 1e-9), .97 / peak)
    return round(start, 4), round(end, 4), round(float(gain), 3), round(float(peak), 3)


def main():
    only = set(sys.argv[1:])
    TAKES.mkdir(exist_ok=True)
    if GAME.exists() and not only:
        shutil.rmtree(GAME)
    GAME.mkdir(parents=True, exist_ok=True)
    jobs, clips, shots = [], [], {}
    for body, base in BASE.items():
        for kind, takes in CLIPS.items():
            for name, score, source in takes:
                cid = f"{body}-{kind}-{name}"
                (TAKES / f"{cid}.json").write_text(json.dumps(melody(score, base, source), ensure_ascii=False))
                jobs.append(("notes", TAKES / f"{cid}.json", TAKES / cid, body, "--tele", TAKES / f"{cid}.tele"))
                clips.append({"id": cid, "kind": kind, "body": body, "say": name, "words": spans(score)})
    for name, score, source, _ in SONG:
        cid = f"female-sing-{name}"
        (TAKES / f"{cid}.json").write_text(json.dumps(melody(score, BASE["female"], source), ensure_ascii=False))
        jobs.append(("notes", TAKES / f"{cid}.json", TAKES / cid, "female", "--tele", TAKES / f"{cid}.tele"))
        clips.append({"id": cid, "kind": "sing", "body": "female", "say": name, "words": spans(score)})
    for cid, text in HANDLER.items():
        jobs.append(("text", TAKES / cid, text, "female"))
        clips.append({"id": cid, "kind": "line", "body": "female", "say": text, "words": []})
    for cid, text in OFFICERS.items():
        jobs.append(("text", TAKES / cid, text, "male"))
        clips.append({"id": cid, "kind": "line", "body": "male", "say": text, "words": []})
    if only:
        # only what was asked for (a kind or an id), added to what is already there
        wanted = [c for c in clips if c["kind"] in only or c["id"] in only]
        keep = {str(TAKES / c["id"]) for c in wanted}
        jobs = [j for j in jobs if str(j[2] if j[0] == "notes" else j[1]) in keep]
        clips = wanted
    if not only:
        for name, (score, source, body) in ONESHOT.items():
            (TAKES / f"{name}.json").write_text(json.dumps(melody(score, BASE.get(body, 45), source), ensure_ascii=False))
            jobs.append(("notes", TAKES / f"{name}.json", TAKES / name, body))
            shots[name] = TAKES / f"{name}.wav"
        # the bullet's air: one long "sh"
        jobs.append(("speech", TAKES / "hiss", "ʃːːːːːː", "male"))
        shots["hiss"] = TAKES / "hiss.wav"
        jobs.append(("beatbox", TAKES / "kit", "B . K . t . Pf .", "male", 100, 1))
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: run(*j), jobs))

    for c in clips:
        cid = c["id"]
        shutil.copy(TAKES / f"{cid}.wav", GAME / f"{cid}.wav")
        c["wav"] = f"{cid}.wav"
        if (TAKES / f"{cid}.tele").exists():
            shutil.copy(TAKES / f"{cid}.tele", GAME / f"{cid}.tele")
            c["tele"] = f"{cid}.tele"
        c["start"], c["end"], c["gain"], c["peak"] = measure(GAME / c["wav"])
    # the song's phrases keep their loudness against each other: one gain, which brings the loudest to just under full
    song = [c for c in clips if c["kind"] == "sing"]
    marking = {f"female-sing-{name}": level for name, _, _, level in SONG}
    for c in song:
        c["gain"] = round(.92 / max(k["peak"] for k in song) * marking[c["id"]], 3)
    for c in clips:
        peak = c.pop("peak")
        print(f"{c['id']:24s} {c['start']:.2f}-{c['end']:.2f} s  peak {peak:.3f}  gain {c['gain']:.2f}")
    path = GAME / "manifest.json"
    if only:
        # into the manifest that is there: these in place of their old selves, or after the rest
        man = json.loads(path.read_text())
        fresh = {c["id"]: c for c in clips}
        man["clips"] = [fresh.pop(c["id"], c) for c in man["clips"]] + list(fresh.values())
        path.write_text(json.dumps(man, indent=1, ensure_ascii=False))
        print(f"{len(clips)} clips added or replaced; {len(man['clips'])} in all -> {GAME}")
        return
    kit = {}
    for name, stem in KIT.items():
        shots[name] = TAKES / "kit" / f"{stem}.wav"
    for name, src in shots.items():
        shutil.copy(src, GAME / f"kit-{name}.wav")
        start, end, gain, peak = measure(src, target=.3)
        kit[name] = {"wav": f"kit-{name}.wav", "start": start, "end": end, "gain": gain}
        print(f"kit {name:20s} {start:.2f}-{end:.2f} s  peak {peak:.3f}  gain {gain:.2f}")
    path.write_text(json.dumps({"sampleRate": SR, "clips": clips, "kit": kit}, indent=1, ensure_ascii=False))
    print(f"{len(clips)} clips, {len(kit)} kit sounds -> {GAME}")


if __name__ == "__main__":
    main()
