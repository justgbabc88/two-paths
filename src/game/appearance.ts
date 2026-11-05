// How the world should look, derived from the player's record.
// Today: buildings show each skill's current band, rust when a skill goes untrained,
// vice places swell with recent use, and the character reflects how you've been living.
// Through the Fork: the same, but from your projected levels 1/5/10 years out.
import { SKILLS, type GameState, type SkillId, type VicePlace } from "./data";
import { dayKey, levelFor, parseKey, project, type Computed } from "./logic";
import type { StationId } from "./map";
import type { Look } from "./models";

export type Mood = "today" | "keep" | "slide";

export interface StationLook {
  tier: number; // 0-4, the skill's band (levels 1-20, 21-40, ...)
  neglect: number; // 0-3, how rusty it looks
  vice: number; // 0-3, how busy a vice place is
  level: number | null; // skill level shown on the label
}
export interface PlayerAppearance {
  look: Look;
  slouch: number; // 0-1
  cloud: boolean; // dark cloud overhead
  vigour: number; // 0-1, upright and quick
}
export interface WorldLook {
  mood: Mood;
  year: number | null;
  stations: Record<StationId, StationLook>;
  player: PlayerAppearance;
}

/** Display names as a station grows through its five bands. */
export const TIER_NAMES: Record<SkillId, string[]> = {
  business: ["Market stall", "Busy stall", "Shop", "Trading house", "Merchant hall"],
  wealth: ["Gold mine", "Working mine", "Deep mine", "Rich mine", "Mother lode"],
  relationship: ["Cottage", "Garden cottage", "Family home", "Homestead", "Hearth hall"],
  learning: ["Library", "Reading room", "Scholars' hall", "Observatory", "Great library"],
  health: ["Training yard", "Gym yard", "Drill grounds", "Arena", "Champions' grounds"],
  mind: ["Standing stone", "Stone circle", "Quiet grove", "Sanctuary", "Still point"],
};
const VICE_IDS: VicePlace[] = ["tavern", "shack", "sweets", "den"];

const tierOf = (lvl: number) => Math.min(4, Math.floor((lvl - 1) / 20));

