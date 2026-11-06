import { useState } from "react";

const FIRST = [
  "So. You found the signal.",
  "Most people watch the surfing and never touch the dial. You looked twice at something everyone else walks past.",
  "That is the whole secret, small one. Small things, looked at twice, done again tomorrow.",
];
const WISDOM = [
  "The wave doesn't care how you feel. Paddle anyway.",
  "Ice is only water that stayed still long enough. Stay with something long enough and it will hold your weight.",
  "Every penguin in this hall waddled here. Not one of them was in a hurry. All of them arrived.",
  "You came back. That is the only trick there is.",
  "A crown is just a ring you kept wearing.",
  "The fog only looks like a wall from the outside.",
  "Fish are caught one at a time. So are good days.",
];

/** An audience with the Penguin King in the Glacier Court. */
export function KingDialog({ crowned, onKneel, onClose }: { crowned: boolean; onKneel(): void; onClose(): void }) {
  const [i, setI] = useState(0);
  const [wisdom] = useState(() => WISDOM[Math.floor(Math.random() * WISDOM.length)]);
  const [given, setGiven] = useState(false);
  const first = !crowned && !given;
  const line = given ? "Rise, friend of the Glacier Court. Wear it where they can see it. Let them wonder." : first ? FIRST[i] : wisdom;
  return (
    <div className="dialogue king" role="dialog" aria-label="The Penguin King">
      <div className="dl-head">
        <b>👑 The Penguin King</b>
      </div>
      <p className="dl-line">{line}</p>
      <div className="dl-opts">
        {first && i < FIRST.length - 1 && <button onClick={() => setI(i + 1)}>Continue…</button>}
        {first && i === FIRST.length - 1 && (
          <button
            className="kneel"
            onClick={() => {
              setGiven(true);
              onKneel();
            }}
          >
            Kneel
          </button>
        )}
        {!first && <button onClick={onClose}>{given ? "Rise" : "Bow and step back"}</button>}
      </div>
    </div>
  );
}
