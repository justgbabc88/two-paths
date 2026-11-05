import { useEffect, useRef, useState } from "react";
import type { GameState } from "../game/data";
import type { Computed } from "../game/logic";
import { buildRecord, observe, tip, type Wanderer } from "../game/wanderers";
import { askWanderer, type WanderTurn } from "../lib/wander";

interface Props {
  w: Wanderer;
  state: GameState;
  c: Computed;
  onClose(): void;
}

// Conversation with a wanderer. Answers come from Claude when the server is set up;
// otherwise the wanderer falls back to their written lines.
export function Dialogue({ w, state, c, onClose }: Props) {
  const [turns, setTurns] = useState<WanderTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(true);
  const [text, setText] = useState("");
  const [given, setGiven] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const started = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const fallback = (q: string): string => {
    if (/advice|tip|another/i.test(q)) {
      const t = tip(w, given);
      setGiven((g) => [...g, t.index].slice(-(w.tips.length - 1)));
      return t.text;
    }
    return observe(w, state, c);
  };

  const ask = async (q: string) => {
    if (busy) return;
    const next: WanderTurn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    if (!ai) {
      setTurns([...next, { role: "assistant", content: fallback(q) }]);
      return;
    }
    setBusy(true);
    const r = await askWanderer(w.id, buildRecord(state, c), next);
    setBusy(false);
    if (r.ok) {
      setTurns([...next, { role: "assistant", content: r.reply }]);
      return;
    }
    if (r.reason === "not_configured" || r.reason === "offline") {
      setAi(false);
      setNote("Using written lines (Claude isn't connected here).");
    } else if (r.reason === "busy") setNote("Lots of travellers today. Using written lines for now.");
    else setNote("");
    setTurns([...next, { role: "assistant", content: fallback(q) }]);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void ask("Hello. How am I doing?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [turns, busy]);

  return (
    <div className="dialogue" role="dialog" aria-label={"Talking to " + w.name}>
      <div className="dname">
        {w.name} <span>{w.title}</span>
      </div>
      <div className="dbody" ref={bodyRef}>
        {turns.map((t, i) =>
          t.role === "assistant" ? (
            <p key={i}>{t.content}</p>
          ) : i === 0 ? null : (
            <p key={i} className="you">
              You: {t.content}
            </p>
          ),
        )}
        {busy && <p className="thinking">{w.name} thinks it over…</p>}
      </div>
      <form
        className="dask"
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (!q) return;
          setText("");
          void ask(q);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${w.name} anything…`} maxLength={300} disabled={busy} />
        <button disabled={busy || !text.trim()}>Ask</button>
      </form>
      <div className="dopts">
        <button onClick={() => void ask("Any advice for me?")} disabled={busy}>
          Any advice?
        </button>
        <button onClick={() => void ask("How am I doing?")} disabled={busy}>
          How am I doing?
        </button>
        <button className="bye" onClick={onClose}>
          Goodbye.
        </button>
        {note && <span className="dnote">{note}</span>}
      </div>
    </div>
  );
}
