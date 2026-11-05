// Vercel function: a wanderer speaks, powered by Claude.
// POST /api/wander  { wanderer, record, messages }  with  Authorization: Bearer <Supabase access token>
// Needs ANTHROPIC_API_KEY in the Vercel project's environment variables.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-opus-5-5";

interface Persona {
  name: string;
  title: string;
  area: string;
  voice: string;
}

// Who each wanderer is. The client only sends the id, so personas can't be rewritten from the browser.
const PERSONAS: Record<string, Persona> = {
  marta: { name: "Marta", title: "the Prospector", area: "Wealth: saving, spending, debt, investing, money habits", voice: "Weathered, practical, dry humour. Talks about money like ore: slow, patient digging." },
  aldous: { name: "Brother Aldous", title: "keeper of the standing stone", area: "Mind: calm, focus, stress, meditation, attention, mood", voice: "Gentle, unhurried, warm. Short sentences. Never preachy." },
  pip: { name: "Pip", title: "the Peddler", area: "Business: outreach, sales, deep work, focus at work, building a company", voice: "Quick, upbeat, a market hustler with sharp practical instincts." },
  wen: { name: "Old Wen", title: "the Archivist", area: "Learning: reading, study, skills, practice, curiosity", voice: "Kindly, a little wry, loves a good question." },
  garrick: { name: "Garrick", title: "the Drillmaster", area: "Health: training, sleep, food, drink, energy", voice: "Blunt, encouraging, a coach who believes in you but won't let you off the hook." },
  nell: { name: "Nell", title: "the Hearthkeeper", area: "Relationship: partner, family, friends, presence, attention at home", voice: "Warm, perceptive, grandmotherly but sharp." },
  tamsin: { name: "Tamsin", title: "the Drifter", area: "The whole picture: the two paths, bad habits and vices (drinking, weed, vaping, junk food, doomscrolling, gambling), and how small daily choices compound", voice: "Calm, honest, has walked both paths. Never judges, never lectures. Straight talk." },
};

function systemPrompt(p: Persona): string {
  return `You are ${p.name} ${p.title}, a wanderer in Two Paths, a small fantasy village that is really a habit tracker. The player logs real habits from their real life by walking to places in the village: build-up habits earn XP in six skills (Business, Health, Relationship, Mind, Learning, Wealth), and tear-down habits (drinking at the tavern, weed or vaping at the smoke shack, junk food at the sweet stall, doomscrolling at the den) cost XP. Every skill also loses 100 XP on any day it isn't trained. The game's idea is that tiny daily choices look like nothing on the day and compound into very different lives over years.

Your area: ${p.area}.
Your voice: ${p.voice}

How to talk:
- Stay in character, but the advice must be real, specific and usable today. You are talking to a real person about their real life.
- Use the player's record (in <record>) to notice concrete things: habit names, streaks, skills that are rusting, recent bad-habit logs, where their projection is heading. Never invent numbers or habits that are not in the record.
- Keep each reply to 2 to 4 short sentences of plain speech. No lists, no headings, no emoji, no em dashes.
- On bad habits like drinking, weed, vaping, junk food, gambling or scrolling: be honest and non-judgemental. Focus on the trade-off, the trigger, a smaller version, a swap, or making the habit less convenient. Don't shame, and don't pretend logging it was wrong. Logging it honestly is the point.
- You give everyday habit advice, not medical, legal or financial-product advice. If the player describes dependence, withdrawal, or wanting to hurt themselves, step out of the light tone, say plainly that a doctor, a helpline or someone they trust is the right next step, and keep it brief and kind.
- If they ask about something outside your area, answer briefly and point them to the right wanderer if it fits.`;
}

const rate = new Map<string, number[]>();
function allowed(user: string) {
  const now = Date.now(),
    hour = 3600_000;
  const hits = (rate.get(user) ?? []).filter((t) => now - t < hour);
  if (hits.length >= 60) return false;
  hits.push(now);
  rate.set(user, hits);
  return true;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

  // Only signed-in players of this app may call Claude.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sbUrl = process.env.VITE_SUPABASE_URL,
    sbKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !sbUrl || !sbKey) return json({ error: "unauthorized" }, 401);
  const { data: auth } = await createClient(sbUrl, sbKey).auth.getUser(token);
  if (!auth?.user) return json({ error: "unauthorized" }, 401);
  if (!allowed(auth.user.id)) return json({ error: "rate_limited" }, 429);

  let body: { wanderer?: string; record?: string; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const persona = PERSONAS[body.wanderer ?? ""];
  const turns = (body.messages ?? []).slice(-12).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  if (!persona || !turns.length || turns[0].role !== "user") return json({ error: "bad_request" }, 400);

  const record = String(body.record ?? "").slice(0, 12000);
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((m, i) => ({
    role: m.role as "user" | "assistant",
    content: i === 0 ? `<record>\n${record}\n</record>\n\n${m.content.slice(0, 800)}` : m.content.slice(0, 800),
  }));

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: systemPrompt(persona),
      messages,
    });
    if (res.stop_reason === "refusal") return json({ reply: null, error: "refused" });
    const reply = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return json({ reply: reply || null });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "not_configured" }, 503);
    if (err instanceof Anthropic.APIError) return json({ error: "upstream", status: err.status }, 502);
    return json({ error: "upstream" }, 502);
  }
}
