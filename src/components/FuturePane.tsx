import { BANDS, SKILLS } from "../game/data";
import { fmt, levelFor, project, type Computed } from "../game/logic";

interface Props {
  c: Computed;
  horizon: number;
  onHorizon(y: number): void;
}

const band = (id: keyof typeof BANDS, lvl: number) => BANDS[id][Math.min(4, Math.floor((lvl - 1) / 20))];

export function FuturePane({ c, horizon, onHorizon }: Props) {
  let upT = 0,
    dnT = 0;
  const rows = SKILLS.map((s) => {
    const now = levelFor(c.xp[s.id]),
      up = levelFor(project(c.xp[s.id], c.rate[s.id], horizon)),
      dn = levelFor(project(c.xp[s.id], c.oppRate[s.id], horizon));
    upT += up;
    dnT += dn;
    return { s, now, up, dn };
  });
  const upR = SKILLS.reduce((a, s) => a + c.rate[s.id], 0),
    dnR = SKILLS.reduce((a, s) => a + c.oppRate[s.id], 0);
  return (
    <>
      <div className="horizon">
        {[1, 5, 10].map((y) => (
          <button key={y} aria-pressed={horizon === y} onClick={() => onHorizon(y)}>
            {y} {y === 1 ? "year" : "years"}
          </button>
        ))}
      </div>
      <div className="paths">
        <div className="path up">
          <h3>Keep going</h3>
          <div className="big">
            {upT} <small>total</small>
          </div>
          <div className="rate">
            {upR >= 0 ? "+" : ""}
            {fmt(upR)} XP/day now
          </div>
        </div>
        <div className="path down">
          <h3>Let it slide</h3>
          <div className="big">
            {dnT} <small>total</small>
          </div>
          <div className="rate">{fmt(dnR)} XP/day if you stop</div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="prow" style={{ borderTop: 0, color: "var(--muted)", fontSize: 12 }}>
          <div>Skill</div>
          <div>Keep</div>
          <div>Slide</div>
        </div>
        {rows.map(({ s, now, up, dn }) => (
          <div className="prow" key={s.id}>
            <div>
              {s.ico} {s.name} <span style={{ color: "var(--muted)", fontSize: 12 }}>now {now}</span>
            </div>
            <div className="l up">{up}</div>
            <div className="l down">{dn}</div>
            <div className="desc">
              <em>Keep going:</em> {band(s.id, up)}
              <br />
              <em>Let it slide:</em> {band(s.id, dn)}
            </div>
          </div>
        ))}
      </div>
      <p className="note">
        {c.days < 7
          ? `Based on ${c.days} day${c.days === 1 ? "" : "s"} of data. Gets honest after a couple of weeks.`
          : `Based on your last ${c.days} days. The gap is the slight edge.`}
      </p>
    </>
  );
}
