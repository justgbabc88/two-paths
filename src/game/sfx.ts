// Small synthesized sounds (no audio files): coins, chimes, a fanfare for level-ups.
import type { Rarity } from "./rewards";

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("twopaths-mute") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("twopaths-mute", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One note: frequency, start offset (s), length (s), volume, wave. */
function note(f: number, at: number, len: number, vol = 0.15, type: OscillatorType = "triangle") {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(),
    g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.05);
}

export const sfx = {
  coin() {
    note(988, 0, 0.08, 0.1, "square");
    note(1319, 0.07, 0.25, 0.1, "square");
  },
  xp() {
    note(660, 0, 0.18, 0.08, "sine");
    note(880, 0.06, 0.3, 0.07, "sine");
  },
  bad() {
    note(220, 0, 0.25, 0.1, "sawtooth");
    note(165, 0.12, 0.4, 0.08, "sawtooth");
  },
  levelUp() {
    // a short rising fanfare
    [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.11, 0.3, 0.13, "square"));
    note(1047, 0.48, 0.9, 0.1, "triangle");
    note(1319, 0.48, 0.9, 0.08, "triangle");
    note(1568, 0.48, 0.9, 0.06, "triangle");
  },
  loot(r: Rarity) {
    const seq = { common: [784, 988], uncommon: [659, 880, 1175], rare: [587, 784, 988, 1319], legendary: [523, 659, 784, 1047, 1319, 1568] }[r];
    seq.forEach((f, i) => note(f, i * 0.08, 0.35 + i * 0.05, 0.11, r === "legendary" ? "square" : "triangle"));
  },
  streak() {
    [392, 523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.07, 0.4, 0.1, "triangle"));
  },
  freeze() {
    [1568, 1319, 1175, 1568].forEach((f, i) => note(f, i * 0.06, 0.5, 0.06, "sine"));
  },
};
