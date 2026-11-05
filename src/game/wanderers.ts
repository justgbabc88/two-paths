// Wanderers: NPCs who roam the world and give advice tied to what you can do here.
// Each one reads your real record (level, pace, rust, streaks, projection) for
// their area before offering a practical tip. All text is original to Two Paths.
import { BANDS, SK, type GameState, type SkillId } from "./data";
import { dayKey, fmt, levelFor, project, streak, type Computed } from "./logic";
import type { Look } from "./models";

export interface Wanderer {
  id: string;
  name: string;
  title: string;
  skill: SkillId | null; // null = the drifter, who talks about both paths
  home: [number, number];
  radius: number;
  look: Look;
  barks: string[];
  tips: string[];
}

export const WANDERERS: Wanderer[] = [
  {
    id: "marta", name: "Marta", title: "the Prospector", skill: "wealth", home: [8, 8], radius: 4,
    look: { skin: "#b9825a", top: "#6b5a3a", bottom: "#4a3b2a", hair: "#2e2018", hairStyle: "bun", hat: { kind: "brim", color: "#5a4128" }, satchel: "#6b4626", belt: "#3a2614" },
    barks: ["Every vein starts as a scratch.", "Count it before you spend it.", "Slow money is still money."],
    tips: [
      "Pay yourself first. Move the saving the day the money lands, before it has a chance to look like spending money.",
      "Write down every outgoing for one month. Not to judge it. Just to see it. Most leaks are invisible until they're written.",
      "Automate the boring part. A transfer that happens without you deciding is worth ten good intentions.",
      "Kill the most expensive debt first and keep paying the minimum on the rest. Then roll that payment into the next one.",
      "Keep three months of costs where you can reach them. A cushion turns emergencies into inconveniences.",
      "When you get a raise, send half of it to savings before your lifestyle notices.",
      "Ten minutes a week with your numbers beats one panicked afternoon a year.",
    ],
  },
  {
    id: "aldous", name: "Brother Aldous", title: "keeper of the stone", skill: "mind", home: [30, 9], radius: 3,
    look: { skin: "#d6a882", top: "#5d5a66", bottom: "#3a3440", hair: "#cfcac0", hairStyle: "bald", robe: "#5d5a66", beard: "#d9d4ca", staff: true, belt: "#8a6a40" },
    barks: ["Breathe out longer than you breathe in.", "The stone is patient. So can you be.", "Quiet is a skill."],
    tips: [
      "Start with two minutes. Sit, breathe, notice when your mind wanders, and come back. The coming back is the whole practice.",
      "Before you pick up your phone in the morning, take three slow breaths. Let the first thing you choose today be yours.",
      "When something stings, name it plainly: 'that's frustration'. Naming a feeling takes some of its weight away.",
      "Pick a cue you already have, like boiling the kettle, and attach your practice to it. Habits stick to habits.",
      "Write down three things that went well before bed. It trains your attention to find them during the day.",
      "Worry loves an open loop. Write the worry down with one next step beside it, then let the page hold it.",
      "Walk somewhere without headphones once a day. Let your thoughts finish their sentences.",
    ],
  },
  {
    id: "pip", name: "Pip", title: "the Peddler", skill: "business", home: [22, 16], radius: 4,
    look: { skin: "#e0b48e", top: "#8a3a2a", bottom: "#3b3a4a", hair: "#a8642a", hat: { kind: "cap", color: "#2f4a3a" }, apron: "#d8cba7", satchel: "#7a5533" },
    barks: ["Fresh leads, get your fresh leads!", "No one buys from a closed stall.", "Ask, and ask again."],
    tips: [
      "Do the hardest outreach first, before the inbox gets a vote. One uncomfortable call early makes the rest of the day easy.",
      "Track three numbers every week: conversations started, offers made, deals closed. Fix whichever one is smallest.",
      "Protect one 90-minute block a day for the work that moves the needle. Close the door and leave your phone in another room.",
      "Follow up. Most yeses come after the third or fourth touch, and most people stop after one.",
      "Write the process down the second time you do something. The third time, someone else can do it.",
      "Ask your best customer why they bought. Then say that, in their words, to the next ten people.",
      "End each day by writing tomorrow's first task. You'll start faster than you stopped.",
    ],
  },
  {
    id: "wen", name: "Old Wen", title: "the Archivist", skill: "learning", home: [13, 19], radius: 4,
    look: { skin: "#c58f68", top: "#3d5570", bottom: "#2e3440", hair: "#e6e2d8", hairStyle: "long", robe: "#3d5570", beard: "#eeeae0", belt: "#a88a2e", scale: 0.95 },
    barks: ["Twenty pages, then twenty more.", "A book on the shelf teaches nothing.", "Ask better questions."],
    tips: [
      "Read at the same time every day so you never have to decide to. Twenty pages a day is over thirty books a year.",
      "After a chapter, close the book and write three sentences on what it said. If you can't, read it again.",
      "Teach what you learn to someone, even badly. Explaining shows you exactly where your understanding has holes.",
      "Keep a book with you at all times. Waiting rooms and queues add up to whole novels.",
      "Learn in the morning, practise in the afternoon. Knowledge you never use fades in weeks.",
      "Pick one skill for the next ninety days and say no to the rest. Depth compounds faster than breadth.",
      "When a book stops giving, put it down. Finishing out of guilt costs you the next good one.",
    ],
  },
  {
    id: "garrick", name: "Garrick", title: "the Drillmaster", skill: "health", home: [15, 25], radius: 4,
    look: { skin: "#a8724e", top: "#7a2e2a", bottom: "#3a3328", hair: "#1e1610", hairStyle: "bald", beard: "#2a1e14", belt: "#3a2614", scale: 1.08 },
    barks: ["Up! Again!", "Sleep is training too.", "Show up. That's the whole trick."],
    tips: [
      "Never miss twice. One skipped day is life. Two is the start of a new habit, and not the one you want.",
      "Set your bedtime, not just your alarm. Most tired mornings are decided the night before.",
      "Lay your kit out the night before. Remove every excuse you can think of while you're still motivated.",
      "Walk after your biggest meal, even ten minutes. Your body handles food better when it's moving.",
      "Eat protein at every meal and drink water before you reach for anything else.",
      "On bad days, do the smallest version: one set, five minutes, a walk round the block. Keep the chain alive.",
      "Strength comes from adding a little, often. Try one more rep or a bit more weight each week, and nothing heroic.",
    ],
  },
  {
    id: "nell", name: "Nell", title: "the Hearthkeeper", skill: "relationship", home: [25, 16], radius: 3,
    look: { skin: "#e3b896", top: "#8a5a6a", bottom: "#5a3a3a", hair: "#7a3a1e", hairStyle: "long", hat: { kind: "scarf", color: "#c9a55a" }, apron: "#ece2c8" },
    barks: ["The kettle's always on.", "Small kindnesses, every day.", "Ask them about their day. Then listen."],
    tips: [
      "Put your phone in another room for dinner. Undivided attention is the rarest gift you can give.",
      "Ask a real question and then listen to the whole answer without planning your reply.",
      "Say the appreciation out loud. Thinking 'they did well' does nothing until they hear it.",
      "Keep one evening a week that belongs to the two of you, and protect it like a meeting you can't move.",
      "When you argue, argue about the thing, not the person. And fix it before you sleep if you can.",
      "Learn what makes them feel loved. It's often not what makes you feel loved.",
      "Remember the small things they mention. Bringing them up later says 'I was listening'.",
    ],
  },
  {
    id: "tamsin", name: "Tamsin", title: "the Drifter", skill: null, home: [20, 18], radius: 9,
    look: { skin: "#d2a07a", top: "#4a5a3a", bottom: "#3a3a30", hair: "#5a4a3a", hat: { kind: "hood", color: "#56603f" }, robe: "#4f5a3c", staff: true, satchel: "#5a4128" },
    barks: ["Two roads, same feet.", "I've walked both. One's longer.", "Today counts. Quietly."],
    tips: [
      "The tavern isn't the enemy. Pretending you weren't there is. Log it honestly and the path straightens itself.",
      "Make the good choice easy and the bad one awkward. Hide the snacks, mute the app, move the guitar to the middle of the room.",
      "Don't try to change everything this week. Pick the one habit that would make the others easier.",
      "Swap, don't just stop. A bad habit usually fills a need, so give the need something better to do.",
      "Look at the gap on the Future tab. The difference between the paths is built out of days exactly like today.",
      "Plan for the bad day in advance: 'when I'm tired, I'll do the five-minute version.' Decide while you're strong.",
      "Being honest about your record is the only way the projection tells you the truth.",
    ],
  },
];

