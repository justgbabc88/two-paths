// Gold, mirroring real life:
//  - work (Business habits) pays wages, the best income
//  - other good habits pay a smaller "self-investment" stipend
//  - saving habits (put money aside) go into the bank, which earns 2% a week, compounding
//  - vices cost money: drinks, weed and junk food cost real gold; scrolling costs a little
//  - finishing a quest pays a bounty
// Everything is derived from your logs, so it can never drift out of sync.
import type { GameState, Habit, SkillId } from "./data";
import type { GearKind, HatKind } from "./models";
import { dayKey, parseKey } from "./logic";
import { actionFor } from "./actions";
import { QUEST } from "./quests";
import { FREEZE_PRICE, lootLog, milestoneGold, streakInfo, type Rarity } from "./rewards";

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
  slot: "top" | "hat" | "cape" | "accessory" | "pet" | "aura";
  price: number;
  color?: string;
  hat?: HatKind;
  accessory?: "satchel" | "staff";
  gear?: GearKind;
  pet?: PetKind;
  circlet?: boolean;
  finish?: "metal" | "glow" | "ghost";
  capeStyle?: "wings" | "stars" | "phoenix" | "rainbow";
  aura?: AuraKind;
  /** Real progress needed before you can buy it. */
  requires?: { skill?: SkillId; level?: number; total?: number; streak?: number };
  /** Loot-only: can't be bought, only found. */
  loot?: Rarity;
  /** Secret: can't be bought or found, only earned somewhere hidden. */
  secret?: boolean;
  blurb: string;
}

export type PetKind = "dog" | "cat" | "fox" | "penguin" | "robot" | "dragon";
export type AuraKind = "petals" | "snow" | "embers" | "lightning" | "midas";

