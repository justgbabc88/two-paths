import { useEffect, useState } from "react";
import { FOCUS, FOCUS_KINDS, creditedLength, fmtClock, type FocusKind, type Session } from "../game/sessions";

/** Pick what to focus on and for how long. */
export function FocusPicker({ start, onStart, onClose }: { start?: FocusKind; onStart(kind: FocusKind, min: number): void; onClose(): void }) {
  const [kind, setKind] = useState<FocusKind>(start ?? "deep");
  const f = FOCUS[kind];
  return (
    <div className="focus-pick" role="dialog" aria-label="Start a focus session">
      <div className="fp-head">
        <b>⏱ Focus session</b>
        <button className="fp-x" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="fp-kinds">
        {FOCUS_KINDS.map((k) => (
          <button key={k.kind} aria-pressed={k.kind === kind} onClick={() => setKind(k.kind)}>
            <span>{k.ico}</span> {k.label}
          </button>
        ))}
      </div>
      <p className="note">{f.blurb}</p>
      <div className="fp-lengths">
        {f.lengths.map((l) => (
          <button key={l.min} onClick={() => onStart(kind, l.min)}>
            <b>{l.min >= 60 && l.min % 60 === 0 ? `${l.min / 60} hr` : `${l.min} min`}</b>
            <small>+{l.xp} XP</small>
          </button>
        ))}
      </div>
      <p className="note">
        Do it for real while the timer runs. When it ends you hear a bell and it's logged for you. Stop early and you're credited for the longest length you finished.
      </p>
    </div>
  );
}

/** The running timer, shown over the world. */
export function FocusTimer({ session, onDone, onEnd }: { session: Session; onDone(): void; onEnd(): void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const f = FOCUS[session.kind];
  const total = session.min * 60;
  const elapsed = Math.min(total, Math.floor((now - session.start) / 1000));
  const left = total - elapsed;
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);
  useEffect(() => {
    const old = document.title;
    document.title = `${f.ico} ${fmtClock(left)} · Two Paths`;
    return () => {
      document.title = old;
    };
  }, [left, f.ico]);
  const credit = creditedLength(session.kind, elapsed);
  const phase = elapsed % 12;
  return (
    <div className={"focus-timer " + session.kind}>
      <div className="ft-top">
        <span>
          {f.ico} {f.label} · {session.min} min
        </span>
        {session.kind === "meditate" && <i>{phase < 4 ? "Breathe in" : phase < 8 ? "Hold" : "Breathe out"}</i>}
      </div>
      <div className="ft-clock">{fmtClock(left)}</div>
      <div className="ft-bar">
        <div style={{ width: (elapsed / total) * 100 + "%" }} />
      </div>
      <button
        onClick={() => {
          if (confirm(credit ? `End now? It will be logged as ${credit.min} minutes.` : `End now? Under ${f.lengths[0].min} minutes isn't logged.`)) onEnd();
        }}
      >
        {credit ? `End (counts as ${credit.min} min)` : "End early"}
      </button>
    </div>
  );
}
