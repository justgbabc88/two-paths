// Quests: multi-step challenges from the wanderers, built around the changes that
// move a life the most. Steps are real-life actions:
//   task   - a one-off thing you do and tick off yourself
//   reps   - log matching habits N times within the quest's window
//   streak - log a matching habit N days in a row
//   avoid  - go N days in a row without logging matching tear-down habits
// Rewards are quest points and a title. XP is untouched.
import type { GameState, Habit, SkillId, VicePlace } from "./data";
import { dayKey, parseKey } from "./logic";
import { actionFor, type ActionId } from "./actions";

export interface Match {
  skill?: SkillId;
  action?: ActionId;
  place?: VicePlace;
  type?: "pos" | "neg";
}
export type Step =
  | { kind: "task"; text: string }
  | { kind: "reps"; text: string; match: Match; count: number }
  | { kind: "streak"; text: string; match: Match; days: number }
  | { kind: "avoid"; text: string; match: Match; days: number };

export interface Quest {
  id: string;
  name: string;
  giver: string; // wanderer id
  points: number;
  /** What the wanderer says when offering it. */
  pitch: string;
  /** Why it matters, in one or two lines. */
  why: string;
  steps: Step[];
  /** Days you have to finish the rep steps once started. */
  window: number;
  requires?: string[];
  /** Only offered if you have a habit matching this (used for vice quests). */
  needsHabit?: Match;
}

