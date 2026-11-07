import { useEffect, useRef, useState } from "react";
import { SeedIcon } from "./Art";
export function MiniGame({
  bonus,
  onFinish,
  onCancel,
}: {
  bonus: boolean;
  onFinish: (caught: number) => void;
  onCancel: () => void;
}) {
  const [position, setPosition] = useState(50),
    [drop, setDrop] = useState(0),
    [fall, setFall] = useState(0),
    [caught, setCaught] = useState(0),
    [done, setDone] = useState(false);
  const pos = useRef(50),
    score = useRef(0),
    area = useRef<HTMLDivElement>(null);
  const targets = useRef(
    Array.from({ length: 8 }, () => 10 + Math.random() * 80),
  );
  const move = (n: number) => {
    pos.current = Math.max(6, Math.min(94, n));
    setPosition(pos.current);
  };
  useEffect(() => {
    if (done) return;
    let start = performance.now();
    let count = 0;
    let frame: number;
    const tick = (time: number) => {
      const t = (time - start) / 1800;
      setFall(Math.min(100, t * 100));
      if (t >= 1) {
        if (Math.abs(pos.current - targets.current[count]) < 15) {
          score.current++;
          setCaught(score.current);
        }
        count++;
        setDrop(count);
        start = time;
        if (count === 8) {
          setDone(true);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [done]);
  return (
    <div className="minigame">
      <p>Move the basket under each seed. Use ← →, drag, or tap.</p>
      <div className="game-score">
        <span>
          Seeds caught <b>{caught}/8</b>
        </span>
        <span>{Math.min(drop + 1, 8)}/8 drops</span>
      </div>
      <div
        className="catch-area"
        ref={area}
        tabIndex={0}
        role="group"
        aria-label="Seed catching field. Use left and right arrow keys to move the basket."
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            move(pos.current + (e.key === "ArrowLeft" ? -8 : 8));
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          move(((e.clientX - r.left) / r.width) * 100);
        }}
        onPointerMove={(e) => {
          if (e.buttons) {
            const r = e.currentTarget.getBoundingClientRect();
            move(((e.clientX - r.left) / r.width) * 100);
          }
        }}
      >
        {!done && (
          <span
            className="falling-seed"
            style={{
              left: `${targets.current[drop]}%`,
              top: `${fall * 0.78}%`,
            }}
          >
            <SeedIcon />
          </span>
        )}
        <div
          className="basket"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        >
          ▰
        </div>
        {done && (
          <div className="game-done">
            <b>
              {caught === 8
                ? "A perfect little harvest!"
                : "Nice catching, little paws."}
            </b>
            <span>
              +{caught} seeds · +{caught * (bonus ? 5 : 3)} care XP
            </span>
          </div>
        )}
      </div>
      <div className="game-arrows">
        <button
          className="button"
          aria-label="Move basket left"
          onClick={() => move(pos.current - 12)}
        >
          ← Left
        </button>
        <button
          className="button"
          aria-label="Move basket right"
          onClick={() => move(pos.current + 12)}
        >
          Right →
        </button>
      </div>
      {bonus && (
        <p className="notice">Real wheel activity bonus: 5 XP per seed.</p>
      )}
      <button
        className="button primary full"
        disabled={!done}
        onClick={() => onFinish(caught)}
      >
        Collect {caught} seeds
      </button>
      <button className="text-button full" onClick={onCancel}>
        Leave game
      </button>
    </div>
  );
}
