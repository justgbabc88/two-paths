// Gold, mirroring real life:
//  - work (Business habits) pays wages, the best income
//  - other good habits pay a smaller "self-investment" stipend
//  - saving habits (put money aside) go into the bank, which earns 2% a week, compounding
//  - vices cost money: drinks, weed and junk food cost real gold; scrolling costs a little
//  - finishing a quest pays a bounty
// Everything is derived from your logs, so it can never drift out of sync.
import type { GameState, Habit } from "./data";
import { dayKey, parseKey } from "./logic";
import { actionFor } from "./actions";
import { QUEST } from "./quests";

export const BANK_RATE = 0.02; // per week
export const BOUNTY_PER_QP = 40;

export type Flow = { kind: "wage" | "stipend" | "deposit" | "cost"; amount: number };

/** What one rep of this habit does to your money. */
export function flowFor(h: Habit): Flow {
  if (h.type === "neg") {
    const base = { tavern: 1, shack: 0.8, sweets: 0.4, den: 0.15, pawn: 1.4, well: 0.1 }[h.place ?? "tavern"];
    return { kind: "cost", amount: Math.max(3, Math.round((h.xp / 10) * base)) };
  }
  if (actionFor(h) === "coins" || (h.skill === "wealth" && /sav|invest|fund|deposit|put/i.test(h.name))) return { kind: "deposit", amount: Math.max(5, Math.round(h.xp / 10)) };
  if (h.skill === "business") return { kind: "wage", amount: Math.max(5, Math.round(h.xp / 10)) };
  return { kind: "stipend", amount: Math.max(2, Math.round(h.xp / 25)) };
}

export interface ShopItem {
  id: string;
  name: string;
  slot: "top" | "hat" | "cape" | "accessory" | "pet";
  price: number;
  color?: string;
  hat?: "brim" | "hood" | "cap" | "scarf";
  accessory?: "satchel" | "staff";
  pet?: "dog" | "cat";
  circlet?: boolean;
  blurb: string;
}

export const ITEMS: ShopItem[] = [
  { id: "dye-green", name: "Forest green tunic", slot: "top", price: 60, color: "#3d6a3a", blurb: "Dyed in the woods west of the village." },
  { id: "dye-sky", name: "Sky blue tunic", slot: "top", price: 60, color: "#5a8ac0", blurb: "Light and cheerful." },
  { id: "dye-crimson", name: "Crimson tunic", slot: "top", price: 90, color: "#8a2a22", blurb: "Bold. People notice you." },
  { id: "dye-black", name: "Black tunic", slot: "top", price: 120, color: "#26242a", blurb: "Sharp and serious." },
  { id: "dye-purple", name: "Royal purple tunic", slot: "top", price: 200, color: "#5a3a7a", blurb: "Purple dye was once worth more than gold." },
  { id: "hat-straw", name: "Straw hat", slot: "hat", price: 80, hat: "brim", color: "#c9a84a", blurb: "For long days in the fields." },
  { id: "hat-cap", name: "Leather cap", slot: "hat", price: 100, hat: "cap", color: "#6b4626", blurb: "Practical. Keeps the sun off." },
  { id: "hat-hood", name: "Ranger's hood", slot: "hat", price: 150, hat: "hood", color: "#3d5a32", blurb: "Good in the woods, good in the rain." },
  { id: "hat-merchant", name: "Merchant's hat", slot: "hat", price: 300, hat: "brim", color: "#4a2a5a", blurb: "Wide-brimmed. Says you close deals." },
  { id: "hat-circlet", name: "Gold circlet", slot: "hat", price: 700, circlet: true, color: "#d4a52a", blurb: "Usually earned. Can also be bought." },
  { id: "cape-travel", name: "Travel cloak", slot: "cape", price: 200, color: "#6b4a2a", blurb: "Warm, sturdy, a little worn." },
  { id: "cape-crimson", name: "Crimson cape", slot: "cape", price: 350, color: "#8a2a22", blurb: "Catches the wind nicely." },
  { id: "cape-midnight", name: "Midnight cape", slot: "cape", price: 450, color: "#1f2a44", blurb: "Deep blue with a silver sheen." },
  { id: "cape-gold", name: "Golden cape", slot: "cape", price: 1000, color: "#d4a52a", blurb: "For someone who has stacked a lot of good days." },
  { id: "acc-satchel", name: "Satchel", slot: "accessory", price: 90, accessory: "satchel", color: "#6b4626", blurb: "Room for a book and a sandwich." },
  { id: "acc-staff", name: "Walking staff", slot: "accessory", price: 140, accessory: "staff", blurb: "For the long road." },
  { id: "pet-cat", name: "Cat", slot: "pet", price: 600, pet: "cat", blurb: "Follows you when it feels like it." },
  { id: "pet-dog", name: "Dog", slot: "pet", price: 800, pet: "dog", blurb: "Follows you everywhere. Very good boy." },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, ShopItem>;

export interface Money {
  wallet: number;
  bank: number;
  earned: number; // wages + stipends + bounties, all time
  vices: number; // spent on vices, all time
  interest: number; // bank interest, all time
  spent: number; // shop purchases
  week: { wage: number; stipend: number; deposit: number; cost: number };
}

/** Walk the logs from the first day to today and total everything up. */
export function money(state: GameState): Money {
  const hm = new Map(state.habits.map((h) => [h.id, h]));
  const today = dayKey(new Date());
  let start = state.created;
  Object.keys(state.logs).forEach((k) => (start = k < start ? k : start));
  let wallet = 0,
    bank = 0,
    earned = 0,
    vices = 0,
    interest = 0,
    n = 0;
  const week = { wage: 0, stipend: 0, deposit: 0, cost: 0 };
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const wk = dayKey(weekAgo);
  const d = parseKey(start);
  while (dayKey(d) <= today) {
    const k = dayKey(d);
    for (const [id, reps] of Object.entries(state.logs[k] || {})) {
      const h = hm.get(id);
      if (!h || !reps) continue;
      const f = flowFor(h);
      const amt = f.amount * reps;
      if (f.kind === "cost") (wallet -= amt), (vices += amt);
      else if (f.kind === "deposit") bank += amt;
      else (wallet += amt), (earned += amt);
      if (k >= wk) week[f.kind] += amt;
    }
    for (const w of state.withdrawals ?? []) if (w.day === k) (bank -= w.amount), (wallet += w.amount);
    n++;
    if (n % 7 === 0 && bank > 0) {
      const i = Math.round(bank * BANK_RATE);
      bank += i;
      interest += i;
    }
    d.setDate(d.getDate() + 1);
  }
  for (const [id, r] of Object.entries(state.quests ?? {})) if (r.done && QUEST[id]) (wallet += QUEST[id].points * BOUNTY_PER_QP), (earned += QUEST[id].points * BOUNTY_PER_QP);
  const spent = (state.owned ?? []).reduce((a, id) => a + (ITEM[id]?.price ?? 0), 0);
  return { wallet: wallet - spent, bank, earned, vices, interest, spent, week };
}

export const gp = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString()} gp`;
