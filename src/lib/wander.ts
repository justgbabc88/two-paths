// Calls the /api/wander function so a wanderer can answer with Claude.
import { supabase } from "./supabase";

export type WanderTurn = { role: "user" | "assistant"; content: string };
export type WanderResult = { ok: true; reply: string } | { ok: false; reason: "offline" | "not_configured" | "busy" | "refused" | "error" };

export async function askWanderer(wanderer: string, record: string, messages: WanderTurn[]): Promise<WanderResult> {
  if (!supabase) return { ok: false, reason: "offline" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: "offline" };
  try {
    const res = await fetch("/api/wander", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ wanderer, record, messages }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.reply) return { ok: true, reply: body.reply };
    if (body.error === "refused") return { ok: false, reason: "refused" };
    if (res.status === 503 || res.status === 404) return { ok: false, reason: "not_configured" };
    if (res.status === 429) return { ok: false, reason: "busy" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "offline" };
  }
}