export const ITEMS: ShopItem[] = [
  { id: "dye-green", name: "Forest green tunic", slot: "top", price: 250, color: "#3d6a3a", blurb: "Dyed in the woods west of the village." },
  { id: "dye-sky", name: "Sky blue tunic", slot: "top", price: 250, color: "#5a8ac0", blurb: "Light and cheerful." },
  { id: "dye-crimson", name: "Crimson tunic", slot: "top", price: 450, color: "#8a2a22", blurb: "Bold. People notice you." },
  { id: "dye-black", name: "Black tunic", slot: "top", price: 700, color: "#26242a", blurb: "Sharp and serious." },
  { id: "dye-purple", name: "Royal purple tunic", slot: "top", price: 1400, color: "#5a3a7a", blurb: "Purple dye was once worth more than gold." },
  { id: "hat-straw", name: "Straw hat", slot: "hat", price: 350, hat: "brim", color: "#c9a84a", blurb: "For long days in the fields." },
  { id: "hat-cap", name: "Leather cap", slot: "hat", price: 500, hat: "cap", color: "#6b4626", blurb: "Practical. Keeps the sun off." },
  { id: "hat-hood", name: "Ranger's hood", slot: "hat", price: 900, hat: "hood", color: "#3d5a32", blurb: "Good in the woods, good in the rain." },
  { id: "hat-merchant", name: "Merchant's hat", slot: "hat", price: 2200, hat: "brim", color: "#4a2a5a", blurb: "Wide-brimmed. Says you close deals." },
  { id: "hat-circlet", name: "Gold circlet", slot: "hat", price: 6000, circlet: true, color: "#d4a52a", blurb: "Usually earned. Can also be bought." },
  { id: "cape-travel", name: "Travel cloak", slot: "cape", price: 1000, color: "#6b4a2a", blurb: "Warm, sturdy, a little worn." },
  { id: "cape-crimson", name: "Crimson cape", slot: "cape", price: 2000, color: "#8a2a22", blurb: "Catches the wind nicely." },
  { id: "cape-midnight", name: "Midnight cape", slot: "cape", price: 3000, color: "#1f2a44", blurb: "Deep blue with a silver sheen." },
  { id: "cape-gold", name: "Golden cape", slot: "cape", price: 9000, color: "#d4a52a", blurb: "For someone who has stacked a lot of good days." },
  { id: "acc-satchel", name: "Satchel", slot: "accessory", price: 450, accessory: "satchel", color: "#6b4626", blurb: "Room for a book and a sandwich." },
  { id: "acc-staff", name: "Walking staff", slot: "accessory", price: 800, accessory: "staff", blurb: "For the long road." },
  { id: "pet-cat", name: "Cat", slot: "pet", price: 3500, pet: "cat", blurb: "Follows you when it feels like it." },
  { id: "pet-dog", name: "Dog", slot: "pet", price: 4500, pet: "dog", blurb: "Follows you everywhere. Very good boy." },
  // ---- the wild stuff: expensive, and the best of it needs real progress too ----
  { id: "x-neon", name: "Neon tunic", slot: "top", price: 3500, color: "#3af0c0", finish: "glow", blurb: "Glows in the dark. Glows in the light. Just glows." },
  { id: "x-obsidian", name: "Obsidian plate", slot: "top", price: 6000, color: "#2a2632", finish: "metal", blurb: "Forged from volcanic glass. Heavy. Worth it.", requires: { skill: "health", level: 25 } },
  { id: "x-goldplate", name: "Gold-plated armour", slot: "top", price: 12000, color: "#d4a52a", finish: "metal", blurb: "Every plate paid for with a good day.", requires: { skill: "wealth", level: 30 } },
  { id: "x-ghost", name: "Ghost robe", slot: "top", price: 15000, color: "#c8dcf0", finish: "ghost", blurb: "Half here, half somewhere else. Like your old habits.", requires: { skill: "mind", level: 30 } },
  { id: "x-tophat", name: "Top hat", slot: "hat", price: 2500, hat: "tophat", color: "#1e1a22", blurb: "Very serious. Very tall." },
  { id: "x-tricorn", name: "Captain's tricorn", slot: "hat", price: 3500, hat: "tricorn", color: "#2a2230", blurb: "For whoever commands the ferry in their heart." },
  { id: "x-horns", name: "Horned helm", slot: "hat", price: 5000, hat: "horns", color: "#8a8f98", blurb: "Mostly for intimidating the training dummy.", requires: { skill: "health", level: 20 } },
  { id: "x-antlers", name: "Forest antlers", slot: "hat", price: 6500, hat: "antlers", color: "#8a6a44", blurb: "The deer gave them up willingly. Probably." },
  { id: "x-wizard", name: "Wizard's hat", slot: "hat", price: 9000, hat: "wizard", color: "#3a2a7a", blurb: "Stars stitched by someone who read every book in the library.", requires: { skill: "learning", level: 30 } },
  { id: "x-astro", name: "Astronaut helmet", slot: "hat", price: 14000, hat: "astro", color: "#e8ecf2", blurb: "Room to breathe. The rest of the village is a different planet.", requires: { total: 150 } },
  { id: "x-halo", name: "Halo", slot: "hat", price: 25000, hat: "halo", color: "#fff2a8", blurb: "Floats. Hums faintly. Nobody asks.", requires: { skill: "mind", level: 50 } },
  { id: "x-flames", name: "Crown of flames", slot: "hat", price: 40000, hat: "flames", color: "#ff7a1a", blurb: "It doesn't burn you. It burns for you.", requires: { total: 250, streak: 30 } },
  { id: "x-rainbow", name: "Rainbow cape", slot: "cape", price: 7500, color: "#e04a4a", capeStyle: "rainbow", blurb: "Loud. Joyful. Impossible to sneak in." },
  { id: "x-stars", name: "Cape of stars", slot: "cape", price: 16000, color: "#0e1230", capeStyle: "stars", blurb: "A piece of the night sky, hemmed.", requires: { streak: 14 } },
  { id: "x-phoenix", name: "Phoenix cape", slot: "cape", price: 30000, color: "#ff7a1a", capeStyle: "phoenix", blurb: "For people who've burned it all down and come back better.", requires: { total: 200 } },
  { id: "x-wings", name: "Dragon wings", slot: "cape", price: 60000, color: "#5a2a8a", capeStyle: "wings", blurb: "They beat slowly while you walk. They do not let you fly. Yet.", requires: { total: 300, streak: 60 } },
  { id: "x-lute", name: "Bard's lute", slot: "accessory", price: 3000, gear: "lute", blurb: "Knows three songs. All about you." },
  { id: "x-orb", name: "Floating orb", slot: "accessory", price: 8000, gear: "orb", blurb: "Orbits your head. Keeps your thoughts company.", requires: { skill: "mind", level: 20 } },
  { id: "x-jetpack", name: "Jetpack", slot: "accessory", price: 18000, gear: "jetpack", blurb: "Mostly for show. The flames are real though.", requires: { skill: "business", level: 30 } },
  { id: "x-sword", name: "Flaming sword", slot: "accessory", price: 35000, gear: "sword", blurb: "Carried on the back. Drawn for nothing but rare occasions.", requires: { skill: "health", level: 40, streak: 21 } },
  { id: "x-fox", name: "Fox", slot: "pet", price: 7000, pet: "fox", blurb: "Clever, quick, and suspiciously interested in your lunch." },
  { id: "x-penguin", name: "Penguin", slot: "pet", price: 12000, pet: "penguin", blurb: "Emigrated from Pen Gu Island. Waddles with purpose." },
  { id: "x-robot", name: "Mini Frostwarden", slot: "pet", price: 22000, pet: "robot", blurb: "A tiny guard bot. Beeps when you log something good.", requires: { total: 120 } },
  { id: "x-dragon", name: "Baby dragon", slot: "pet", price: 75000, pet: "dragon", blurb: "Flies at your shoulder. Hoards nothing but your good days.", requires: { total: 350, streak: 90 } },
  { id: "aura-petals", name: "Petal trail", slot: "aura", price: 5000, aura: "petals", blurb: "Flowers fall where you walk." },
  { id: "aura-snow", name: "Personal snowfall", slot: "aura", price: 9000, aura: "snow", blurb: "Your own little winter, wherever you go." },
  { id: "aura-embers", name: "Ember aura", slot: "aura", price: 16000, aura: "embers", blurb: "Sparks rise off you like a forge.", requires: { streak: 21 } },
  { id: "aura-lightning", name: "Storm aura", slot: "aura", price: 30000, aura: "lightning", blurb: "Crackles. Everyone steps aside.", requires: { total: 220 } },
  { id: "aura-midas", name: "Midas aura", slot: "aura", price: 100000, aura: "midas", blurb: "Everything you touch turns to gold. Mostly the ground.", requires: { skill: "wealth", level: 60, streak: 100 } },
  // ---- loot only: found when you log good habits ----
  { id: "loot-moss", name: "Moss-green tunic", slot: "top", price: 0, loot: "uncommon", color: "#55702e", blurb: "Smells faintly of forest." },
  { id: "loot-fisher", name: "Fisher's cap", slot: "hat", price: 0, loot: "uncommon", hat: "cap", color: "#3a5a6a", blurb: "Salt-stained and lucky." },
  { id: "loot-scarf", name: "Wool scarf", slot: "hat", price: 0, loot: "uncommon", hat: "scarf", color: "#b0503a", blurb: "Hand-knitted. Warm on early mornings." },
  { id: "loot-ember", name: "Ember tunic", slot: "top", price: 0, loot: "rare", color: "#c0501a", blurb: "Glows a little when you've been busy." },
  { id: "loot-feather", name: "Feathered hat", slot: "hat", price: 0, loot: "rare", hat: "brim", color: "#2a6a5a", blurb: "The feather came from somewhere far away." },
  { id: "loot-embercape", name: "Ember cape", slot: "cape", price: 0, loot: "rare", color: "#c0501a", blurb: "Warm as a hearth." },
  { id: "loot-ivory", name: "Ivory tunic", slot: "top", price: 0, loot: "rare", color: "#e6dcc4", blurb: "Hard to keep clean. Worth it." },
  { id: "loot-aurora", name: "Aurora tunic", slot: "top", price: 0, loot: "legendary", color: "#2aa8a0", blurb: "Shifts colour like northern lights." },
  { id: "loot-starlit", name: "Starlit cape", slot: "cape", price: 0, loot: "legendary", color: "#3a2a78", blurb: "Woven on the longest night of the year." },
  { id: "loot-crown", name: "Laurel crown", slot: "hat", price: 0, loot: "legendary", circlet: true, color: "#d4a52a", blurb: "Given only to those who keep showing up." },
  // ---- secret ----
  { id: "secret-crown", name: "Penguin King's crown", slot: "hat", price: 0, secret: true, hat: "crown", color: "#e8c040", blurb: "Given by the King of the Glacier Court to the one who found him." },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, ShopItem>;

export interface Money {
  wallet: number;
  bank: number;
  earned: number; // wages + stipends + bounties, all time
  vices: number; // spent on vices, all time
  interest: number; // bank interest, all time
  spent: number; // shop purchases
  loot: number; // gold found as loot, all time
  bounties: number; // streak and level milestone bounties, all time
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
  const loot = lootLog(state).reduce((a, d) => a + d.gold, 0);
  const bounties = streakInfo(state).bounties + milestoneGold(state);
  wallet += loot + bounties;
  earned += loot + bounties;
  const spent = (state.owned ?? []).reduce((a, id) => a + paidFor(state, id), 0) + (state.freezes?.bought ?? 0) * FREEZE_PRICE;
  return { wallet: wallet - spent, bank, earned, vices, interest, spent, loot, bounties, week };
}

export const gp = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString()} gp`;

/** What you paid for an item: recorded at purchase; older purchases use the price at the time. */
const LEGACY_PRICE: Record<string, number> = {
  "dye-green": 60, "dye-sky": 60, "dye-crimson": 90, "dye-black": 120, "dye-purple": 200,
  "hat-straw": 80, "hat-cap": 100, "hat-hood": 150, "hat-merchant": 300, "hat-circlet": 700,
  "cape-travel": 200, "cape-crimson": 350, "cape-midnight": 450, "cape-gold": 1000,
  "acc-satchel": 90, "acc-staff": 140, "pet-cat": 600, "pet-dog": 800,
};
export const paidFor = (state: GameState, id: string) => state.paid?.[id] ?? LEGACY_PRICE[id] ?? ITEM[id]?.price ?? 0;
