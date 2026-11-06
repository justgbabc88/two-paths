// Rewards that sit on top of the habit math (which stays untouched):
//  - loot: each good rep you confirm has a chance to drop gold or a loot-only item.
//    The roll is seeded by the day, habit and rep number, so undoing and redoing
//    a rep gives the same result and loot can't be farmed. Everything derives from logs.
//  - streaks: consecutive days with at least one good rep. Freezes (bought at the
//    store) cover missed days so one bad day doesn't wipe out a month.
//  - milestones: every 5 levels in a skill pays a one-off bounty.
import { SKILLS, type GameState, type SkillId } from "./data";
import { dayKey, levelFor, parseKey, type Computed } from "./logic";
import { ITEM, ITEMS, type ShopItem } from "./economy";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export const RARITY_COLOR: Record<Rarity, string> = { common: "#c9c2b0", uncommon: "#5fbf4a", rare: "#4a8ae0", legendary: "#e0a020" };
const DUP_GOLD: Record<Rarity, number> = { common: 20, uncommon: 80, rare: 250, legendary: 600 };

export interface Drop {
  day: string;
  hid: string;
  rep: number;
  rarity: Rarity;
  gold: number; // 0 when an item dropped
  item?: string; // item id (first time found)
  dup?: string; // item id you already had: paid out as gold instead
}

// ---- seeded randomness ----
function hash(s: string): number {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chance that one rep drops something: bigger habits drop more often. */
export const dropChance = (xp: number) => Math.min(0.32, 0.07 + xp / 4000);

const lootPool = (r: Rarity): ShopItem[] => ITEMS.filter((i) => i.loot === r);

/** The raw roll for one rep, before duplicates are resolved. */
function roll(created: string, day: string, hid: string, rep: number, xp: number): Omit<Drop, "dup"> | null {
  const r = rng(hash(`${created}|${day}|${hid}|${rep}`));
  if (r() >= dropChance(xp)) return null;
  // harder habits tilt the table toward the good stuff
  const tilt = Math.max(1, xp / 250);
  const x = r();
  const rarity: Rarity = x < 0.025 * tilt ? "legendary" : x < 0.14 * tilt ? "rare" : x < 0.45 ? "uncommon" : "common";
  const y = r();
  const base = { day, hid, rep, rarity };
  if (rarity === "common") return { ...base, gold: 15 + Math.floor(y * 26) };
  const pool = lootPool(rarity);
  const itemOdds = rarity === "uncommon" ? 0.5 : 0.65;
  if (pool.length && r() < itemOdds) return { ...base, gold: 0, item: pool[Math.floor(y * pool.length)].id };
  const gold = rarity === "uncommon" ? 60 + Math.floor(y * 60) : rarity === "rare" ? 200 + Math.floor(y * 100) : 600;
  return { ...base, gold };
}

/** Every drop you've earned, oldest first, with repeat items turned into gold. */
export function lootLog(state: GameState): Drop[] {
  const hm = new Map(state.habits.map((h) => [h.id, h]));
  const out: Drop[] = [];
  const found = new Set<string>();
  const today = dayKey(new Date());
  for (const day of Object.keys(state.logs).sort()) {
    if (day > today) continue;
    for (const [hid, reps] of Object.entries(state.logs[day])) {
      const h = hm.get(hid);
      if (!h || h.type !== "pos") continue;
      for (let rep = 1; rep <= reps; rep++) {
        const d = roll(state.created, day, hid, rep, h.xp);
        if (!d) continue;
        if (d.item && found.has(d.item)) out.push({ ...d, item: undefined, dup: d.item, gold: DUP_GOLD[d.rarity] });
        else {
          if (d.item) found.add(d.item);
          out.push(d);
        }
      }
    }
  }
  return out;
}

/** Items you own: bought at the store or found as loot. */
export function ownedIds(state: GameState, loot = lootLog(state)): Set<string> {
  const s = new Set(state.owned ?? []);
  loot.forEach((d) => d.item && ITEM[d.item] && s.add(d.item));
  return s;
}

// ---- streaks ----
export const FREEZE_PRICE = 150;
export const MAX_FREEZES = 2;
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
export const streakBounty = (n: number) => n * 6;

const shift = (k: string, n: number) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** A day counts if you did at least one good thing, or a freeze covered it. */
function activeDays(state: GameState): Set<string> {
  const pos = new Set(state.habits.filter((h) => h.type === "pos").map((h) => h.id));
  const s = new Set(state.freezes?.used ?? []);
  for (const [day, log] of Object.entries(state.logs)) if (Object.entries(log).some(([id, n]) => n > 0 && pos.has(id))) s.add(day);
  return s;
}

export interface StreakInfo {
  current: number;
  best: number;
  todayDone: boolean;
  atRisk: boolean; // a live streak that today hasn't extended yet
  held: number; // freezes on hand
  frozen: Set<string>;
  active: Set<string>;
  bounties: number; // gold paid out for streak milestones, all time
}

export function streakInfo(state: GameState): StreakInfo {
  const active = activeDays(state);
  const today = dayKey(new Date());
  const todayDone = active.has(today);
  let current = 0;
  let k = todayDone ? today : shift(today, -1);
  while (active.has(k) && current < 5000) {
    current++;
    k = shift(k, -1);
  }
  // walk forward through history for best streak and milestone bounties
  let best = 0,
    run = 0,
    bounties = 0;
  const days = [...active].filter((d) => d <= today).sort();
  let prev = "";
  for (const d of days) {
    run = prev && shift(prev, 1) === d ? run + 1 : 1;
    if (STREAK_MILESTONES.includes(run)) bounties += streakBounty(run);
    best = Math.max(best, run);
    prev = d;
  }
  const held = Math.max(0, (state.freezes?.bought ?? 0) - (state.freezes?.used.length ?? 0));
  return { current, best, todayDone, atRisk: !todayDone && current > 0, held, frozen: new Set(state.freezes?.used ?? []), active, bounties };
}

/**
 * Days missed since your last active day that freezes can cover. Returns them
 * only if you hold enough freezes to bridge the whole gap (otherwise the streak breaks).
 */
export function freezesNeeded(state: GameState): string[] {
  const s = streakInfo(state);
  const held = s.held;
  if (!held) return [];
  const today = dayKey(new Date());
  const gap: string[] = [];
  let k = shift(today, -1);
  while (!s.active.has(k) && gap.length <= held) {
    if (k < state.created) return [];
    gap.push(k);
    k = shift(k, -1);
  }
  if (!gap.length || gap.length > held) return [];
  return gap;
}

// ---- level milestones ----
export const MILESTONE_STEP = 5;
export const milestoneBounty = (lvl: number) => lvl * 8;

/** Milestones reached but not yet paid, e.g. [["health", 10]]. */
export function newMilestones(state: GameState, c: Computed): [SkillId, number][] {
  const out: [SkillId, number][] = [];
  for (const s of SKILLS) {
    const lvl = levelFor(c.xp[s.id]);
    const claimed = state.milestones?.[s.id] ?? 0;
    for (let m = claimed + MILESTONE_STEP - (claimed % MILESTONE_STEP); m <= lvl; m += MILESTONE_STEP) out.push([s.id, m]);
  }
  return out;
}
export function milestoneGold(state: GameState): number {
  let g = 0;
  for (const s of SKILLS) for (let m = MILESTONE_STEP; m <= (state.milestones?.[s.id] ?? 0); m += MILESTONE_STEP) g += milestoneBounty(m);
  return g;
}
