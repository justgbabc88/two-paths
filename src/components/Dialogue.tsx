import { useState } from "react";
import type { GameState } from "../game/data";
import type { Computed } from "../game/logic";
import { observe, tip, type Wanderer } from "../game/wanderers";

interface Props {
  w: Wanderer;
  state: GameState;
  c: Computed;
  onClose(): void;
}

// Conversation with a wanderer: first what they notice about your record,
// then practical tips you can ask for one after another.
export function Dialogue({ w, state, c, onClose }: Props) {
  const [page, setPage] = useState<{ kind: "observe" } | { kind: "tip"; index: number; text: string }>({ kind: "observe" });
  const [given, setGiven] = useState<number[]>([]);
  const nextTip = () => {
    const t = tip(w, given);
    setGiven((g) => [...g, t.index].slice(-(w.tips.length - 1)));
    setPage({ kind: "tip", index: t.index, text: t.text });
  };
  const text = page.kind === "observe" ? observe(w, state, c) : page.text;
  return (
    <div className="dialogue" role="dialog" aria-label={"Talking to " + w.name}>
      <div className="dname">
        {w.name} <span>{w.title}</span>
      </div>
      <p>{text}</p>
      <div className="dopts">
        <button onClick={nextTip}>{page.kind === "observe" ? "Any advice?" : "Tell me another."}</button>
        {page.kind === "tip" && <button onClick={() => setPage({ kind: "observe" })}>How am I doing?</button>}
        <button className="bye" onClick={onClose}>
          Goodbye.
        </button>
      </div>
    </div>
  );
}
