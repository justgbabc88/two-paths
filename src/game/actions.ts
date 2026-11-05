// What the character physically does when you log a habit.
// Each habit can name its action; if it doesn't, one is picked from the habit's
// name, then its skill (build-up) or place (tear-down).
import type { Habit, SkillId, VicePlace } from "./data";

export type ActionId =
  | "call" | "type" | "write" | "swing" | "lift" | "jog" | "sleep" | "meditate"
  | "read" | "talk" | "coins" | "drink" | "smoke" | "eat" | "scroll" | "bet";

export interface ActionDef {
  id: ActionId;
  label: string;
  /** Chat line when the action starts; {h} is the habit name. */
  start: string;
  /** Seconds the animation runs before the rep is logged. */
  secs: number;
  /** Little symbol that floats up from the character while acting. */
  fx?: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "call", label: "Phone call", start: "You pick up the phone and start dialling: {h}.", secs: 2.2, fx: "☎" },
  { id: "type", label: "Laptop work", start: "You open the laptop and get to work: {h}.", secs: 2.2 },
  { id: "write", label: "Writing in a ledger", start: "You open your ledger and write it down: {h}.", secs: 2.0, fx: "✎" },
  { id: "swing", label: "Pick-hammer", start: "You start to work on: {h}.", secs: 1.6 },
  { id: "lift", label: "Lifting weights", start: "You grab the dumbbells: {h}.", secs: 2.2, fx: "💪" },
  { id: "jog", label: "Jogging", start: "You set off at a steady pace: {h}.", secs: 2.0 },
  { id: "sleep", label: "Sleeping", start: "You lie down and drift off: {h}.", secs: 2.6, fx: "z" },
  { id: "meditate", label: "Meditating", start: "You sit, close your eyes and breathe: {h}.", secs: 2.6, fx: "✦" },
  { id: "read", label: "Reading", start: "You open a book: {h}.", secs: 2.2 },
  { id: "talk", label: "Quality time", start: "You set everything down and give them your attention: {h}.", secs: 2.2, fx: "♥" },
  { id: "coins", label: "Counting coins", start: "You count out the coins and put them aside: {h}.", secs: 2.0, fx: "◎" },
  { id: "drink", label: "Drinking", start: "You give in and order another: {h}.", secs: 1.8 },
  { id: "smoke", label: "Smoking", start: "You give in and light up: {h}.", secs: 2.0, fx: "~" },
  { id: "eat", label: "Snacking", start: "You give in and grab something sweet: {h}.", secs: 1.6 },
  { id: "scroll", label: "Scrolling", start: "You give in and start scrolling: {h}.", secs: 2.2 },
  { id: "bet", label: "Gambling", start: "You give in and place a bet: {h}.", secs: 1.8, fx: "⚀" },
];
export const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

// Order matters: the first rule whose words appear in the habit name wins.
const RULES: [RegExp, ActionId][] = [
  [/\b(bet|gambl|casino|poker|slots?)\b/i, "bet"],
  [/\b(drink|drinks|beer|wine|booze|alcohol|shots?)\b/i, "drink"],
  [/\b(weed|smok|vap|cig|joint|blunt|nicotine)/i, "smoke"],
  [/\b(junk|snack|sugar|sweets?|candy|fast food|takeaway|binge eat)/i, "eat"],
  [/\b(scroll|tiktok|instagram|youtube|netflix|reddit|social media|gaming)/i, "scroll"],
  [/\b(partner|wife|husband|fianc|wedding|date night|dinner|family|kids|friend|mom|dad|parents)/i, "talk"],
  [/\b(slept|sleep|nap|bed)\b/i, "sleep"],
  [/\b(meditat|breath|pray|mindful)/i, "meditate"],
  [/\b(prep|prepped|plan|planned|journal|wrote|write|track|tracked|expense|budget|ledger|review)/i, "write"],
  [/\b(calls?|dms?|dial|prospect|phone|outreach)\b/i, "call"],
  [/\b(workout|gym|lift|weights|strength|train(ed|ing)?|push-?ups?)\b/i, "lift"],
  [/\b(walk|walked|steps|run|ran|jog|cardio|hike|bike|swim)/i, "jog"],
  [/\b(read|book|pages|study|studied)\b/i, "read"],
  [/\b(money|saved?|saving|invest|fund|debt|deposit)\b/i, "coins"],
  [/\b(follow(ed)? up|email|deliverable|ship|shipped|build|built|code|coded|deep work|product|ai|design)/i, "type"],
];
const BY_SKILL: Record<SkillId, ActionId> = { business: "type", health: "lift", relationship: "talk", mind: "meditate", learning: "read", wealth: "coins" };
const BY_PLACE: Record<VicePlace, ActionId> = { tavern: "drink", shack: "smoke", sweets: "eat", den: "scroll" };

/** The action this habit plays: its chosen one, else one inferred from its name. */
export function actionFor(h: Habit): ActionId {
  if (h.action && ACTION[h.action as ActionId]) return h.action as ActionId;
  for (const [re, id] of RULES) if (re.test(h.name)) return id;
  return h.type === "neg" ? BY_PLACE[h.place ?? "tavern"] : BY_SKILL[h.skill];
}
