import { BANDS, SKILLS } from "../game/data";
import { levelFor, project, type Computed } from "../game/logic";

interface Props {
  c: Computed;
  years: number;
  path: "keep" | "slide";
  onChange(years: number, path: "keep" | "slide"): void;
  onClose(): void;
}

const band = (id: keyof typeof BANDS, lvl: number) => BANDS[id][Math.min(4, Math.floor((lvl - 1) / 20))];

// Through the Fork: the village and your character are redrawn from your projection.
export function ForkPanel({ c, years, path, onChange, onClose }: Props) {
  const rows = SKILLS.map((s) => {
    const now = levelFor(c.xp[s.id]);
    const then = levelFor(project(c.xp[s.id], path === "keep" ? c.rate[s.id] : c.oppRate[s.id], years));
    return { s, now, then };
  });
  const totalNow = rows.reduce((a, r) => a + r.now, 0),
    totalThen = rows.reduce((a, r) => a + r.then, 0);
  const year = new Date().getFullYear() + years;
  return (
    <div className={"fork-panel " + path} role="dialog" aria-label="Through the Fork">
      <div className="fk-head">
        <b>{year}</b> · {path === "keep" ? "You kept going" : "You let it slide"}
        <button className="fk-x" onClick={onClose}>
          Return to today
        </button>
      </div>
      <div className="fk-ctrl">
        {[1, 5, 10].map((y) => (
          <button key={y} aria-pressed={years === y} onClick={() => onChange(y, path)}>
            {y} {y === 1 ? "year" : "years"}
          </button>
        ))}
        <span className="fk-sep" />
        <button aria-pressed={path === "keep"} className="keep" onClick={() => onChange(years, "keep")}>
          Keep going
        </button>
        <button aria-pressed={path === "slide"} className="slide" onClick={() => onChange(years, "slide")}>
          Let it slide
        </button>
      </div>
      <div className="fk-rows">
        {rows.map(({ s, now, then }) => (
          <div key={s.id} title={`${s.name}: level ${then}. ${band(s.id, then)}`}>
            {s.ico}
            <b>{then}</b>
            <span className={then >= now ? "up" : "down"}>
              {then >= now ? "▲" : "▼"}
              {Math.abs(then - now)}
            </span>
          </div>
        ))}
      </div>
      <p className="fk-note">
        Total level {totalNow} today → <b>{totalThen}</b> in {year}.{" "}
        {path === "keep" ? "Your last 30 days, repeated." : "Every good habit dropped, every bad one kept."}
      </p>
    </div>
  );
}
