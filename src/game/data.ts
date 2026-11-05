// Static game data, copied verbatim from v1 (two-paths.html).

export type SkillId = "business" | "health" | "relationship" | "mind" | "learning" | "wealth";

export interface Skill {
  id: SkillId;
  name: string;
  ico: string;
}

export type HabitType = "pos" | "neg";

/** Where a tear-down habit happens in the world. Missing = the tavern (v1 behaviour). */
export type VicePlace = "tavern" | "shack" | "sweets" | "den";
export const VICE_PLACES: { id: VicePlace; name: string; ico: string; hint: string }[] = [
  { id: "tavern", name: "Tavern", ico: "🍺", hint: "drinking, betting" },
  { id: "shack", name: "Smoke shack", ico: "🍃", hint: "weed, vaping, cigarettes" },
  { id: "sweets", name: "Sweet stall", ico: "🍩", hint: "junk food, sugar" },
  { id: "den", name: "The den", ico: "📱", hint: "doomscrolling, binges" },
];

export interface Habit {
  id: string;
  name: string;
  skill: SkillId;
  skill2: SkillId | "";
  xp: number;
  type: HabitType;
  place?: VicePlace;
  /** Animation played when logged (see actions.ts). Missing = picked from the name. */
  action?: string;
}

/** logs[dayKey][habitId] = rep count */
export type Logs = Record<string, Record<string, number>>;

/** Progress on one quest (see quests.ts). */
export interface QuestRecord {
  started: string;
  tasks: number[]; // indices of task steps ticked off
  done?: string;
}
export type QuestBook = Record<string, QuestRecord>;

export interface GameState {
  habits: Habit[];
  logs: Logs;
  created: string;
  v: number;
  quests?: QuestBook;
}

export const SKILLS: Skill[] = [
  { id: "business", name: "Business", ico: "💼" },
  { id: "health", name: "Health", ico: "❤️" },
  { id: "relationship", name: "Relationship", ico: "💍" },
  { id: "mind", name: "Mind", ico: "🧠" },
  { id: "learning", name: "Learning", ico: "📖" },
  { id: "wealth", name: "Wealth", ico: "💰" },
];

export const SK = {} as Record<SkillId, Skill>;
SKILLS.forEach((s) => (SK[s.id] = s));

export const DECAY = 100;
export const WINDOW = 30;

export const BANDS: Record<SkillId, string[]> = {
  business: ["Winging it. Income depends on luck and bursts of effort.", "Consistent pipeline exists. You know your numbers.", "Systems run without you for days at a time.", "A real company. Team, process, predictable revenue.", "You choose what to work on. Opportunity finds you."],
  health: ["Low energy, pain is normal, sleep is a gamble.", "Training is routine. Weight and sleep are stable.", "Strong, lean, rarely sick. Energy to spare.", "Elite for your age. Decade younger on paper.", "Body is a competitive advantage in everything else."],
  relationship: ["Running on autopilot. Small resentments pile up.", "Regular time together, real conversations.", "A partnership people notice. Conflict gets resolved fast.", "Deep trust. You make each other better every year.", "The foundation everything else is built on."],
  mind: ["Reactive. Stress runs the day.", "You have tools and use them most days.", "Calm under pressure. Recover from setbacks in hours.", "Steady, present, hard to rattle.", "Equanimity. Nothing external owns your state."],
  learning: ["Learning only when forced to.", "A daily reading or study habit holds.", "Skills compound. You are the person people ask.", "Expert in your field, competent in several others.", "Polymath. New fields take you months, not years."],
  wealth: ["Paycheck to paycheck, no plan.", "Saving every month. Debt is shrinking.", "Investments cover a meaningful share of expenses.", "Work is optional. Money is a tool, not a worry.", "Generational. Your decisions are about legacy."],
};

export const SEED: Omit<Habit, "id">[] = [
  { name: "Cold calls", skill: "business", skill2: "mind", xp: 25, type: "pos" },
  { name: "Deep work block (90 min)", skill: "business", skill2: "", xp: 300, type: "pos" },
  { name: "Workout", skill: "health", skill2: "mind", xp: 400, type: "pos" },
  { name: "Slept 7+ hours", skill: "health", skill2: "mind", xp: 200, type: "pos" },
  { name: "Quality time with partner", skill: "relationship", skill2: "", xp: 350, type: "pos" },
  { name: "Read 20 pages", skill: "learning", skill2: "", xp: 200, type: "pos" },
  { name: "Reviewed finances / invested", skill: "wealth", skill2: "", xp: 300, type: "pos" },
  { name: "Meditation", skill: "mind", skill2: "", xp: 200, type: "pos" },
  { name: "Doomscrolled an hour", skill: "mind", skill2: "business", xp: 200, type: "neg", place: "den" },
  { name: "Had 3+ drinks", skill: "health", skill2: "mind", xp: 300, type: "neg", place: "tavern" },
  { name: "Smoked weed", skill: "mind", skill2: "learning", xp: 250, type: "neg", place: "shack" },
  { name: "Vaped / smoked cigarettes", skill: "health", skill2: "", xp: 150, type: "neg", place: "shack" },
  { name: "Junk food binge", skill: "health", skill2: "", xp: 200, type: "neg", place: "sweets" },
  { name: "Placed a bet", skill: "wealth", skill2: "mind", xp: 250, type: "neg", place: "tavern" },
];