export const QUESTS: Quest[] = [
  // ---- Wealth (Marta)
  {
    id: "cushion", name: "The Cushion", giver: "marta", points: 3, window: 45,
    pitch: "Before you dig for gold, dig a hole to fall back into. Every miner needs a cushion.",
    why: "An emergency fund turns crises into inconveniences, and stops one bad month from undoing a good year.",
    steps: [
      { kind: "task", text: "Open a separate savings account just for emergencies" },
      { kind: "task", text: "Set up an automatic transfer on payday, even a small one" },
      { kind: "reps", text: "Put money aside 8 times", match: { action: "coins" }, count: 8 },
      { kind: "task", text: "Reach one month of essential expenses saved" },
    ],
  },
  {
    id: "numbers", name: "Know Your Numbers", giver: "marta", points: 2, window: 21,
    pitch: "You can't fix a leak you can't see. Write it all down for a while.",
    why: "Most people underestimate their spending. Seeing it is usually enough to change it.",
    steps: [
      { kind: "streak", text: "Track every expense 7 days in a row", match: { action: "write", skill: "wealth" }, days: 7 },
      { kind: "task", text: "List every subscription and cancel at least one" },
      { kind: "task", text: "Write a one-page budget for next month" },
    ],
  },
  // ---- Business (Pip)
  {
    id: "pipeline", name: "Fill the Pipeline", giver: "pip", points: 3, window: 14,
    pitch: "Quiet stall? That's a pipeline problem. Two weeks of honest outreach and we'll see.",
    why: "Consistent outreach is the most reliable lever a small business has. Results lag effort by weeks.",
    steps: [
      { kind: "task", text: "Write a short outreach script and a follow-up message" },
      { kind: "task", text: "Set up one simple place to track every lead" },
      { kind: "reps", text: "Do 10 prospecting sessions", match: { action: "call" }, count: 10 },
      { kind: "reps", text: "Follow up or ship client work 6 times", match: { skill: "business", action: "type" }, count: 6 },
    ],
  },
  {
    id: "deepwork", name: "The Deep Work Ritual", giver: "pip", points: 3, window: 21, requires: ["pipeline"],
    pitch: "You're busy. Are you building anything? Guard a block every day for the thing that matters.",
    why: "A protected daily block on your most important work compounds faster than any amount of busywork.",
    steps: [
      { kind: "task", text: "Block 90 minutes on your calendar every weekday" },
      { kind: "task", text: "Turn off notifications for that block (phone in another room)" },
      { kind: "reps", text: "Complete 12 deep work blocks", match: { skill: "business", action: "type" }, count: 12 },
    ],
  },
  // ---- Health (Garrick)
  {
    id: "foundations", name: "Foundations", giver: "garrick", points: 3, window: 30,
    pitch: "Everything sits on sleep and movement. Get those right and the rest gets easier.",
    why: "Sleep and regular training lift energy, mood and focus, which feeds every other skill.",
    steps: [
      { kind: "task", text: "Set a fixed bedtime alarm, not just a wake-up alarm" },
      { kind: "streak", text: "Sleep 7+ hours 7 nights in a row", match: { action: "sleep" }, days: 7 },
      { kind: "reps", text: "Train 12 times", match: { action: "lift" }, count: 12 },
    ],
  },
  {
    id: "miles", name: "Miles on the Legs", giver: "garrick", points: 2, window: 30,
    pitch: "Walk. Every day. Nothing fancy. Thirty days and you'll feel it.",
    why: "Daily walking is the easiest high-return health habit there is, and it clears your head too.",
    steps: [
      { kind: "reps", text: "Walk or run 20 times", match: { action: "jog" }, count: 20 },
      { kind: "task", text: "Find a route you enjoy and make it your default" },
    ],
  },
  // ---- Relationship (Nell)
  {
    id: "datenight", name: "The Standing Date", giver: "nell", points: 3, window: 30,
    pitch: "Good partnerships don't run on leftovers. Give it a regular night of its own.",
    why: "Couples who protect regular time together handle stress and conflict far better.",
    steps: [
      { kind: "task", text: "Agree a weekly night that belongs to the two of you" },
      { kind: "reps", text: "Have 4 evenings of real quality time", match: { action: "talk" }, count: 4 },
      { kind: "task", text: "Plan one small surprise they wouldn't expect" },
    ],
  },
  {
    id: "undivided", name: "Undivided", giver: "nell", points: 2, window: 21, requires: ["datenight"],
    pitch: "The phone at the table is a third person in the conversation. Ask it to leave.",
    why: "Full attention is the clearest way to show someone they matter.",
    steps: [
      { kind: "task", text: "Put a basket by the door for phones at dinner" },
      { kind: "reps", text: "Have 10 phone-free meals or evenings together", match: { skill: "relationship" }, count: 10 },
      { kind: "task", text: "Tell them one specific thing you appreciate, out loud" },
    ],
  },
  // ---- Mind (Aldous)
  {
    id: "stillness", name: "Stillness", giver: "aldous", points: 2, window: 21,
    pitch: "Sit with me a while. Ten minutes a day, a week without missing. That's the whole quest.",
    why: "A short daily practice builds the gap between something happening and how you react to it.",
    steps: [
      { kind: "streak", text: "Meditate 7 days in a row", match: { action: "meditate" }, days: 7 },
      { kind: "task", text: "Spend the first 30 minutes of 3 mornings without your phone" },
    ],
  },
  // ---- Learning (Wen)
  {
    id: "reader", name: "The Reading Habit", giver: "wen", points: 2, window: 21,
    pitch: "Two weeks without missing a day of reading. Small pages, every day.",
    why: "Daily reading compounds into expertise. Ten pages a day is around fifteen books a year.",
    steps: [
      { kind: "task", text: "Choose your next three books" },
      { kind: "streak", text: "Read 14 days in a row", match: { action: "read" }, days: 14 },
    ],
  },
  {
    id: "teach", name: "Teach It Back", giver: "wen", points: 2, window: 30, requires: ["reader"],
    pitch: "You don't know a thing until you can explain it. Go and explain something.",
    why: "Teaching shows you exactly where your understanding is thin, and makes it stick.",
    steps: [
      { kind: "task", text: "Write a one-page summary of the best idea from your last book" },
      { kind: "task", text: "Explain it to someone else, in person or in a post" },
      { kind: "reps", text: "Spend 6 sessions learning or building something new", match: { skill: "learning" }, count: 6 },
    ],
  },
  // ---- Vices (Tamsin)
  {
    id: "dryspell", name: "Dry Spell", giver: "tamsin", points: 3, window: 30, needsHabit: { place: "tavern" },
    pitch: "Two weeks out of the tavern. Not forever. Just long enough to see what changes.",
    why: "A short break shows you what drinking was actually doing to your sleep, money and mornings.",
    steps: [
      { kind: "task", text: "Decide what you'll drink instead and keep it in the house" },
      { kind: "avoid", text: "Go 14 days without logging the tavern", match: { place: "tavern" }, days: 14 },
    ],
  },
  {
    id: "clearair", name: "Clear Air", giver: "tamsin", points: 3, window: 30, needsHabit: { place: "shack" },
    pitch: "Let the haze lift for a couple of weeks. Notice your mornings.",
    why: "Taking a break resets tolerance and shows you how your focus and motivation feel without it.",
    steps: [
      { kind: "task", text: "Move it out of easy reach (out of the house if you can)" },
      { kind: "task", text: "Pick a replacement for the evenings it usually fills" },
      { kind: "avoid", text: "Go 14 days without logging the smoke shack", match: { place: "shack" }, days: 14 },
    ],
  },
  {
    id: "screenfast", name: "Screen Fast", giver: "tamsin", points: 2, window: 21, needsHabit: { place: "den" },
    pitch: "The den's doors are always open. Close a few.",
    why: "Removing friction-free scrolling gives you back hours a week for things you'll actually remember.",
    steps: [
      { kind: "task", text: "Delete one app that eats your time" },
      { kind: "task", text: "Charge your phone outside the bedroom" },
      { kind: "avoid", text: "Go 7 days without logging the den", match: { place: "den" }, days: 7 },
    ],
  },
  {
    id: "slightedge", name: "The Slight Edge", giver: "tamsin", points: 5, window: 60, requires: ["cushion", "foundations", "reader"],
    pitch: "You've seen what small things do. Now string them together.",
    why: "This is the whole game: ordinary days, repeated, adding up to a different life.",
    steps: [
      { kind: "streak", text: "Log at least one build-up habit 21 days in a row", match: { type: "pos" }, days: 21 },
      { kind: "task", text: "Look through the Fork at 10 years and write down what you saw" },
    ],
  },
];
export const QUEST = Object.fromEntries(QUESTS.map((q) => [q.id, q])) as Record<string, Quest>;

