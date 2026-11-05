// Game math, ported line-for-line from v1. The only change is that functions
// take `state` as a parameter instead of reading a module-level global.
// Do not change the XP curve, decay, rolling window or projection here
// without meaning to change the game.
import { DECAY, SKILLS, WINDOW, type GameState, type Habit, type SkillId } from "./data";

// RuneScape XP table. XP[l-1] is the XP needed for level l.
export const XP: number[] = [0];
(function () {
  let p = 0;
  for (let n = 1; n < 99; n++) {
    p += Math.floor(n + 300 * Math.pow(2, n / 7));
    XP.push(Math.floor(p / 4));
  }
})();
export const XP99 = XP[98];

export const levelFor = (xp: number): number => {
  let l = 1;
  while (l < 99 && xp >= XP[l]) l++;
  return l;
};
export const fmt = (n: number): string => Math.round(n).toLocaleString();
export const dayKey = (d: Date): string =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const parseKey = (k: string): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const uid = (): string => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const emptyState = (): GameState => ({ habits: [], logs: {}, created: dayKey(new Date()), v: 1 });

type SkillMap<T> = Record<SkillId, T>;

function habitMap(state: GameState): Record<string, Habit> {
  const m: Record<string, Habit> = {};
  state.habits.forEach((h) => (m[h.id] = h));
  return m;
}

export function earnedOnDay(state: GameState, key: string): SkillMap<{ pos: number; neg: number }> {
  const out = {} as SkillMap<{ pos: number; neg: number }>;
  SKILLS.forEach((s) => (out[s.id] = { pos: 0, neg: 0 }));
  const log = state.logs[key] || {};
  const hm = habitMap(state);
  for (const hid in log) {
    const h = hm[hid];
    const c = log[hid];
    if (!h || !c) continue;
    const sign = h.type === "neg" ? -1 : 1;
    const primary = h.skill2 ? 0.8 : 1;
    const add = (sk: string, amt: number) => {
      const o = out[sk as SkillId];
      if (!o) return;
      if (amt >= 0) o.pos += amt;
      else o.neg += amt;
    };
    add(h.skill, sign * h.xp * c * primary);
    if (h.skill2) add(h.skill2, sign * h.xp * c * 0.2);
  }
  return out;
}

export interface Computed {
  xp: SkillMap<number>;
  rate: SkillMap<number>;
  oppRate: SkillMap<number>;
  days: number;
  daysTrained: number;
}

export function compute(state: GameState): Computed {
  const today = dayKey(new Date());
  let start = state.created;
  Object.keys(state.logs).forEach((k) => {
    if (k < start) start = k;
  });
  const xp = {} as SkillMap<number>;
  SKILLS.forEach((s) => (xp[s.id] = 0));
  const daily: { net: SkillMap<number>; opp: SkillMap<number> }[] = [];
  let daysTrained = 0;
  const d = parseKey(start),
    end = parseKey(today);
  while (d <= end) {
    const key = dayKey(d),
      e = earnedOnDay(state, key);
    const net = {} as SkillMap<number>,
      opp = {} as SkillMap<number>;
    let trained = false;
    SKILLS.forEach((s) => {
      const p = e[s.id].pos,
        n = e[s.id].neg;
      const v = p > 0 ? p + n : n - DECAY;
      net[s.id] = v;
      opp[s.id] = n - DECAY;
      if (p > 0) trained = true;
      xp[s.id] = Math.max(0, xp[s.id] + v);
    });
    if (trained) daysTrained++;
    daily.push({ net, opp });
    if (daily.length > WINDOW) daily.shift();
    d.setDate(d.getDate() + 1);
  }
  const rate = {} as SkillMap<number>,
    oppRate = {} as SkillMap<number>;
  SKILLS.forEach((s) => {
    let a = 0,
      b = 0;
    daily.forEach((x) => {
      a += x.net[s.id];
      b += x.opp[s.id];
    });
    rate[s.id] = a / daily.length;
    oppRate[s.id] = b / daily.length;
  });
  return { xp, rate, oppRate, days: daily.length, daysTrained };
}

export const project = (xp: number, rate: number, y: number): number =>
  Math.min(XP99, Math.max(0, xp + rate * 365 * y));

export function streak(state: GameState, hid: string): number {
  const d = new Date();
  let n = 0;
  if (!((state.logs[dayKey(d)] || {})[hid] > 0)) d.setDate(d.getDate() - 1);
  while (n < 3650) {
    const c = (state.logs[dayKey(d)] || {})[hid];
    if (c > 0) {
      n++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return n;
}

export function snapLevels(state: GameState): SkillMap<number> {
  const c = compute(state);
  const o = {} as SkillMap<number>;
  SKILLS.forEach((s) => (o[s.id] = levelFor(c.xp[s.id])));
  return o;
}

/** v1 tally(): returns a new state with `delta` reps added for habit on `day`. */
export function tally(state: GameState, day: string, hid: string, delta: number): GameState {
  const logs = { ...state.logs };
  const log = { ...(logs[day] || {}) };
  log[hid] = Math.max(0, (log[hid] || 0) + delta);
  if (!log[hid]) delete log[hid];
  if (!Object.keys(log).length) delete logs[day];
  else logs[day] = log;
  return { ...state, logs };
}

/** Basic shape check for state coming from storage or an import. */
export function isGameState(o: unknown): o is GameState {
  return !!o && typeof o === "object" && Array.isArray((o as GameState).habits) && typeof (o as GameState).logs === "object";
}
