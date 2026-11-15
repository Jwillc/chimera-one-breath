/**
 * The game's page: the game's canvas with a card over it before the first
 * contract, while it is paused and when a contract is decided. The card's button is the user
 * gesture that starts the audio and captures the mouse.
 *
 * The voices are rendered ahead of time (`sounds/compose.py`) and kept in `public/shows/sniper/`.
 */
import { useEffect, useRef, useState } from "react";
import { Game, type Snapshot } from "./game.ts";
import "./sniper.css";

/** "THE POOL" as it reads in a sentence */
const place = (name: string) => name.toLowerCase();
const LOST = { wrong: "Wrong target", gone: "Target lost", empty: "Out of rounds", down: "" };

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

  const { phase, result } = snap;
  return (
    <div className="fps">
      <canvas ref={canvasRef} aria-label="The game: people a long way off, seen through a rifle scope" role="img" />
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
          <p className="hint">Mouse to aim, wheel (or Z and X) to zoom, Shift to hold your breath, click or Space to fire. Esc pauses. Three rounds.</p>
        </div>
      )}
    </div>
  );
}
