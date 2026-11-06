import { useLayoutEffect, useRef, useState } from "react";
import { SK, type GameState, type Habit } from "../game/data";
import { VIEW_W, habitsAtStation, type Station } from "../game/world";
import { focusAt } from "../game/sessions";

interface Props {
  station: Station;
  pos: { x: number; y: number }; // canvas pixels
  canvas: HTMLCanvasElement;
  state: GameState;
  viewDay: string;
  onDo(h: Habit, note: string): void;
  onUndo(s: Station): void;
  onExamine(s: Station): void;
  onFocus?(s: Station): void;
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

export function StationMenu({ station: s, pos, canvas, state, viewDay, onDo, onUndo, onExamine, onFocus, onClose }: Props) {
  const focus = focusAt(s.id);
  const ref = useRef<HTMLDivElement>(null);
  const habits = habitsAtStation(s, state.habits);
  const log = state.logs[viewDay] || {};
  const [confirm, setConfirm] = useState<Habit | null>(null);
  const [note, setNote] = useState("");
  const today = new Date();
  const todayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const when = viewDay === todayKey ? "today" : "on " + new Date(viewDay + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  useMenuPosition(ref, canvas, pos, habits.length + (confirm ? 3 : 0));

  if (confirm)
    return (
      <div className="menu confirm" ref={ref}>
        <div className="mh">Did you really do this?</div>
        <p className="cf-q">
          <b>{confirm.name}</b>, {when}.{" "}
          {confirm.type === "neg" ? "Logging it honestly is what keeps your future accurate." : "XP only counts for things you actually did."}
        </p>
        <input className="cf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" maxLength={140} />
        <button className={confirm.type === "neg" ? "neg" : "yes"} onClick={() => onDo(confirm, note.trim())}>
          {confirm.type === "neg" ? "Yes, I did it. Log it honestly" : "Yes, I really did it"}
        </button>
        <button className="cancel" onClick={() => setConfirm(null)}>
          No, go back
        </button>
      </div>
    );

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
          <button key={h.id} className={h.type === "neg" ? "neg" : ""} onClick={() => setConfirm(h)}>
            {h.name}{" "}
            <span>
              {h.type === "neg" ? "-" : "+"}
              {h.xp} {SK[h.skill].name}
              {n ? " · " + n + " today" : ""}
            </span>
          </button>
        );
      })}
      {focus && onFocus && (
        <button className="focus" onClick={() => onFocus(s)}>
          ⏱ Timed {focus.label.toLowerCase()} session… <span>you do it for real, the timer logs it</span>
        </button>
      )}
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
