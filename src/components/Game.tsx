import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEED, SKILLS, type GameState, type Habit, type SkillId } from "../game/data";
import { compute, dayKey, emptyState, isGameState, parseKey, snapLevels, tally, uid } from "../game/logic";
import { World, habitsAtStation, type Station } from "../game/world";
import { Sync, loadLocal, type SyncStatus } from "../lib/persistence";
import { FuturePane } from "./FuturePane";
import { HabitsPane, dayLabel } from "./HabitsPane";
import { GroundMenu, StationMenu } from "./StationMenu";
import { Dialogue } from "./Dialogue";
import { ForkPanel } from "./ForkPanel";
import { futureLook, todayLook } from "../game/appearance";
import { QUESTS, isFinished, statusOf, type Quest } from "../game/quests";
import { QuestsPane } from "./QuestsPane";
import { ShopPanel } from "./ShopPanel";
import { GardenPanel } from "./GardenPanel";
import { CalendarPanel } from "./CalendarPanel";
import { habitForSit } from "../game/meditation";
import { ITEM, flowFor, gp, money, type ShopItem } from "../game/economy";
import type { Custom } from "../game/data";
import type { Wanderer } from "../game/wanderers";
import { StatsPane } from "./StatsPane";
import { unmetRequirement, FREEZE_PRICE, MAX_FREEZES, RARITY_COLOR, STREAK_MILESTONES, freezesNeeded, lootLog, milestoneBounty, newMilestones, streakBounty, streakInfo } from "../game/rewards";
import { isMuted, setMuted, sfx } from "../game/sfx";
import { FOCUS, focusAt, habitForSession, loadSession, saveSession, type FocusKind, type Session } from "../game/sessions";
import { FocusPicker, FocusTimer } from "./FocusPanel";
import { bell } from "../game/meditation";
import { KingDialog } from "./KingDialog";

type Tab = "stats" | "future" | "quests" | "habits";
interface Line { id: number; text: string; cls?: string }
interface Banner { id: number; kicker: string; title: string; sub?: string; color: string; big?: boolean }

let lineId = 0;

