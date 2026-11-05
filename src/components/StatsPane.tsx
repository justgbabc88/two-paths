import { BANDS, SK, SKILLS, type GameState, type SkillId } from "../game/data";
import { XP, XP99, fmt, levelFor, streak, type Computed } from "../game/logic";

interface Props {
  state: GameState;
  c: Computed;
  selected: SkillId | null;
  onSelect(id: SkillId): void;
}

export function StatsPane({ state, c, selected, onSelect }: Props) {
  const total = SKILLS.reduce((a, s) => a + levelFor(c.xp[s.id]), 0);
  return (
    <>
      <div className="stats">
        {SKILLS.map((s) => {
          const xp = c.xp[s.id],
            l = levelFor(xp);
          const lo = XP[l - 1],
            hi = l < 99 ? XP[l] : XP99;
          const pct = l < 99 ? ((xp - lo) / (hi - lo)) * 100 : 100;
          return (
            <button key={s.id} className="stat" onClick={() => onSelect(s.id)}>
              <div className="ico">{s.ico}</div>
              <div className="meta">
                <div className="nm">{s.name}</div>
                <div className="lv">
                  {l}
                  <small>/99</small>
                </div>
                <div className="bar">
                  <i style={{ width: pct.toFixed(1) + "%" }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="totals">
        <div>
          Total<b>{total}</b>
        </div>
        <div>
          Days trained<b>{c.daysTrained}</b>
        </div>
      </div>
      {selected && <Detail state={state} c={c} id={selected} />}
    </>
  );
}

function Detail({ state, c, id }: { state: GameState; c: Computed; id: SkillId }) {
  const s = SK[id],
    xp = c.xp[s.id],
    l = levelFor(xp),
    next = l < 99 ? XP[l] - xp : 0,
    band = Math.min(4, Math.floor((l - 1) / 20));
  const habits =
    state.habits
      .filter((h) => h.skill === s.id || h.skill2 === s.id)
      .map((h) => {
        const st = h.type === "pos" ? streak(state, h.id) : 0;
        return h.name + (st > 0 ? " (" + st + "d)" : "");
      })
      .join(", ") || "none yet";
  return (
    <div className="detail">
      <h3>
        {s.ico} {s.name}
      </h3>
      <div className="kv">
        <span>
          XP <b>{fmt(xp)}</b>
        </span>
        <span>
          To next <b>{fmt(next)}</b>
        </span>
        <span>
          Pace{" "}
          <b>
            {c.rate[s.id] >= 0 ? "+" : ""}
            {fmt(c.rate[s.id])}/day
          </b>
        </span>
      </div>
      <div className="kv">
        <span>Trained by: {habits}</span>
      </div>
      <ul className="bands">
        {BANDS[s.id].map((t, i) => (
          <li key={i} className={i === band ? "cur" : ""}>
            <span>
              {i * 20 + 1}-{i === 4 ? 99 : i * 20 + 20}
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
