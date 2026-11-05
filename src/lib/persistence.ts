// Replaces v1's claude.use("db") document with one row per user in
// public.game_state (user_id, state jsonb). Same behaviour as v1:
//  - localStorage is a cache so the app works offline / before sync,
//  - writes are debounced 700ms,
//  - on load the server copy wins, unless the server has no logs and this
//    device does (then this device's copy is pushed up),
//  - changes from another device arrive live (realtime) when nothing local is pending.
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { GameState } from "../game/data";
import { isGameState } from "../game/logic";
import { supabase } from "./supabase";

export type SyncStatus = "loading" | "this device" | "synced" | "saving" | "saved on this device" | "sync pending";

const cacheKey = (userId: string | null) => (userId ? "twopaths:" + userId : "twopaths");

export function loadLocal(userId: string | null): GameState | null {
  try {
    const s = localStorage.getItem(cacheKey(userId));
    if (s) {
      const o = JSON.parse(s);
      if (isGameState(o)) return o;
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

function saveLocal(userId: string | null, state: GameState) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export class Sync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private latest: GameState | null = null;
  private channel: RealtimeChannel | null = null;
  private online = false;
  private userId: string | null;
  private onRemote: (s: GameState) => void;
  private onStatus: (s: SyncStatus) => void;

  constructor(userId: string | null, onRemote: (s: GameState) => void, onStatus: (s: SyncStatus) => void) {
    this.userId = userId;
    this.onRemote = onRemote;
    this.onStatus = onStatus;
  }

  /** Reconcile with the server. Returns the state the app should use. */
  async start(local: GameState): Promise<GameState> {
    if (!supabase || !this.userId) {
      this.onStatus("this device");
      return local;
    }
    const slow = setTimeout(() => this.onStatus("sync pending"), 10000);
    const { data, error } = await supabase.from("game_state").select("state").eq("user_id", this.userId).maybeSingle();
    clearTimeout(slow);
    if (error) {
      this.onStatus("saved on this device");
      return local;
    }
    this.online = true;
    this.subscribe();
    const remote = data && isGameState(data.state) ? (data.state as GameState) : null;
    const localHasData = local.habits.length > 0 || Object.keys(local.logs).length > 0;
    if (remote) {
      const lc = Object.keys(local.logs).length,
        rc = Object.keys(remote.logs || {}).length;
      if (!(rc === 0 && lc > 0)) {
        saveLocal(this.userId, remote);
        this.onStatus("synced");
        return remote;
      }
      this.save(local);
      return local;
    }
    if (localHasData) this.save(local);
    else this.onStatus("synced");
    return local;
  }

  private subscribe() {
    if (!supabase || !this.userId) return;
    this.channel = supabase
      .channel("game_state:" + this.userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_state", filter: "user_id=eq." + this.userId }, (payload) => {
        if (this.dirty || this.timer) return; // our own pending write wins
        const st = (payload.new as { state?: unknown } | null)?.state;
        if (!isGameState(st)) return;
        if (JSON.stringify(st) === JSON.stringify(this.latest)) return; // echo of our own save
        saveLocal(this.userId, st);
        this.latest = st;
        this.onRemote(st);
        this.onStatus("synced");
      })
      .subscribe();
  }

  /** v1 persist(): cache locally now, push to the server after 700ms of quiet. */
  save(state: GameState) {
    this.latest = state;
    this.dirty = true;
    saveLocal(this.userId, state);
    if (!supabase || !this.userId || !this.online) return;
    if (this.timer) clearTimeout(this.timer);
    this.onStatus("saving");
    this.timer = setTimeout(() => void this.flush(), 700);
  }

  private async flush() {
    this.timer = null;
    if (!this.dirty || !supabase || !this.userId || !this.latest) return;
    this.dirty = false;
    const { error } = await supabase
      .from("game_state")
      .upsert({ user_id: this.userId, state: this.latest, updated_at: new Date().toISOString() });
    if (error) {
      this.dirty = true;
      this.onStatus("saved on this device");
    } else if (!this.dirty) this.onStatus("synced");
  }

  /** Push any pending write immediately (tab hidden / closing). */
  flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      void this.flush();
    }
  }

  stop() {
    this.flushNow();
    if (this.channel && supabase) void supabase.removeChannel(this.channel);
    this.channel = null;
  }
}
