// Timed focus sessions: deep work, study and meditation.
// You pick a length, your character works at the right place while you work in
// real life, and the timer is the proof: finishing (or the longest length you
// completed, if you stop early) logs the matching habit.
import type { GameState, Habit, SkillId } from "./data";
import type { StationId } from "./map";
import type { ActionId } from "./actions";
import { actionFor } from "./actions";
import { SITS } from "./meditation";

export type FocusKind = "deep" | "study" | "meditate";

export interface FocusDef {
  kind: FocusKind;
  label: string;
  ico: string;
  station: StationId; // where your character goes to do it
  action: ActionId;
  skill: SkillId;
  skill2: SkillId | "";
  lengths: { min: number; xp: number }[];
  /** Recognises an existing habit of this kind (any length). */
  match: RegExp;
  name(min: number): string;
  blurb: string;
}

export const FOCUS: Record<FocusKind, FocusDef> = {
  deep: {
    kind: "deep",
    label: "Deep work",
    ico: "💼",
    station: "business",
    action: "type",
    skill: "business",
    skill2: "learning",
    lengths: [
      { min: 25, xp: 150 },
      { min: 45, xp: 250 },
      { min: 60, xp: 300 },
      { min: 90, xp: 400 },
      { min: 120, xp: 500 },
      { min: 180, xp: 650 },
    ],
    match: /deep work/i,
    name: (m) => `Deep work, ${m} minutes`,
    blurb: "Phone away, one task, no tabs. Your character works at the desk with you.",
  },
  study: {
    kind: "study",
    label: "Study / read",
    ico: "📖",
    station: "learning",
    action: "read",
    skill: "learning",
    skill2: "",
    lengths: [
      { min: 15, xp: 150 },
      { min: 30, xp: 250 },
      { min: 45, xp: 350 },
      { min: 60, xp: 450 },
    ],
    match: /\b(study|studied)\b/i,
    name: (m) => `Studied ${m} minutes`,
    blurb: "A book, a course or a skill. Your character studies in the library with you.",
  },
  meditate: {
    kind: "meditate",
    label: "Meditate",
    ico: "🧘",
    station: "mind",
    action: "meditate",
    skill: "mind",
    skill2: "health",
    lengths: SITS,
    match: /meditat/i,
    name: (m) => `Meditated ${m} minutes`,
    blurb: "Sit, breathe, let thoughts pass. Your character sits by the standing stone with you.",
  },
};
export const FOCUS_KINDS = Object.values(FOCUS);

/** Which kind of session a station offers, if any. */
export const focusAt = (station: StationId): FocusDef | null => FOCUS_KINDS.find((f) => f.station === station) ?? null;

/** The longest length you fully completed after `seconds` (null if under the shortest). */
export function creditedLength(kind: FocusKind, seconds: number) {
  return [...FOCUS[kind].lengths].reverse().find((l) => seconds >= l.min * 60) ?? null;
}

/** Your existing habit for this kind and length, or a new one to add. */
export function habitForSession(state: GameState, kind: FocusKind, min: number): { habit: Habit | Omit<Habit, "id">; isNew: boolean } {
  const f = FOCUS[kind];
  const len = new RegExp(`\\b${min}\\s*-?\\s*(min|minute)`, "i");
  const found = state.habits.find((h) => h.type === "pos" && f.match.test(h.name) && len.test(h.name) && (kind !== "meditate" || actionFor(h) === "meditate"));
  if (found) return { habit: found, isNew: false };
  const xp = f.lengths.find((l) => l.min === min)?.xp ?? 200;
  return { habit: { name: f.name(min), skill: f.skill, skill2: kind === "meditate" && min < 20 ? "" : f.skill2, xp, type: "pos", action: f.action }, isNew: true };
}

/** A running session, kept in localStorage so a refresh doesn't lose it. */
export interface Session {
  kind: FocusKind;
  min: number;
  start: number; // ms timestamp
}
const KEY = "twopaths-session";
export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Session | null;
    // drop anything abandoned for more than a day
    return s && FOCUS[s.kind] && Date.now() - s.start < 864e5 ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = Math.floor(sec % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
};