/** Days since any habit trained this skill (0 = today). null if never. */
function lastTrained(state: GameState, skill: SkillId): number | null {
  const ids = new Set(state.habits.filter((h) => h.type === "pos" && (h.skill === skill || h.skill2 === skill)).map((h) => h.id));
  const d = new Date();
  for (let n = 0; n < 400; n++) {
    const log = state.logs[dayKey(d)] || {};
    if (Object.keys(log).some((id) => ids.has(id) && log[id] > 0)) return n;
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/** First page of conversation: what this wanderer notices about you. */
export function observe(w: Wanderer, state: GameState, c: Computed): string {
  if (!w.skill) {
    const keep = Object.keys(c.xp).reduce((a, k) => a + levelFor(project(c.xp[k as SkillId], c.rate[k as SkillId], 1)), 0);
    const slide = Object.keys(c.xp).reduce((a, k) => a + levelFor(project(c.xp[k as SkillId], c.oppRate[k as SkillId], 1)), 0);
    const negIds = new Set(state.habits.filter((h) => h.type === "neg").map((h) => h.id));
    let vices = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const log = state.logs[dayKey(d)] || {};
      for (const id in log) if (negIds.has(id)) vices += log[id];
      d.setDate(d.getDate() - 1);
    }
    if (!state.habits.length) return "New face. Before you walk anywhere, decide what you're walking toward. The Habits tab is a good place to start.";
    const gap = keep - slide;
    const v = vices ? `You've logged ${vices} trip${vices === 1 ? "" : "s"} to the tavern this week. ` : "No tavern visits logged this week. Good. ";
    return `${v}A year from now, keep this up and your total level is about ${keep}. Let it slide and it's ${slide}. That's a gap of ${gap} levels, and it's built one ordinary day at a time.`;
  }
  const sk = SK[w.skill];
  const xp = c.xp[w.skill],
    lvl = levelFor(xp),
    pace = c.rate[w.skill];
  const habits = state.habits.filter((h) => h.type === "pos" && (h.skill === w.skill || h.skill2 === w.skill));
  if (!habits.length) return `You've no habit that trains ${sk.name} yet. Add one in the Habits tab, even a small one, and I'll have something to say about your progress.`;
  const since = lastTrained(state, w.skill);
  const best = habits.map((h) => ({ h, s: streak(state, h.id) })).sort((a, b) => b.s - a.s)[0];
  const yr = levelFor(project(xp, pace, 1));
  const band = BANDS[w.skill][Math.min(4, Math.floor((lvl - 1) / 20))];
  const parts: string[] = [];
  parts.push(`${sk.name} level ${lvl}. "${band}"`);
  if (since === null) parts.push(`You haven't trained it yet, and it rusts ${fmt(100)} XP every day you don't.`);
  else if (since === 0) parts.push("You've trained it today. Good.");
  else if (since === 1) parts.push("You trained it yesterday. Today's still open.");
  else parts.push(`It's been ${since} days since you trained it. It's been rusting ${fmt(100)} XP a day.`);
  if (best && best.s > 1) parts.push(`Your ${best.h.name.toLowerCase()} streak is ${best.s} days. Don't break it.`);
  parts.push(pace >= 0 ? `At your current pace you'll be level ${yr} in a year.` : `At your current pace you're losing ground. In a year you'd be level ${yr}.`);
  return parts.join(" ");
}

/** A tip the wanderer hasn't just given. */
export function tip(w: Wanderer, avoid: number[]): { text: string; index: number } {
  const pool = w.tips.map((_, i) => i).filter((i) => !avoid.includes(i));
  const index = (pool.length ? pool : w.tips.map((_, i) => i))[Math.floor(Math.random() * (pool.length || w.tips.length))];
  return { text: w.tips[index], index };
}

/** Plain-text summary of the player's record that a Claude-powered wanderer can read. */
export function buildRecord(state: GameState, c: Computed): string {
  const L: string[] = [];
  const today = new Date();
  L.push(`Today: ${dayKey(today)}. Days of data in the pace window: ${c.days}. Days with any training: ${c.daysTrained}.`);
  L.push("Skills (level, XP, pace XP/day over the last 30 days, days since last trained, level in 1 year if they keep going / if they let it slide):");
  (Object.keys(SK) as SkillId[]).forEach((id) => {
    const since = lastTrained(state, id);
    L.push(`- ${SK[id].name}: level ${levelFor(c.xp[id])}, ${fmt(c.xp[id])} XP, pace ${c.rate[id] >= 0 ? "+" : ""}${fmt(c.rate[id])}/day, ${since === null ? "never trained" : since === 0 ? "trained today" : `last trained ${since} days ago`}, 1y keep ${levelFor(project(c.xp[id], c.rate[id], 1))} / slide ${levelFor(project(c.xp[id], c.oppRate[id], 1))}`);
  });
  const reps = (hid: string, days: number) => {
    let n = 0;
    const d = new Date();
    for (let i = 0; i < days; i++) {
      n += (state.logs[dayKey(d)] || {})[hid] || 0;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };
  L.push("Habits (type, skill, XP per rep, where, current streak, reps in last 7 / 30 days):");
  if (!state.habits.length) L.push("- none yet");
  state.habits.forEach((h) =>
    L.push(`- "${h.name}": ${h.type === "neg" ? "tears down" : "builds"} ${SK[h.skill].name}${h.skill2 ? " (+" + SK[h.skill2].name + ")" : ""}, ${h.xp} XP${h.type === "neg" ? ", at the " + (h.place ?? "tavern") : ""}, streak ${streak(state, h.id)}d, ${reps(h.id, 7)} / ${reps(h.id, 30)}`),
  );
  const names = new Map(state.habits.map((h) => [h.id, h.name]));
  L.push("Last 14 days of logs:");
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    const log = state.logs[dayKey(d)] || {};
    const items = Object.entries(log).filter(([id]) => names.has(id)).map(([id, n]) => `${names.get(id)} x${n}`);
    L.push(`- ${dayKey(d)}: ${items.length ? items.join(", ") : "nothing logged"}`);
    d.setDate(d.getDate() - 1);
  }
  return L.join("\n");
}
