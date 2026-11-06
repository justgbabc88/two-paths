// Timed meditation in the zen garden. The timer is the proof: finishing a sit logs it.
import type { GameState, Habit } from "./data";
import { actionFor } from "./actions";

/** Session lengths you can choose, and what a sit of that length is worth. */
export const SITS = [
  { min: 5, xp: 100 },
  { min: 10, xp: 200 },
  { min: 20, xp: 350 },
  { min: 30, xp: 500 },
  { min: 45, xp: 650 },
  { min: 60, xp: 800 },
];

/** The longest session length you've fully completed after `seconds` of sitting (or null under 5 minutes). */
export function creditedSit(seconds: number) {
  return [...SITS].reverse().find((s) => seconds >= s.min * 60) ?? null;
}

/** Your existing habit for a sit of this length, or a new one to add. */
export function habitForSit(state: GameState, min: number): { habit: Habit | Omit<Habit, "id">; isNew: boolean } {
  const re = new RegExp(`\\b${min}\\s*(min|minute)`, "i");
  const found = state.habits.find((h) => h.type === "pos" && actionFor(h) === "meditate" && re.test(h.name));
  if (found) return { habit: found, isNew: false };
  const xp = SITS.find((s) => s.min === min)?.xp ?? 200;
  return { habit: { name: `Meditated ${min} minutes`, skill: "mind", skill2: min >= 20 ? "health" : "", xp, type: "pos", action: "meditate" }, isNew: true };
}

/** A soft bell, made in the browser (no sound files). */
export function bell() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [220, 440, 660, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * 1.0;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime([0.25, 0.18, 0.08, 0.04][i], now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4 - i * 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 4.2);
    });
    setTimeout(() => ctx.close(), 4500);
  } catch {
    /* no audio available */
  }
}
