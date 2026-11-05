import { useState } from "react";
import { SK, SKILLS, type GameState, type Habit, type HabitType, type SkillId } from "../game/data";
import { dayKey, parseKey } from "../game/logic";

interface Props {
  state: GameState;
  viewDay: string;
  onShiftDay(delta: number): void;
  onAdd(h: Omit<Habit, "id">): void;
  onRemove(h: Habit): void;
  onSeed(): void;
  onTheme(): void;
  onReset(): void;
  onImport(json: string): void;
  onSignOut?: () => void;
}

export function dayLabel(viewDay: string): string {
  const today = dayKey(new Date()),
    yest = dayKey(new Date(Date.now() - 864e5));
  return viewDay === today ? "Today" : viewDay === yest ? "Yesterday" : parseKey(viewDay).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HabitsPane(p: Props) {
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillId>(SKILLS[0].id);
  const [skill2, setSkill2] = useState<SkillId | "">("");
  const [xp, setXp] = useState("100");
  const [type, setType] = useState<HabitType>("pos");
  const [importText, setImportText] = useState("");
  const log = p.state.logs[p.viewDay] || {};
  const today = dayKey(new Date());

  const add = () => {
    const n = name.trim();
    if (!n) {
      document.getElementById("fName")?.focus();
      return;
    }
    const x = Math.max(1, Math.min(5000, Number(xp) || 100));
    p.onAdd({ name: n, skill, skill2: skill2 === skill ? "" : skill2, xp: x, type });
    setName("");
  };

  return (
    <>
      <div className="daysel">
        Logging for <button onClick={() => p.onShiftDay(-1)}>‹</button>
        <b>{dayLabel(p.viewDay)}</b>
        <button onClick={() => p.onShiftDay(1)} disabled={p.viewDay >= today}>
          ›
        </button>
      </div>
      <h2 className="s">Add a habit</h2>
      <div className="form">
        <label>
          Name
          <input id="fName" placeholder="Cold calls" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row2">
          <label>
            Skill
            <select value={skill} onChange={(e) => setSkill(e.target.value as SkillId)}>
              {SKILLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ico} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Also trains
            <select value={skill2} onChange={(e) => setSkill2(e.target.value as SkillId | "")}>
              <option value="">none</option>
              {SKILLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ico} {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row2">
          <label>
            XP per rep
            <input type="number" min={1} max={5000} value={xp} onChange={(e) => setXp(e.target.value)} />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as HabitType)}>
              <option value="pos">Builds you up</option>
              <option value="neg">Tears you down</option>
            </select>
          </label>
        </div>
        <div>
          <button className="btn primary" onClick={add}>
            Add habit
          </button>
        </div>
        <p className="note">A rep that would change your year is 500+. A small one is 25. Tear-down habits live at the tavern.</p>
      </div>
      <h2 className="s">Your habits</h2>
      <div>
        {p.state.habits.length ? (
          p.state.habits.map((h) => (
            <div className="hrow" key={h.id}>
              <div className="meta">
                <div>
                  {h.name}
                  {log[h.id] ? <span style={{ color: "var(--gold2)" }}> ×{log[h.id]}</span> : null}
                </div>
                <div className="sub">
                  {h.type === "neg" ? "Tears down" : "Builds"} {SK[h.skill].name}
                  {h.skill2 ? " (+" + SK[h.skill2].name + ")" : ""} · {h.xp} XP
                </div>
              </div>
              <button className="btn sm" onClick={() => p.onRemove(h)}>
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="note">Nothing here yet. Load the starter set below.</div>
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={p.onSeed}>
          Add starter habits
        </button>
        <button className="btn sm" onClick={p.onTheme}>
          Toggle theme
        </button>
        <button className="btn sm danger" onClick={p.onReset}>
          Reset everything
        </button>
        {p.onSignOut && (
          <button className="btn sm" onClick={p.onSignOut}>
            Sign out
          </button>
        )}
      </div>
      <p className="note">
        XP follows the RuneScape curve. Level 99 is about 13 million XP. Each skill rusts 100 XP on any day you don't train it. "Let it slide" assumes you drop every good habit and keep every bad one.
      </p>
      <details className="import">
        <summary>Import v1 data</summary>
        <p className="note">Paste the JSON saved by the old artifact (its localStorage key is "twopaths"). This replaces everything here.</p>
        <textarea rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"habits":[...],"logs":{...},"created":"...","v":1}' />
        <button
          className="btn sm"
          onClick={() => {
            p.onImport(importText);
            setImportText("");
          }}
        >
          Import
        </button>
      </details>
    </>
  );
}
