/**
 * The game's page: the game's canvas with a card over it before the first
 * contract, while it is paused and when a contract is decided. The card's button is the user
 * gesture that starts the audio and captures the mouse.
 *
 * On a touch screen there is no mouse to take and no keys: a finger on the view aims (the game's
 * own doing), and the buttons here fire, hold the breath, zoom and pause. The breath and the rounds
 * are shown on the buttons that spend them.
 *
 * The voices are rendered ahead of time (`sounds/compose.py`) and kept in `public/shows/sniper/`.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Game, type Snapshot } from "./game.ts";
import "./sniper.css";

/** "THE POOL" as it reads in a sentence */
const place = (name: string) => name.toLowerCase();
const LOST = { wrong: "Wrong target", gone: "Target lost", empty: "Out of rounds", down: "" };

/** whether this is played with fingers: a touch screen as the main pointer, or a touch has been seen */
function useTouch(): boolean {
  const [touch, setTouch] = useState(() => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const seen = () => setTouch(true);
    window.addEventListener("touchstart", seen, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", seen);
  }, []);
  return touch;
}

/**
 * A touch screen's buttons, under the thumbs: on the left the breath (held for as long as the
 * button is) and pause; on the right the zoom and the trigger.
 */
function Pad({ game }: { game: Game }) {
  const root = useRef<HTMLDivElement>(null), air = useRef<HTMLSpanElement>(null), note = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // what the buttons show changes every frame: written straight to them, not through React
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = root.current, g = game.gauges;
      if (!el) return;
      const breath = g.spent ? "spent" : g.holding ? "holding" : "ready", says = g.spent ? "Out of breath" : g.holding ? "Holding" : "Hold";
      if (el.dataset.breath !== breath) el.dataset.breath = breath;
      if (el.dataset.rounds !== String(g.rounds)) el.dataset.rounds = String(g.rounds);
      if (el.dataset.busy !== String(g.busy)) el.dataset.busy = String(g.busy);
      if (air.current) air.current.style.width = `${Math.round(g.air * 100)}%`;
      if (note.current && note.current.textContent !== says) note.current.textContent = says;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  /** a button that acts when the finger lands (not when it lifts), and may act again when it leaves */
  const press = (down: () => void, up?: () => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        // keep the finger's later moves coming here even if it slides off (some pointers cannot be captured)
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // then lifting it elsewhere is missed, and the next touch puts it right
      }
      down();
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
  });
  return (
    <div className="sniper-pad" ref={root} data-layout="overlay">
      <div className="sniper-pad-side">
        <button className="sniper-pad-small" aria-label="Pause" {...press(() => game.pause())}>
          II
        </button>
        <button className="sniper-pad-breath" aria-label="Hold your breath" {...press(() => game.breathe(true), () => game.breathe(false))}>
          <span>Breath</span>
          <span className="sniper-pad-air">
            <span ref={air} />
          </span>
          <span className="sniper-pad-note" ref={note}>
            Hold
          </span>
        </button>
      </div>
      <div className="sniper-pad-side right">
        <div className="sniper-pad-zoom">
          <button aria-label="Zoom out" {...press(() => game.zoomStep(-1))}>
            −
          </button>
          <button aria-label="Zoom in" {...press(() => game.zoomStep(1))}>
            +
          </button>
        </div>
        <button className="sniper-pad-fire" aria-label="Fire" {...press(() => game.fire())}>
          <span>Fire</span>
          <span className="sniper-pad-rounds">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>
    </div>
  );
}

export function SniperPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot>({ phase: "menu", contract: 0, score: 0, locked: false, result: null, target: "", place: "", next: "", lost: "" });
  const [loaded, setLoaded] = useState({ done: 0, of: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false, made: Game | null = null;
    Game.create(canvasRef.current!, `${import.meta.env.BASE_URL}shows/sniper/`, setSnap, (done, of) => !gone && setLoaded({ done, of }))
      .then((g) => {
        if (gone) return g.dispose();
        made = g;
        g.showStats = new URLSearchParams(window.location.search).has("stats");
        // a handle for the console and the browser checks
        (window as unknown as { __sniper: Game }).__sniper = g;
        setGame(g);
      })
      .catch((e: unknown) => !gone && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      made?.dispose();
    };
  }, []);

  const touch = useTouch();
  useEffect(() => {
    if (game) game.touch = touch;
  }, [game, touch]);

  const { phase, result } = snap;
  return (
    <div className="fps">
      <canvas ref={canvasRef} aria-label="The game: people a long way off, seen through a rifle scope" role="img" />
      {game && touch && phase === "playing" && <Pad game={game} />}
      {phase !== "playing" && (
        <div className="fps-card sniper-card" data-layout="overlay">
          <span className="wordmark">Chimera</span>
          <h1>{phase === "won" ? "Target down" : phase === "failed" && result ? LOST[result.kind] : phase === "paused" ? "Paused" : "One Breath"}</h1>
          {error ? (
            <p className="error">
              The game could not load: {error}. Reloading the page usually fixes it.
            </p>
          ) : phase === "won" && result ? (
            <p>
              Contract {snap.contract}, {place(snap.place)}: {result.head ? "a head shot" : "a body shot"} after {result.seconds.toFixed(0)} seconds at the scope. {result.points} points, {snap.score} in all. Next: {place(snap.next)}.
            </p>
          ) : phase === "failed" && result ? (
            <p>
              {result.kind === "wrong" ? `The handler said: ${snap.target.toLowerCase()}. That was somebody else.` : result.kind === "gone" ? snap.lost : "Three rounds, and the target is still breathing."} Score {snap.score}.
            </p>
          ) : phase === "paused" ? (
            <p>
              Contract {snap.contract}, {place(snap.place)}. Target: {snap.target.toLowerCase()}.
            </p>
          ) : (
            <p>Five contracts: a lit condo, a rooftop pool, the steps of a grand building, a café seen from a moving car, a camp in the woods. A few people in each, and one of them is yours. Every sound is a simulated throat: their talk, the trigger, the bullet, your own breath.</p>
          )}
          {!error && (
            <button className="primary large" disabled={!game} onClick={() => game?.start()}>
              {!game ? `Loading the throats… ${loaded.done} / ${loaded.of || "?"}` : phase === "won" ? "Next contract" : phase === "failed" ? "Try again" : phase === "paused" ? "Resume" : "Start"}
            </button>
          )}
          <p className="hint">
            {touch
              ? "Drag a finger over the view to aim. Pinch, or use + and −, to zoom. Hold BREATH to steady the crosshair, then FIRE. Three rounds."
              : "Mouse to aim, wheel (or Z and X) to zoom, Shift to hold your breath, click or Space to fire. Esc pauses. Three rounds."}
          </p>
        </div>
      )}
    </div>
  );
}