export function Game({ userId, onSignOut }: { userId: string | null; onSignOut?: () => void }) {
  const [state, setStateRaw] = useState<GameState>(() => loadLocal(userId) ?? emptyState());
  const [viewDay, setViewDay] = useState(() => dayKey(new Date()));
  const [horizon, setHorizon] = useState(1);
  const [selected, setSelected] = useState<SkillId | null>(null);
  const [tab, setTab] = useState<Tab>("stats");
  const [sync, setSync] = useState<SyncStatus>("loading");
  const [lines, setLines] = useState<Line[]>([]);
  const [menu, setMenu] = useState<{ s: Station; pos: { x: number; y: number } } | null>(null);
  const [talking, setTalking] = useState<Wanderer | null>(null);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 760); // phones start with the world in view
  const [volley, setVolley] = useState<{ rally: number; best: number; window: boolean } | null>(null);
  const [shop, setShop] = useState<"shop" | "wardrobe" | "bank" | null>(null);
  const [fork, setFork] = useState<{ years: number; path: "keep" | "slide" } | null>(null);
  const forkRef = useRef(fork);
  forkRef.current = fork;
  const [indoors, setIndoors] = useState<string | null>(null);
  const [audience, setAudience] = useState(false);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [picker, setPicker] = useState<{ kind?: FocusKind } | null>(null);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [muted, setMute] = useState(isMuted);
  const [groundMenu, setGroundMenu] = useState<{ tile: [number, number]; pos: { x: number; y: number } } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const syncRef = useRef<Sync | null>(null);
  const stateRef = useRef(state);
  const viewDayRef = useRef(viewDay);
  viewDayRef.current = viewDay;

  const c = useMemo(() => compute(state), [state]);
  const streak = useMemo(() => streakInfo(state), [state]);

  const banner = useCallback((b: Omit<Banner, "id">) => setBanners((bs) => (bs.length >= 4 ? bs : [...bs, { ...b, id: ++lineId }])), []);
  useEffect(() => {
    if (!banners.length) return;
    const t = setTimeout(() => setBanners((bs) => bs.slice(1)), banners[0].big ? 3600 : 2800);
    return () => clearTimeout(t);
  }, [banners]);

  const chat = useCallback((text: string, cls?: string) => {
    setLines((ls) => [...ls, { id: ++lineId, text, cls }].slice(-60));
  }, []);

  /** v1 persist(): every change goes through here. */
  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    setStateRaw(next);
    syncRef.current?.save(next);
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // ---- boot: welcome lines + sync ----
  const welcomed = useRef(false);
  useEffect(() => {
    if (!welcomed.current) {
      welcomed.current = true;
      chat("Welcome to Two Paths.", "lvl");
      chat("Walk to a station and work there. Every action you take here is one you really did today.", "sys");
      chat("Click to walk, drag to turn the camera, scroll to zoom, right-click for options. Explore beyond the village: keep, woods, farms, coast, and the island.", "hint");
      if (!stateRef.current.habits.length) chat("No habits yet. Open the Habits tab and add the starter set.", "hint");
    }
    const s = new Sync(
      userId,
      (remote) => {
        stateRef.current = remote;
        setStateRaw(remote);
      },
      setSync,
    );
    syncRef.current = s;
    let alive = true;
    s.start(stateRef.current).then((st) => {
      if (!alive) return;
      stateRef.current = st;
      setStateRaw(st);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") s.flushNow();
    };
    const onPageHide = () => s.flushNow();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      s.stop();
      syncRef.current = null;
    };
  }, [userId, chat]);

  // ---- canvas world ----
  useEffect(() => {
    const w = new World(canvasRef.current!, hudRef.current!, {
      chat,
      openStation: (s, pos) => {
        if (forkRef.current) {
          chat("You can't change the future from here. Return to today to log a habit.", "hint");
          return;
        }
        setGroundMenu(null);
        setMenu({ s, pos: { ...pos } });
      },
      openGroundMenu: (tile, pos) => {
        setMenu(null);
        setGroundMenu({ tile, pos: { ...pos } });
      },
      closeMenu: () => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(null);
      },
      inside: (name) => {
        setIndoors(name);
        if (!name) setAudience(false);
        if (name === "Glacier Court") {
          const st = stateRef.current;
          commit({ ...st, secrets: { ...st.secrets, visits: (st.secrets?.visits ?? 0) + 1 } });
          setTimeout(() => sfx.loot("legendary"), 400);
        }
      },
      audience: () => setAudience(true),
      volley: (v) => {
        setVolley((old) => (old && v && old.rally === v.rally && old.best === v.best && old.window === v.window ? old : v));
        const saved = stateRef.current.bestRally ?? 0;
        if (v && v.best > saved) commit({ ...stateRef.current, bestRally: v.best });
      },
      openGarden: () => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(null);
        setGardenOpen(true);
        chat("You step into the garden. The village noise falls away.", "hint");
      },
      openShop: () => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(null);
        setShop("shop");
        chat("Welcome to the general store. Everything here is paid for with good days.", "hint");
      },
      openFork: () => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(null);
        setFork((f) => f ?? { years: 5, path: "keep" });
        chat("You step up to the Fork. The village shifts around you.", "lvl");
      },
      openDialogue: (w) => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(w);
        chat(`You talk to ${w.name} ${w.title}.`, "sys");
      },
      actionDone: (h) => {
        const day = viewDayRef.current;
        const before = snapLevels(stateRef.current);
        const streakBefore = streakInfo(stateRef.current).current;
        const next = tally(stateRef.current, day, h.id, 1);
        commit(next);
        const after = snapLevels(next);
        const n = (next.logs[day] || {})[h.id] || 0;
        if (h.type === "neg") chat(`You log: ${h.name}. The path bends the wrong way. (${n} today)`, "bad");
        else chat(`You log: ${h.name}. (${n} today)`, "xp");
        const f = flowFor(h);
        if (f.kind === "cost") chat(`That cost you ${gp(f.amount)}.`, "bad");
        else if (f.kind === "deposit") chat(`${gp(f.amount)} goes into the bank.`, "xp");
        else chat(`You earn ${gp(f.amount)}${f.kind === "wage" ? " in wages" : ""}.`, "xp");
        worldRef.current?.moneyDrop((f.kind === "cost" ? "-" : "+") + f.amount + (f.kind === "deposit" ? " bank" : ""), f.kind === "cost");
        if (h.type === "neg") sfx.bad();
        else sfx.coin();
        let ups = 0;
        SKILLS.forEach((s) => {
          if (after[s.id] > before[s.id]) {
            chat(`Congratulations, you just advanced a ${s.name} level. Your ${s.name} level is now ${after[s.id]}.`, "lvl");
            banner({ kicker: "Level up!", title: `${s.ico} ${s.name} ${after[s.id]}`, sub: after[s.id] % 5 === 0 ? "Milestone reached. A bounty is on its way." : `${5 - (after[s.id] % 5)} more to the next milestone`, color: "#e0c040", big: true });
            ups++;
          } else if (after[s.id] < before[s.id]) chat(`Your ${s.name} level has dropped to ${after[s.id]}.`, "bad");
        });
        if (ups) {
          setTimeout(() => sfx.levelUp(), 250);
          worldRef.current?.celebrate();
        }
        // loot: seeded by day, habit and rep, so this matches what the ledger says
        if (h.type === "pos") {
          const drop = lootLog(next).find((d) => d.day === day && d.hid === h.id && d.rep === n);
          if (drop) {
            const it = drop.item ? ITEM[drop.item] : drop.dup ? ITEM[drop.dup] : null;
            setTimeout(() => sfx.loot(drop.rarity), ups ? 1400 : 350);
            if (drop.item && it) {
              chat(`Loot! You found a ${drop.rarity} drop: ${it.name}. It's in the store under Loot collection.`, "lvl");
              banner({ kicker: `${drop.rarity} drop`, title: it.name, sub: "Wear it from the general store", color: RARITY_COLOR[drop.rarity], big: drop.rarity !== "uncommon" });
            } else {
              chat(drop.dup && it ? `Loot! Another ${it.name}. You already have one, so you sell it for ${gp(drop.gold)}.` : `Loot! You find a pouch with ${gp(drop.gold)}.`, "xp");
              worldRef.current?.moneyDrop("+" + drop.gold + " loot", false);
              if (drop.rarity !== "common") banner({ kicker: `${drop.rarity} drop`, title: `+${gp(drop.gold)}`, sub: drop.dup && it ? `Spare ${it.name}, sold` : "A heavy pouch of gold", color: RARITY_COLOR[drop.rarity] });
            }
          }
        }
        const streakAfter = streakInfo(next).current;
        if (streakAfter > streakBefore) {
          if (STREAK_MILESTONES.includes(streakAfter)) {
            chat(`${streakAfter}-day streak! Bounty: ${gp(streakBounty(streakAfter))}.`, "lvl");
            banner({ kicker: "Streak", title: `🔥 ${streakAfter} days`, sub: `+${gp(streakBounty(streakAfter))} bounty`, color: "#f07a2a", big: true });
            setTimeout(() => sfx.streak(), 600);
          } else if (streakAfter > 1) chat(`🔥 ${streakAfter}-day streak. Keep it going tomorrow.`, "hint");
          else chat("🔥 Streak started. Do one good thing tomorrow to keep it.", "hint");
        }
        return ups;
      },
    });
    worldRef.current = w;
    w.setVolleyBest(stateRef.current.bestRally ?? 0);
    const running = loadSession();
    if (running) w.startFocus(FOCUS[running.kind].station, FOCUS[running.kind].action); // pick a session back up after a refresh
    if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = w; // for local testing only
    return () => {
      w.destroy();
      worldRef.current = null;
    };
  }, [chat, commit]);

  // ---- the village reflects your record (or your projected future) ----
  const look = useMemo(() => (fork ? futureLook(state, c, fork.years, fork.path) : todayLook(state, c)), [state, c, fork]);
  useEffect(() => {
    worldRef.current?.applyLook(look);
  }, [look]);

  // ---- quests ----
  useEffect(() => {
    worldRef.current?.setQuestGivers([...new Set(QUESTS.filter((q) => statusOf(state, q) === "available").map((q) => q.giver))]);
  }, [state]);
  useEffect(() => {
    // mark quests complete as soon as every step is done
    const finished = QUESTS.filter((q) => statusOf(state, q) === "active" && isFinished(state, state.quests![q.id], q));
    if (!finished.length) return;
    const quests = { ...state.quests };
    finished.forEach((q) => (quests[q.id] = { ...quests[q.id], done: dayKey(new Date()) }));
    commit({ ...state, quests });
    finished.forEach((q) => chat(`Congratulations, you've completed a quest: ${q.name}! (+${q.points} quest points)`, "lvl"));
    worldRef.current?.celebrate();
  }, [state, commit, chat]);
  const acceptQuest = (q: Quest) => {
    const st = stateRef.current;
    commit({ ...st, quests: { ...st.quests, [q.id]: { started: dayKey(new Date()), tasks: [] } } });
    chat(`Quest started: ${q.name}. It's in your Quests tab.`, "lvl");
  };
  const toggleTask = (q: Quest, i: number) => {
    const st = stateRef.current;
    const rec = st.quests?.[q.id];
    if (!rec) return;
    const tasks = rec.tasks.includes(i) ? rec.tasks.filter((x) => x !== i) : [...rec.tasks, i];
    commit({ ...st, quests: { ...st.quests, [q.id]: { ...rec, tasks } } });
  };
  const abandonQuest = (q: Quest) => {
    const st = stateRef.current;
    const quests = { ...st.quests };
    delete quests[q.id];
    commit({ ...st, quests });
  };

  // ---- timed focus sessions ----
  const keepAwake = async (on: boolean) => {
    try {
      if (on) {
        const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
        wakeRef.current = (await nav.wakeLock?.request("screen")) ?? null;
      } else {
        await wakeRef.current?.release();
        wakeRef.current = null;
      }
    } catch {
      /* not supported, or the tab is hidden */
    }
  };
  const startSession = (kind: FocusKind, min: number) => {
    const s: Session = { kind, min, start: Date.now() };
    saveSession(s);
    setSession(s);
    setPicker(null);
    setMenu(null);
    const f = FOCUS[kind];
    worldRef.current?.startFocus(f.station, f.action);
    chat(`${f.ico} ${min}-minute ${f.label.toLowerCase()} session started. Do it for real; your character is doing it with you.`, "lvl");
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    void keepAwake(true);
  };
  const endSession = useCallback(
    (credit: number | null) => {
      const s = loadSession();
      saveSession(null);
      setSession(null);
      void keepAwake(false);
      worldRef.current?.endFocus();
      if (!s) return;
      const f = FOCUS[s.kind];
      if (!credit) {
        chat(`Session ended before ${f.lengths[0].min} minutes. Not logged, but it still counts for something.`, "sys");
        return;
      }
      let st = stateRef.current;
      const found = habitForSession(st, s.kind, credit);
      let habit: Habit;
      if (found.isNew) {
        habit = { id: uid(), ...(found.habit as Omit<Habit, "id">) };
        st = { ...st, habits: [...st.habits, habit] };
        commit(st);
        chat(`Added habit: ${habit.name}.`, "hint");
      } else habit = found.habit as Habit;
      setViewDay(dayKey(new Date()));
      viewDayRef.current = dayKey(new Date());
      bell();
      chat(`The bell rings. ${credit} minutes of ${f.label.toLowerCase()}, done for real.`, "lvl");
      try {
        if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "hidden")
          new Notification("Two Paths", { body: `${f.ico} ${credit} minutes of ${f.label.toLowerCase()} done. Logged.` });
      } catch {
        /* ignore */
      }
      worldRef.current?.startAction(habit);
    },
    [chat, commit],
  );
  const sessionDone = useCallback(() => {
    // deferred so the world exists when a session finishes during a page load
    setTimeout(() => {
      const s = loadSession();
      if (s) endSession(s.min);
    }, 300);
  }, [endSession]);

  // ---- rewards: level milestones and streak freezes (only once real data has loaded) ----
  const loaded = sync !== "loading";
  useEffect(() => {
    if (!loaded) return;
    const ms = newMilestones(state, c);
    if (!ms.length) return;
    const milestones = { ...state.milestones };
    ms.forEach(([sk, lvl]) => (milestones[sk] = Math.max(milestones[sk] ?? 0, lvl)));
    commit({ ...state, milestones });
    const total = ms.reduce((a, [, l]) => a + milestoneBounty(l), 0);
    ms.forEach(([sk, lvl]) => chat(`Milestone: ${SKILLS.find((x) => x.id === sk)!.name} level ${lvl}. Bounty ${gp(milestoneBounty(lvl))}.`, "lvl"));
    worldRef.current?.moneyDrop("+" + total + " bounty", false);
  }, [loaded, state, c, commit, chat]);
  useEffect(() => {
    if (!loaded) return;
    const days = freezesNeeded(state);
    if (!days.length) return;
    const f = state.freezes ?? { bought: 0, used: [] };
    commit({ ...state, freezes: { ...f, used: [...f.used, ...days] } });
    chat(`❄️ A streak freeze covered ${days.length === 1 ? "yesterday" : days.length + " missed days"}. Your streak lives on.`, "lvl");
    sfx.freeze();
  }, [loaded, state, commit, chat]);
  const buyFreeze = () => {
    const st = stateRef.current;
    const s = streakInfo(st);
    if (money(st).wallet < FREEZE_PRICE || s.held >= MAX_FREEZES) return;
    const f = st.freezes ?? { bought: 0, used: [] };
    commit({ ...st, freezes: { ...f, bought: f.bought + 1 } });
    chat(`You buy a streak freeze for ${gp(FREEZE_PRICE)}. It'll cover a day you miss.`, "lvl");
    sfx.freeze();
  };

  // ---- zen garden ----
  useEffect(() => {
    worldRef.current?.setGarden(state.garden, state.created);
  }, [state.garden, state.created]);
  const saveGarden = (g: GameState["garden"]) => commit({ ...stateRef.current, garden: g });

  // ---- money, shop and wardrobe ----
  const purse = useMemo(() => money(state), [state]);
  const buyItem = (it: ShopItem) => {
    const st = stateRef.current;
    if (money(st).wallet < it.price || (st.owned ?? []).includes(it.id) || it.loot || it.secret) return;
    const why = unmetRequirement(it, st, compute(st));
    if (why) {
      chat(`${it.name}: ${why.toLowerCase()}.`, "bad");
      return;
    }
    commit({ ...st, owned: [...(st.owned ?? []), it.id], paid: { ...st.paid, [it.id]: it.price }, custom: { ...st.custom, [it.slot]: it.id } });
    if (it.price >= 10000) {
      banner({ kicker: "Purchased", title: it.name, sub: it.blurb, color: "#e0c040", big: true });
      sfx.levelUp();
    } else sfx.coin();
    chat(`You buy the ${it.name.toLowerCase()} for ${gp(it.price)}${it.slot === "pet" ? ". It decides to follow you home" : " and put it on"}.`, "lvl");
  };
  const setCustom = (c: Custom) => commit({ ...stateRef.current, custom: c });
  const withdraw = (amount: number) => {
    const st = stateRef.current;
    if (amount <= 0 || amount > money(st).bank) return;
    commit({ ...st, withdrawals: [...(st.withdrawals ?? []), { day: dayKey(new Date()), amount }] });
    chat(`You withdraw ${gp(amount)} from the bank. It stops earning interest.`, "hint");
  };

  // ---- menu actions ----
  const onDo = (h: Habit, note: string) => {
    setMenu(null);
    if (note) {
      // keep the note in that day's journal
      const st = stateRef.current;
      const prev = st.notes?.[viewDay];
      commit({ ...st, notes: { ...st.notes, [viewDay]: (prev ? prev + "\n" : "") + `• ${h.name}: ${note}` } });
    }
    worldRef.current?.startAction(h);
  };
  const onUndo = (s: Station) => {
    const st = stateRef.current;
    const log = st.logs[viewDay] || {};
    const h = habitsAtStation(s, st.habits).find((h) => log[h.id] > 0);
    if (h) {
      commit(tally(st, viewDay, h.id, -1));
      chat("Removed one rep of " + h.name + ".", "sys");
    } else chat("Nothing logged here " + (viewDay === dayKey(new Date()) ? "today" : "that day") + ".", "sys");
    setMenu(null);
  };
  const onExamine = (s: Station) => {
    chat(s.examine, "sys");
    setMenu(null);
  };

  // ---- habits pane actions ----
  const shiftDay = (delta: number) => {
    const d = parseKey(viewDay);
    d.setDate(d.getDate() + delta);
    const k = dayKey(d);
    setViewDay(k);
    chat("Now logging for " + dayLabel(k).toLowerCase() + ".", "hint");
  };
  const addHabit = (h: Omit<Habit, "id">) => {
    commit({ ...stateRef.current, habits: [...stateRef.current.habits, { id: uid(), ...h }] });
    chat("Added habit: " + h.name + ".", "hint");
  };
  const setHabitAction = (h: Habit, action: string) => {
    commit({
      ...stateRef.current,
      habits: stateRef.current.habits.map((x) => {
        if (x.id !== h.id) return x;
        const { action: _old, ...rest } = x;
        void _old;
        return action ? { ...rest, action } : rest;
      }),
    });
  };
  const removeHabit = (h: Habit) => {
    if (!confirm(`Remove "${h.name}"? Logged XP stays in history.`)) return;
    commit({ ...stateRef.current, habits: stateRef.current.habits.filter((x) => x.id !== h.id) });
  };
  const seed = () => {
    const st = stateRef.current;
    const names = new Set(st.habits.map((h) => h.name));
    const add = SEED.filter((h) => !names.has(h.name)).map((h) => ({ id: uid(), ...h }));
    commit({ ...st, habits: [...st.habits, ...add] });
    chat("Starter habits added. Walk to a station to log one.", "hint");
  };
  const toggleTheme = () => {
    const r = document.documentElement;
    const next = r.getAttribute("data-theme") === "light" ? "dark" : "light";
    r.setAttribute("data-theme", next);
    try {
      localStorage.setItem("twopaths-theme", next);
    } catch {
      /* ignore */
    }
  };
  const reset = () => {
    if (!confirm("Delete all habits and every day of logs? This cannot be undone.")) return;
    commit(emptyState());
    setSelected(null);
  };
  const importJson = (text: string) => {
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      chat("That isn't valid JSON.", "bad");
      return;
    }
    if (!isGameState(o)) {
      chat("That doesn't look like Two Paths data.", "bad");
      return;
    }
    if (!confirm(`Import ${o.habits.length} habits and ${Object.keys(o.logs).length} logged days? This replaces what's here.`)) return;
    commit({ ...emptyState(), ...o });
    chat("Imported your v1 data.", "lvl");
  };

  return (
    <div className="app">
      <div className="frame">
        <div className="world">
          <div className="top">
            <h1>Two Paths</h1>
            <div className="topbtns">
              <button className={"wallet" + (purse.wallet < 0 ? " debt" : "")} onClick={() => setShop("bank")} title="Wallet (bank in brackets)">
                🪙 {gp(purse.wallet)} <small>(🏦 {gp(purse.bank)})</small>
              </button>
              <button
                className={"streak" + (streak.atRisk ? " risk" : streak.todayDone ? " lit" : "")}
                onClick={() => setCalendar(true)}
                title={
                  streak.current
                    ? `${streak.current}-day streak (best ${streak.best}). ${streak.todayDone ? "Today is done." : "Do one good thing today to keep it."} Freezes: ${streak.held}`
                    : "Do one good thing today to start a streak"
                }
              >
                🔥 {streak.current}
                {streak.held > 0 && <small> ❄{streak.held}</small>}
              </button>
              <button onClick={() => setShop("wardrobe")} title="Change how you look">
                Wardrobe
              </button>
              <button onClick={() => (session ? null : setPicker({}))} title="Start a timed deep work, study or meditation session" disabled={!!session}>
                ⏱ Focus
              </button>
              <button onClick={() => setCalendar(true)} title="Look back at what you did">
                📅 Calendar
              </button>
              <button
                onClick={() => {
                  setMuted(!muted);
                  setMute(!muted);
                }}
                title={muted ? "Sound off" : "Sound on"}
                aria-label={muted ? "Turn sound on" : "Turn sound off"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
              <span className="sync">{sync}</span>
            </div>
          </div>
          <div className="viewport">
            <canvas ref={canvasRef} className="gl" />
            <canvas ref={hudRef} className="hud" />
            {session && (
              <FocusTimer
                key={session.start}
                session={session}
                onDone={sessionDone}
                onEnd={() => {
                  const el = Math.floor((Date.now() - session.start) / 1000);
                  const credit = [...FOCUS[session.kind].lengths].reverse().find((l) => el >= l.min * 60);
                  endSession(credit ? credit.min : null);
                }}
              />
            )}
            {picker && <FocusPicker start={picker.kind} onStart={startSession} onClose={() => setPicker(null)} />}
            {audience && (
              <KingDialog
                crowned={!!state.secrets?.crown}
                onKneel={() => {
                  const st = stateRef.current;
                  if (st.secrets?.crown) return;
                  commit({ ...st, secrets: { ...st.secrets, crown: dayKey(new Date()) }, custom: { ...st.custom, hat: "secret-crown" } });
                  chat("The Penguin King sets a small crown on your head. The whole court bows. You are now a friend of the Glacier Court.", "lvl");
                  banner({ kicker: "Secret found", title: "👑 Penguin King's crown", sub: "It can't be bought. It can't be found. Only earned.", color: "#9ae8ff", big: true });
                  sfx.levelUp();
                  setTimeout(() => sfx.loot("legendary"), 900);
                  worldRef.current?.celebrate();
                }}
                onClose={() => setAudience(false)}
              />
            )}
            {indoors && !menu && !session && !audience && (
              <button className="leave" onClick={() => worldRef.current?.leaveBuilding()}>
                ⇦ Leave the {indoors.toLowerCase()}
              </button>
            )}
            {banners[0] && (
              <div key={banners[0].id} className={"banner" + (banners[0].big ? " big" : "")} style={{ "--rc": banners[0].color } as React.CSSProperties} onClick={() => setBanners((bs) => bs.slice(1))}>
                <small>{banners[0].kicker}</small>
                <b>{banners[0].title}</b>
                {banners[0].sub && <span>{banners[0].sub}</span>}
              </div>
            )}
            {volley && (
              <div className={"volley" + (volley.window ? " now" : "")}>
                <span>
                  🏐 Rally <b>{volley.rally}</b> · best <b>{volley.best}</b>
                </span>
                <button className="hit" onPointerDown={(e) => { e.preventDefault(); worldRef.current?.volleyHit(); }}>
                  {volley.window ? "HIT!" : "Hit"}
                </button>
                <button onClick={() => worldRef.current?.stopVolley()}>Stop</button>
              </div>
            )}
            {calendar && (
              <CalendarPanel
                state={state}
                onSaveNote={(day, text) => {
                  const notes = { ...stateRef.current.notes };
                  if (text.trim()) notes[day] = text;
                  else delete notes[day];
                  commit({ ...stateRef.current, notes });
                }}
                onPickDay={(day) => {
                  setCalendar(false);
                  setViewDay(day);
                  chat(day === dayKey(new Date()) ? "Logging for today. Walk to a station." : `Now logging for ${dayLabel(day).toLowerCase()}. Walk to a station; you'll be asked to confirm you really did it.`, "hint");
                }}
                onClose={() => setCalendar(false)}
              />
            )}
            {gardenOpen && (
              <GardenPanel
                state={state}
                onSave={saveGarden}
                onMeditate={(h) => {
                  setGardenOpen(false);
                  worldRef.current?.startAction(h);
                }}
                onSitStart={(min) => {
                  worldRef.current?.setSitting(true);
                  chat(`You settle into the garden for ${min} minutes. Breathe.`, "hint");
                }}
                onSitEnd={(min) => {
                  worldRef.current?.setSitting(false);
                  if (!min) {
                    chat("You stand up before five minutes. That one isn't logged, but it still counts for something.", "sys");
                    return;
                  }
                  // the timer is the proof: log the sit (adding the habit the first time)
                  let st = stateRef.current;
                  const found = habitForSit(st, min);
                  let habit: Habit;
                  if (found.isNew) {
                    habit = { id: uid(), ...(found.habit as Omit<Habit, "id">) };
                    st = { ...st, habits: [...st.habits, habit] };
                    commit(st);
                  } else habit = found.habit as Habit;
                  setViewDay(dayKey(new Date()));
                  viewDayRef.current = dayKey(new Date());
                  chat(`The bell rings. ${min} minutes of stillness.`, "lvl");
                  worldRef.current?.startAction(habit);
                }}
                onClose={() => setGardenOpen(false)}
              />
            )}
            {shop && (
              <ShopPanel
                key={shop}
                state={state}
                c={c}
                start={shop}
                onBuy={buyItem}
                onBuyFreeze={buyFreeze}
                onCustom={setCustom}
                onWithdraw={withdraw}
                onClose={() => setShop(null)}
              />
            )}
            {fork && (
              <ForkPanel
                c={c}
                years={fork.years}
                path={fork.path}
                onChange={(years, path) => setFork({ years, path })}
                onClose={() => {
                  setFork(null);
                  chat("You step back from the Fork. It's today again.", "sys");
                }}
              />
            )}
            {talking && (
              <Dialogue
                w={talking}
                state={state}
                c={c}
                onClose={() => {
                  setTalking(null);
                  worldRef.current?.endTalk();
                }}
                onAccept={acceptQuest}
              />
            )}
            {groundMenu && canvasRef.current && (
              <GroundMenu
                pos={groundMenu.pos}
                canvas={canvasRef.current}
                onWalk={() => {
                  worldRef.current?.walkTo(groundMenu.tile);
                  setGroundMenu(null);
                }}
                onClose={() => setGroundMenu(null)}
              />
            )}
            {menu && canvasRef.current && (
              <StationMenu
                station={menu.s}
                pos={menu.pos}
                canvas={canvasRef.current}
                state={state}
                viewDay={viewDay}
                onDo={onDo}
                onUndo={onUndo}
                onExamine={onExamine}
                onFocus={(s) => {
                  setMenu(null);
                  setPicker({ kind: focusAt(s.id)?.kind });
                }}
                onClose={() => setMenu(null)}
              />
            )}
          </div>
          <div className="chat" ref={chatRef}>
            {lines.map((l) => (
              <div key={l.id} className={l.cls}>
                {l.text}
              </div>
            ))}
          </div>
        </div>
        <aside className={"side" + (panelOpen ? "" : " collapsed")}>
          <nav>
            {(["stats", "future", "quests", "habits"] as Tab[]).map((t) => (
              <button
                key={t}
                aria-current={tab === t && panelOpen ? "page" : undefined}
                onClick={() => {
                  setTab(t);
                  setPanelOpen(true);
                }}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button className="collapse" aria-label={panelOpen ? "Hide panel" : "Show panel"} onClick={() => setPanelOpen((v) => !v)}>
              {panelOpen ? "▾" : "▴"}
            </button>
          </nav>
          <div className="pane">
            {tab === "stats" && <StatsPane state={state} c={c} selected={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} />}
            {tab === "future" && <FuturePane c={c} horizon={horizon} onHorizon={setHorizon} />}
            {tab === "quests" && <QuestsPane state={state} onToggleTask={toggleTask} onAbandon={abandonQuest} />}
            {tab === "habits" && (
              <HabitsPane
                state={state}
                viewDay={viewDay}
                onShiftDay={shiftDay}
                onAdd={addHabit}
                onRemove={removeHabit}
                onSetAction={setHabitAction}
                onSeed={seed}
                onTheme={toggleTheme}
                onReset={reset}
                onImport={importJson}
                onSignOut={onSignOut}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

