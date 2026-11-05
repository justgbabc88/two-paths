import type { GameState } from "../game/data";
import { QUESTS, daysLeft, questPoints, statusOf, stepProgress, type Quest } from "../game/quests";
import { WANDERERS } from "../game/wanderers";

interface Props {
  state: GameState;
  onToggleTask(q: Quest, index: number): void;
  onAbandon(q: Quest): void;
}

const giver = (q: Quest) => WANDERERS.find((w) => w.id === q.giver)!;
const where: Record<string, string> = {
  marta: "near the gold mine",
  aldous: "by the standing stone",
  pip: "around the market",
  wen: "near the library",
  garrick: "by the training yard",
  nell: "near the cottage",
  tamsin: "wandering the village",
};

// The quest journal: what you're working on, what's on offer, what's done.
export function QuestsPane({ state, onToggleTask, onAbandon }: Props) {
  const active = QUESTS.filter((q) => statusOf(state, q) === "active");
  const available = QUESTS.filter((q) => statusOf(state, q) === "available");
  const done = QUESTS.filter((q) => statusOf(state, q) === "complete");
  return (
    <>
      <div className="qp-head">
        Quest points <b>{questPoints(state.quests)}</b>
        <span>
          {done.length}/{QUESTS.length} complete
        </span>
      </div>
      <h2 className="s">In progress</h2>
      {!active.length && <p className="note">None yet. Talk to a wanderer with a gold ! over their head.</p>}
      {active.map((q) => {
        const rec = state.quests![q.id];
        const left = daysLeft(rec, q);
        return (
          <div className="quest" key={q.id}>
            <div className="qname">
              {q.name} <span>from {giver(q).name}</span>
            </div>
            <div className="qwhy">{q.why}</div>
            <ul className="qsteps">
              {q.steps.map((s, i) => {
                const p = stepProgress(state, rec, s, i);
                return (
                  <li key={i} className={p.done ? "done" : ""}>
                    {s.kind === "task" ? (
                      <label>
                        <input type="checkbox" checked={p.done} onChange={() => onToggleTask(q, i)} /> {s.text}
                      </label>
                    ) : (
                      <>
                        <span className="qtick">{p.done ? "✔" : "○"}</span> {s.text}
                        <span className="qprog">
                          {p.value}/{p.target}
                          {s.kind === "reps" ? "" : " days"}
                        </span>
                        <span className="qbar">
                          <i style={{ width: (100 * p.value) / p.target + "%" }} />
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="qfoot">
              <span>{left > 0 ? `${left} day${left === 1 ? "" : "s"} left in the window` : "Past the window, but you can still finish"}</span>
              <button className="btn sm" onClick={() => confirm(`Abandon "${q.name}"? Progress on it will be lost.`) && onAbandon(q)}>
                Abandon
              </button>
            </div>
          </div>
        );
      })}
      <h2 className="s">On offer</h2>
      {!available.length && <p className="note">Nothing new right now. Finish what you've started to unlock more.</p>}
      {available.map((q) => (
        <div className="qoffer" key={q.id}>
          <b>{q.name}</b> · {q.points} QP
          <div className="note">
            Talk to {giver(q).name} {where[q.giver]}.
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <h2 className="s">Completed</h2>
          {done.map((q) => (
            <div className="qoffer done" key={q.id}>
              ✔ {q.name} · {q.points} QP <span className="note">({state.quests![q.id].done})</span>
            </div>
          ))}
        </>
      )}
      <p className="note">Quests come from the wanderers. Tasks you tick yourself; reps, streaks and clean days fill in from your logs.</p>
    </>
  );
}
