import { useMemo, useState } from "react";
import { SK, type GameState } from "../game/data";
import { dayKey, parseKey } from "../game/logic";
import { flowFor, gp } from "../game/economy";
import { streakInfo } from "../game/rewards";

interface Props {
  state: GameState;
  onPickDay(day: string): void; // log or fix that day
  onSaveNote(day: string, text: string): void;
  onClose(): void;
}

interface DayEntry {
  name: string;
  reps: number;
  xp: number; // signed, primary + secondary
  gold: number; // signed (bank deposits count as +)
  type: "pos" | "neg";
  skills: string;
}

/** What happened on one day, from the logs. */
function dayEntries(state: GameState, day: string): DayEntry[] {
  const hm = new Map(state.habits.map((h) => [h.id, h]));
  return Object.entries(state.logs[day] || {})
    .filter(([id, n]) => hm.has(id) && n > 0)
    .map(([id, n]) => {
      const h = hm.get(id)!;
      const sign = h.type === "neg" ? -1 : 1;
      const f = flowFor(h);
      return {
        name: h.name,
        reps: n,
        xp: sign * h.xp * n,
        gold: (f.kind === "cost" ? -1 : 1) * f.amount * n,
        type: h.type,
        skills: SK[h.skill].ico + (h.skill2 ? " " + SK[h.skill2].ico : ""),
      };
    })
    .sort((a, b) => b.xp - a.xp);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Look back at any day: what you did, what it was worth, and a note to yourself.
export function CalendarPanel({ state, onPickDay, onSaveNote, onClose }: Props) {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [sel, setSel] = useState(today);
  const [draft, setDraft] = useState<string | null>(null);

  const cells = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(month.y, month.m + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(dayKey(new Date(month.y, month.m, d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const summary = (k: string) => {
    const e = dayEntries(state, k);
    const good = e.filter((x) => x.type === "pos").reduce((a, x) => a + x.xp, 0);
    const bad = Math.abs(e.filter((x) => x.type === "neg").reduce((a, x) => a + x.xp, 0));
    return { e, good, bad, net: good - bad };
  };
  const tone = (k: string) => {
    const { e, good, bad } = summary(k);
    if (!e.length) return "";
    if (bad > good) return bad > 400 ? "bad2" : "bad1";
    return good >= 1200 ? "good3" : good >= 600 ? "good2" : "good1";
  };
  const st = useMemo(() => streakInfo(state), [state]);
  const monthKeys = cells.filter(Boolean) as string[];
  const logged = monthKeys.filter((k) => summary(k).e.length);
  const monthNet = monthKeys.reduce((a, k) => a + summary(k).net, 0);
  const s = summary(sel);
  const note = draft ?? state.notes?.[sel] ?? "";
  const label = parseKey(sel).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="calendar" role="dialog" aria-label="Calendar">
      <div className="cal-head">
        <button onClick={() => setMonth((m) => (m.m ? { y: m.y, m: m.m - 1 } : { y: m.y - 1, m: 11 }))} aria-label="Previous month">
          ‹
        </button>
        <b>
          {MONTHS[month.m]} {month.y}
        </b>
        <button onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))} aria-label="Next month">
          ›
        </button>
        <span className="note">
          {logged.length} day{logged.length === 1 ? "" : "s"} logged · net {monthNet >= 0 ? "+" : ""}
          {monthNet.toLocaleString()} XP · 🔥 {st.current} day streak (best {st.best})
        </span>
        <button className="cal-x" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="cal-main">
        <div className="cal-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {cells.map((k, i) =>
            k ? (
              <button
                key={k}
                className={["day", tone(k), k === today ? "today" : "", k === sel ? "sel" : "", k > today ? "future" : ""].join(" ")}
                disabled={k > today}
                onClick={() => {
                  setSel(k);
                  setDraft(null);
                }}
              >
                <span className="n">{parseKey(k).getDate()}</span>
                {state.notes?.[k] && <span className="pin">✎</span>}
                {st.frozen.has(k) && <span className="frz" title="Covered by a streak freeze">❄</span>}
              </button>
            ) : (
              <div key={"x" + i} />
            ),
          )}
          <div className="cal-key">
            <span className="good1" /> good day <span className="good3" /> great day <span className="bad1" /> more bad than good
          </div>
        </div>
        <div className="cal-day">
          <h3>{label}</h3>
          {s.e.length ? (
            <>
              <div className="cal-tot">
                <span className="g">+{s.good.toLocaleString()} XP</span>
                {s.bad > 0 && <span className="b">−{s.bad.toLocaleString()} XP</span>}
              </div>
              <ul>
                {s.e.map((x) => (
                  <li key={x.name} className={x.type}>
                    <span>
                      {x.skills} {x.name}
                      {x.reps > 1 ? ` ×${x.reps}` : ""}
                    </span>
                    <b>
                      {x.xp > 0 ? "+" : ""}
                      {x.xp} XP · {x.gold > 0 ? "+" : ""}
                      {gp(x.gold)}
                    </b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="note">Nothing logged{sel === today ? " yet today" : ""}.</p>
          )}
          <label className="cal-note">
            Journal
            <textarea value={note} placeholder="How did the day go?" onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== null && onSaveNote(sel, draft)} rows={4} />
          </label>
          <button className="btn sm" onClick={() => onPickDay(sel)}>
            {sel === today ? "Log something for today" : "Add something I forgot for this day"}
          </button>
        </div>
      </div>
    </div>
  );
}
