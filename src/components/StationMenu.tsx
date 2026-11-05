import { useLayoutEffect, useRef } from "react";
import { SK, type GameState, type Habit } from "../game/data";
import { VIEW_W, habitsAtStation, type Station } from "../game/world";

interface Props {
  station: Station;
  pos: { x: number; y: number }; // canvas pixels
  canvas: HTMLCanvasElement;
  state: GameState;
  viewDay: string;
  onDo(h: Habit): void;
  onUndo(s: Station): void;
  onExamine(s: Station): void;
  onClose(): void;
}

// v1 positioning: near the tap, clamped inside the canvas.
function useMenuPosition(ref: React.RefObject<HTMLDivElement | null>, canvas: HTMLCanvasElement, pos: { x: number; y: number }, dep: unknown) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / VIEW_W;
    let left = pos.x * sx - 20,
      top = pos.y * sx - 10;
    const mw = Math.min(260, r.width * 0.92);
    if (left + mw > r.width) left = r.width - mw - 4;
    if (left < 4) left = 4;
    const mh = m.offsetHeight;
    if (top + mh > r.height) top = Math.max(4, r.height - mh - 4);
    if (top < 4) top = 4;
    m.style.left = left + "px";
    m.style.top = top + "px";
  }, [ref, canvas, pos, dep]);
}

export function GroundMenu({ pos, canvas, onWalk, onClose }: { pos: { x: number; y: number }; canvas: HTMLCanvasElement; onWalk(): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuPosition(ref, canvas, pos, null);
  return (
    <div className="menu" ref={ref} style={{ minWidth: 140 }}>
      <div className="mh">Choose Option</div>
      <button onClick={onWalk}>Walk here</button>
      <button className="cancel" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

export function StationMenu({ station: s, pos, canvas, state, viewDay, onDo, onUndo, onExamine, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const habits = habitsAtStation(s, state.habits);
  const log = state.logs[viewDay] || {};

  useMenuPosition(ref, canvas, pos, habits.length);

  return (
    <div className="menu" ref={ref}>
      <div className="mh">{s.name}</div>
      {!habits.length && (
        <button className="cancel" onClick={onClose}>
          No habits here yet. Add one in the Habits tab.
        </button>
      )}
      {habits.map((h) => {
        const n = log[h.id] || 0;
        return (
          <button key={h.id} className={h.type === "neg" ? "neg" : ""} onClick={() => onDo(h)}>
            {h.name}{" "}
            <span>
              {h.type === "neg" ? "-" : "+"}
              {h.xp} {SK[h.skill].name}
              {n ? " · " + n + " today" : ""}
            </span>
          </button>
        );
      })}
      <button className="cancel" onClick={() => onUndo(s)}>
        Undo last rep here
      </button>
      <button className="cancel" onClick={() => onExamine(s)}>
        Examine
      </button>
      <button className="cancel" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
