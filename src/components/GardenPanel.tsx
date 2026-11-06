import { useEffect, useRef, useState } from "react";
import type { Garden, GameState, Habit } from "../game/data";
import { DEFAULT_GARDEN, GARDEN_ASPECT, MAX_STONES, MAX_STROKES, drawGarden, leavesFor } from "../game/garden";
import { actionFor } from "../game/actions";
import { dayKey } from "../game/logic";
import { SITS, bell, creditedSit } from "../game/meditation";

interface Props {
  state: GameState;
  onSave(g: Garden): void;
  onMeditate(h: Habit): void;
  onSitStart(min: number): void;
  /** A timed sit ended: `min` is the length credited, or null if under 5 minutes. */
  onSitEnd(min: number | null): void;
  onClose(): void;
}
type Tool = "rake" | "smooth" | "stones";

const W = 600,
  H = Math.round(W / GARDEN_ASPECT);
const round = (n: number) => Math.round(n * 1000) / 1000;

// Rake the sand, move the stones, sweep up the leaves. Then sit.
export function GardenPanel({ state, onSave, onMeditate, onSitStart, onSitEnd, onClose }: Props) {
  const [sit, setSit] = useState<{ min: number; start: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sit) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [sit]);
  const elapsed = sit ? Math.floor((now - sit.start) / 1000) : 0;
  const finish = (early: boolean) => {
    if (!sit) return;
    const credit = early ? creditedSit(elapsed) : SITS.find((x) => x.min === sit.min)!;
    bell();
    setSit(null);
    onSitEnd(credit ? credit.min : null);
  };
  useEffect(() => {
    if (sit && elapsed >= sit.min * 60) finish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);
  const [g, setG] = useState<Garden>(() => structuredClone(state.garden ?? DEFAULT_GARDEN));
  const [tool, setTool] = useState<Tool>("rake");
  const [sitting, setSitting] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ stroke: number[] | null; stone: number | null; moved: boolean }>({ stroke: null, stone: null, moved: false });
  const leaves = leavesFor(g, state.created);
  const meditations = state.habits.filter((h) => h.type === "pos" && actionFor(h) === "meditate");

  const paint = (garden: Garden) => {
    const c = cv.current;
    if (!c) return;
    drawGarden(c.getContext("2d")!, c.width, c.height, garden, leavesFor(garden, state.created));
  };
  useEffect(() => paint(g));

  const save = (next: Garden) => {
    setG(next);
    onSave(next);
  };
  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const stoneAt = (x: number, y: number) => g.stones.findIndex((s) => Math.hypot((s.x - x) * GARDEN_ASPECT, s.y - y) < 0.07 * s.s + 0.02);

  const down = (e: React.PointerEvent) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    if (tool === "rake") live.current.stroke = [round(p.x), round(p.y)];
    else if (tool === "stones") {
      const i = stoneAt(p.x, p.y);
      if (i >= 0) live.current = { ...live.current, stone: i, moved: false };
      else if (g.stones.length < MAX_STONES) save({ ...g, stones: [...g.stones, { x: round(p.x), y: round(p.y), s: 0.6 + Math.random() * 0.5 }] });
    } else smoothAt(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    const p = pos(e);
    const L = live.current;
    if (tool === "rake" && L.stroke) {
      const lx = L.stroke[L.stroke.length - 2],
        ly = L.stroke[L.stroke.length - 1];
      if (Math.hypot((p.x - lx) * GARDEN_ASPECT, p.y - ly) > 0.012) {
        L.stroke.push(round(p.x), round(p.y));
        paint({ ...g, strokes: [...g.strokes, L.stroke] });
      }
    } else if (tool === "stones" && L.stone !== null) {
      L.moved = true;
      const stones = g.stones.map((s, i) => (i === L.stone ? { ...s, x: round(p.x), y: round(p.y) } : s));
      setG({ ...g, stones });
    } else if (tool === "smooth" && e.buttons) smoothAt(p.x, p.y);
  };
  const up = () => {
    const L = live.current;
    if (tool === "rake" && L.stroke) {
      if (L.stroke.length >= 6) save({ ...g, strokes: [...g.strokes, L.stroke].slice(-MAX_STROKES) });
      L.stroke = null;
    }
    if (tool === "stones" && L.stone !== null) {
      if (!L.moved) save({ ...g, stones: g.stones.filter((_, i) => i !== L.stone) }); // tap a stone to lift it out
      else onSave(g);
      live.current = { ...L, stone: null, moved: false };
    }
  };
  const smoothAt = (x: number, y: number) => {
    const keep = g.strokes.filter((pts) => {
      for (let i = 0; i < pts.length; i += 2) if (Math.hypot((pts[i] - x) * GARDEN_ASPECT, pts[i + 1] - y) < 0.05) return false;
      return true;
    });
    if (keep.length !== g.strokes.length) save({ ...g, strokes: keep });
  };

  return (
    <div className={"garden" + (sit ? " sitting" : "")} role="dialog" aria-label="Zen garden">
      <div className="gd-head">
        <b>Zen garden</b>
        <span className="note">{leaves.length ? `${leaves.length} leaves have fallen since you last tended it.` : "Swept and still."}</span>
        <button
          className="gd-x"
          onClick={() => {
            if (sit && !confirm("End your sit now? You'll be credited for the longest session length you completed.")) return;
            if (sit) finish(true);
            onClose();
          }}
        >
          Leave
        </button>
      </div>
      {sit ? (
        <SitView min={sit.min} elapsed={elapsed} onEnd={() => finish(true)} />
      ) : (
        <>
      <div className="gd-tools">
        {(["rake", "smooth", "stones"] as Tool[]).map((t) => (
          <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)}>
            {t === "rake" ? "Rake" : t === "smooth" ? "Smooth" : "Stones"}
          </button>
        ))}
        <span className="gd-sep" />
        <button disabled={!leaves.length} onClick={() => save({ ...g, tended: dayKey(new Date()) })}>
          Sweep leaves
        </button>
        <button disabled={!g.strokes.length} onClick={() => confirm("Smooth the whole garden flat?") && save({ ...g, strokes: [] })}>
          Smooth all
        </button>
        <button className="sit" onClick={() => setSitting((v) => !v)}>
          Sit and meditate
        </button>
      </div>
      <div className="gd-bed">
        <canvas ref={cv} width={W * 2} height={H * 2} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: tool === "stones" ? "grab" : "crosshair" }} />
      </div>
      <p className="note gd-hint">
        {tool === "rake" && "Drag across the sand to rake lines. Slow curves look best."}
        {tool === "smooth" && "Drag over lines to smooth them away."}
        {tool === "stones" && `Tap empty sand to place a stone (up to ${MAX_STONES}), drag a stone to move it, tap one to lift it out.`}
      </p>
      {sitting && (
        <div className="gd-sit">
          <span className="gd-sit-label">Sit for</span>
          {SITS.map((x) => (
            <button
              key={x.min}
              className="len"
              onClick={() => {
                setSitting(false);
                bell();
                setSit({ min: x.min, start: Date.now() });
                onSitStart(x.min);
              }}
            >
              {x.min} min <small>+{x.xp} XP</small>
            </button>
          ))}
          <span className="gd-sit-label">or log one you did elsewhere:</span>
          {meditations.length ? (
            meditations.map((h) => (
              <button key={h.id} onClick={() => confirm(`Did you really do this today: ${h.name}? XP only counts for things you actually did.`) && onMeditate(h)}>
                {h.name}
              </button>
            ))
          ) : (
            <span className="note">none yet (the library's Mind group has some)</span>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The breathing guide: in for 4, hold for 4, out for 4. */
function SitView({ min, elapsed, onEnd }: { min: number; elapsed: number; onEnd(): void }) {
  const left = Math.max(0, min * 60 - elapsed);
  const phase = elapsed % 12;
  const cue = phase < 4 ? "Breathe in" : phase < 8 ? "Hold" : "Breathe out";
  const credit = creditedSit(elapsed);
  return (
    <div className="gd-sitview">
      <div className="breath" />
      <div className="cue">{cue}</div>
      <div className="clock">{fmtTime(left)}</div>
      <p className="note">
        A {min}-minute sit. Your character sits in the garden with you. When the bell rings it's logged for you.
      </p>
      <button onClick={onEnd}>{credit ? `End early (counts as ${credit.min} min)` : "End early (under 5 minutes isn't logged)"}</button>
    </div>
  );
}
