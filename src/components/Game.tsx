import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEED, SKILLS, type GameState, type Habit, type SkillId } from "../game/data";
import { compute, dayKey, emptyState, isGameState, parseKey, snapLevels, tally, uid } from "../game/logic";
import { World, habitsAtStation, type Station } from "../game/world";
import { Sync, loadLocal, type SyncStatus } from "../lib/persistence";
import { FuturePane } from "./FuturePane";
import { HabitsPane, dayLabel } from "./HabitsPane";
import { GroundMenu, StationMenu } from "./StationMenu";
import { Dialogue } from "./Dialogue";
import type { Wanderer } from "../game/wanderers";
import { StatsPane } from "./StatsPane";

type Tab = "stats" | "future" | "habits";
interface Line { id: number; text: string; cls?: string }

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
      openDialogue: (w) => {
        setMenu(null);
        setGroundMenu(null);
        setTalking(w);
        chat(`You talk to ${w.name} ${w.title}.`, "sys");
      },
      actionDone: (h) => {
        const day = viewDayRef.current;
        const before = snapLevels(stateRef.current);
        const next = tally(stateRef.current, day, h.id, 1);
        commit(next);
        const after = snapLevels(next);
        const n = (next.logs[day] || {})[h.id] || 0;
        if (h.type === "neg") chat(`You log: ${h.name}. The path bends the wrong way. (${n} today)`, "bad");
        else chat(`You log: ${h.name}. (${n} today)`, "xp");
        let ups = 0;
        SKILLS.forEach((s) => {
          if (after[s.id] > before[s.id]) {
            chat(`Congratulations, you just advanced a ${s.name} level. Your ${s.name} level is now ${after[s.id]}.`, "lvl");
            ups++;
          } else if (after[s.id] < before[s.id]) chat(`Your ${s.name} level has dropped to ${after[s.id]}.`, "bad");
        });
        return ups;
      },
    });
    worldRef.current = w;
    if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = w; // for local testing only
    return () => {
      w.destroy();
      worldRef.current = null;
    };
  }, [chat, commit]);

  // ---- menu actions ----
  const onDo = (h: Habit) => {
    setMenu(null);
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
            <div className="sync">{sync}</div>
          </div>
          <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} className="gl" />
            <canvas ref={hudRef} className="hud" />
            <div className="hint-overlay">Click to walk. Drag to turn the camera, scroll to zoom. Right-click for options. Click a wanderer to talk.</div>
            {talking && (
              <Dialogue
                w={talking}
                state={state}
                c={c}
                onClose={() => {
                  setTalking(null);
                  worldRef.current?.endTalk();
                }}
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
        <aside className="side">
          <nav>
            {(["stats", "future", "habits"] as Tab[]).map((t) => (
              <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
          <div className="pane">
            {tab === "stats" && <StatsPane state={state} c={c} selected={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} />}
            {tab === "future" && <FuturePane c={c} horizon={horizon} onHorizon={setHorizon} />}
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