export type { QuestRecord, QuestBook } from "./data";
import type { QuestRecord, QuestBook } from "./data";

export const matches = (h: Habit, m: Match) =>
  (!m.skill || h.skill === m.skill || h.skill2 === m.skill) &&
  (!m.action || actionFor(h) === m.action) &&
  (!m.place || (h.type === "neg" && (h.place ?? "tavern") === m.place)) &&
  (!m.type || h.type === m.type);

function daysFrom(start: string) {
  const out: string[] = [];
  const d = parseKey(start),
    end = dayKey(new Date());
  while (dayKey(d) <= end) {
    out.push(dayKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export interface StepProgress {
  value: number;
  target: number;
  done: boolean;
}
export function stepProgress(state: GameState, rec: QuestRecord, step: Step, index: number): StepProgress {
  if (step.kind === "task") {
    const done = rec.tasks.includes(index);
    return { value: done ? 1 : 0, target: 1, done };
  }
  const ids = new Set(state.habits.filter((h) => matches(h, step.match)).map((h) => h.id));
  const days = daysFrom(rec.started);
  const count = (k: string) => Object.entries(state.logs[k] || {}).reduce((a, [id, n]) => a + (ids.has(id) ? n : 0), 0);
  if (step.kind === "reps") {
    const v = days.reduce((a, k) => a + count(k), 0);
    return { value: Math.min(v, step.count), target: step.count, done: v >= step.count };
  }
  // longest run inside the quest window (so finishing early still counts)
  let run = 0,
    best = 0;
  for (const k of days) {
    const hit = step.kind === "streak" ? count(k) > 0 : count(k) === 0;
    run = hit ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { value: Math.min(best, step.days), target: step.days, done: best >= step.days };
}

export type QuestStatus = "locked" | "available" | "active" | "complete";
export function statusOf(state: GameState, q: Quest): QuestStatus {
  const rec = state.quests?.[q.id];
  if (rec?.done) return "complete";
  if (rec) return "active";
  if (q.requires?.some((r) => !state.quests?.[r]?.done)) return "locked";
  if (q.needsHabit && !state.habits.some((h) => matches(h, q.needsHabit!))) return "locked";
  return "available";
}
export function isFinished(state: GameState, rec: QuestRecord, q: Quest) {
  return q.steps.every((s, i) => stepProgress(state, rec, s, i).done);
}
export const questPoints = (book: QuestBook | undefined) => Object.entries(book ?? {}).reduce((a, [id, r]) => a + (r.done && QUEST[id] ? QUEST[id].points : 0), 0);

/** Days left in the quest's window (rep and streak steps only count inside it). */
export function daysLeft(rec: QuestRecord, q: Quest) {
  const end = parseKey(rec.started);
  end.setDate(end.getDate() + q.window);
  return Math.ceil((end.getTime() - Date.now()) / 864e5);
}