function repsSince(state: GameState, days: number, pred: (hid: string) => boolean) {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < days; i++) {
    const log = state.logs[dayKey(d)] || {};
    for (const id in log) if (pred(id)) n += log[id];
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function daysSinceTrained(state: GameState, skill: SkillId): number | null {
  const ids = new Set(state.habits.filter((h) => h.type === "pos" && (h.skill === skill || h.skill2 === skill)).map((h) => h.id));
  if (!ids.size) return null;
  const d = new Date();
  for (let n = 0; n < 60; n++) {
    const log = state.logs[dayKey(d)] || {};
    if (Object.keys(log).some((id) => ids.has(id) && log[id] > 0)) return n;
    d.setDate(d.getDate() - 1);
  }
  // never trained: count from when the game started
  return Math.round((Date.now() - parseKey(state.created).getTime()) / 864e5);
}
const neglectFor = (days: number | null) => (days === null ? 0 : days <= 1 ? 0 : days <= 3 ? 1 : days <= 6 ? 2 : 3);

function viceLevels(state: GameState): Record<VicePlace, number> {
  const out = { tavern: 0, shack: 0, sweets: 0, den: 0 } as Record<VicePlace, number>;
  for (const v of VICE_IDS) {
    const ids = new Set(state.habits.filter((h) => h.type === "neg" && (h.place ?? "tavern") === v).map((h) => h.id));
    const n = repsSince(state, 7, (id) => ids.has(id));
    out[v] = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3;
  }
  return out;
}

/** Outfit grows with total level; posture and the cloud follow how you've been living. */
function playerFor(levels: Record<SkillId, number>, opts: { slouch: number; cloud: boolean; tired: boolean; vigour: number; age: number }): PlayerAppearance {
  const total = SKILLS.reduce((a, s) => a + levels[s.id], 0);
  const tier = total < 30 ? 0 : total < 60 ? 1 : total < 120 ? 2 : total < 240 ? 3 : 4;
  const hair = opts.age >= 10 ? "#b9b4ac" : opts.age >= 5 ? "#6e5a48" : "#4a2e18";
  const look: Look = {
    skin: "#c99a72",
    top: ["#3c5a8c", "#3c5a8c", "#34507e", "#24406e", "#1f3560"][tier],
    bottom: "#3a3328",
    hair,
    boots: tier >= 1 ? "#5a3a20" : "#2b2119",
    belt: tier >= 1 ? "#5a3a20" : "#3a2614",
    trim: tier >= 3 ? "#d4a52a" : tier >= 1 ? "#b9a888" : undefined,
    cape: tier >= 4 ? "#e8e0cc" : tier >= 3 ? "#8a2a22" : tier >= 2 ? "#3d5a32" : undefined,
    circlet: tier >= 4,
    beard: opts.age >= 5 ? hair : undefined,
    tired: opts.tired,
  };
  return { look, slouch: opts.slouch, cloud: opts.cloud, vigour: opts.vigour };
}

/** The world as it is today. */
export function todayLook(state: GameState, c: Computed): WorldLook {
  const stations = {} as Record<StationId, StationLook>;
  const levels = {} as Record<SkillId, number>;
  for (const s of SKILLS) {
    const lvl = levelFor(c.xp[s.id]);
    levels[s.id] = lvl;
    stations[s.id] = { tier: tierOf(lvl), neglect: neglectFor(daysSinceTrained(state, s.id)), vice: 0, level: lvl };
  }
  const vices = viceLevels(state);
  for (const v of VICE_IDS) stations[v] = { tier: 0, neglect: 0, vice: vices[v], level: null };

  const negIds = new Set(state.habits.filter((h) => h.type === "neg").map((h) => h.id));
  const xpOf = new Map(state.habits.map((h) => [h.id, h.xp]));
  let good = 0,
    bad = 0;
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    const log = state.logs[dayKey(d)] || {};
    for (const id in log) {
      if (!xpOf.has(id)) continue;
      if (negIds.has(id)) bad += xpOf.get(id)! * log[id];
      else good += xpOf.get(id)! * log[id];
    }
    d.setDate(d.getDate() - 1);
  }
  const vice7 = repsSince(state, 7, (id) => negIds.has(id));
  const vice3 = repsSince(state, 3, (id) => negIds.has(id));
  const healthDown = c.rate.health < 0 && state.habits.length > 0;
  const slouch = Math.min(1, (healthDown ? 0.35 : 0) + (stations.health.neglect >= 2 ? 0.25 : 0) + Math.min(0.4, vice7 * 0.08));
  const vigour = Math.max(0, Math.min(1, (good - bad) / 3000));
  return {
    mood: "today",
    year: null,
    stations,
    player: playerFor(levels, { slouch, cloud: vice7 >= 3 && bad > good, tired: vice3 >= 2, vigour, age: 0 }),
  };
}

/** The world `years` from now if you keep going (current pace) or let it slide. */
export function futureLook(state: GameState, c: Computed, years: number, path: "keep" | "slide"): WorldLook {
  const now = todayLook(state, c);
  const stations = {} as Record<StationId, StationLook>;
  const levels = {} as Record<SkillId, number>;
  for (const s of SKILLS) {
    const rate = path === "keep" ? c.rate[s.id] : c.oppRate[s.id];
    const lvl = levelFor(project(c.xp[s.id], rate, years));
    levels[s.id] = lvl;
    stations[s.id] = { tier: tierOf(lvl), neglect: path === "slide" ? 3 : rate < 0 ? 2 : 0, vice: 0, level: lvl };
  }
  for (const v of VICE_IDS) stations[v] = { tier: 0, neglect: 0, vice: path === "slide" ? 3 : now.stations[v].vice, level: null };
  const healthRate = path === "keep" ? c.rate.health : c.oppRate.health;
  const player =
    path === "keep"
      ? playerFor(levels, { slouch: healthRate < 0 ? 0.4 : 0, cloud: false, tired: false, vigour: healthRate > 0 ? 1 : 0.4, age: years })
      : playerFor(levels, { slouch: 1, cloud: true, tired: true, vigour: 0, age: years });
  return { mood: path, year: new Date().getFullYear() + years, stations, player };
}
