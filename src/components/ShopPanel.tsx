import { useState } from "react";
import type { Custom, GameState } from "../game/data";
import { BANK_RATE, ITEMS, flowFor, gp, money, type ShopItem } from "../game/economy";

interface Props {
  state: GameState;
  start: "shop" | "wardrobe" | "bank";
  onBuy(item: ShopItem): void;
  onCustom(c: Custom): void;
  onWithdraw(amount: number): void;
  onClose(): void;
}

const SKINS = ["#f1c9a5", "#e0b48e", "#c99a72", "#a8724e", "#7a4e32", "#5a3a26"];
const HAIRS = ["#2e1b0e", "#4a2e18", "#7a3a1e", "#a8642a", "#d9b56a", "#e6e2d8", "#1a1a1a"];
const SLOTS: { slot: ShopItem["slot"]; label: string; key: keyof Custom }[] = [
  { slot: "top", label: "Tunic", key: "top" },
  { slot: "hat", label: "Headwear", key: "hat" },
  { slot: "cape", label: "Cape", key: "cape" },
  { slot: "accessory", label: "Carry", key: "accessory" },
  { slot: "pet", label: "Companion", key: "pet" },
];

// The general store: shop, wardrobe and bank in one panel.
export function ShopPanel({ state, start, onBuy, onCustom, onWithdraw, onClose }: Props) {
  const [tab, setTab] = useState(start);
  const [amount, setAmount] = useState("");
  const m = money(state);
  const owned = new Set(state.owned ?? []);
  const c = state.custom ?? {};
  const set = (patch: Custom) => onCustom({ ...c, ...patch });

  const flows = state.habits.map((h) => ({ h, f: flowFor(h) }));
  return (
    <div className="shop" role="dialog" aria-label="General store">
      <div className="sh-head">
        <b>General store</b>
        <span className={"sh-wallet" + (m.wallet < 0 ? " debt" : "")}>🪙 {gp(m.wallet)}</span>
        <span className="sh-bank">🏦 {gp(m.bank)}</span>
        <button className="sh-x" onClick={onClose}>
          Close
        </button>
      </div>
      <nav className="sh-tabs">
        {(["shop", "wardrobe", "bank"] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "shop" ? "Shop" : t === "wardrobe" ? "Wardrobe" : "Bank & earnings"}
          </button>
        ))}
      </nav>
      <div className="sh-body">
        {tab === "shop" &&
          SLOTS.map(({ slot, label, key }) => (
            <div key={slot}>
              <h4>{label}</h4>
              <div className="sh-grid">
                {ITEMS.filter((i) => i.slot === slot).map((it) => {
                  const has = owned.has(it.id);
                  const worn = c[key] === it.id;
                  return (
                    <div key={it.id} className={"sh-item" + (worn ? " worn" : "")} title={it.blurb}>
                      <span className="sw" style={{ background: it.color ?? (it.pet === "dog" ? "#9a6a3a" : it.pet === "cat" ? "#5a5a62" : "#6b4a2a") }} />
                      <span className="nm">{it.name}</span>
                      {has ? (
                        <button onClick={() => set({ [key]: worn ? "" : it.id } as Custom)}>{worn ? "Take off" : slot === "pet" ? "Bring along" : "Wear"}</button>
                      ) : (
                        <button className="buy" disabled={m.wallet < it.price} onClick={() => confirm(`Buy ${it.name} for ${gp(it.price)}?`) && onBuy(it)}>
                          {gp(it.price)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        {tab === "wardrobe" && (
          <div className="sh-wardrobe">
            <h4>Skin</h4>
            <div className="sh-swatches">
              {SKINS.map((s) => (
                <button key={s} aria-label={"skin " + s} aria-pressed={c.skin === s} style={{ background: s }} onClick={() => set({ skin: s })} />
              ))}
            </div>
            <h4>Hair colour</h4>
            <div className="sh-swatches">
              {HAIRS.map((s) => (
                <button key={s} aria-label={"hair " + s} aria-pressed={c.hair === s} style={{ background: s }} onClick={() => set({ hair: s })} />
              ))}
            </div>
            <h4>Hair style</h4>
            <div className="sh-row">
              {(["short", "long", "bun", "bald"] as const).map((h) => (
                <button key={h} aria-pressed={(c.hairStyle ?? "short") === h} onClick={() => set({ hairStyle: h })}>
                  {h}
                </button>
              ))}
            </div>
            <h4>Beard</h4>
            <div className="sh-row">
              <button aria-pressed={!c.beard} onClick={() => set({ beard: false })}>
                none
              </button>
              <button aria-pressed={!!c.beard} onClick={() => set({ beard: true })}>
                beard
              </button>
            </div>
            <h4>Cape</h4>
            <div className="sh-row">
              <button aria-pressed={c.cape === undefined} onClick={() => set({ cape: undefined })}>
                earned by level
              </button>
              <button aria-pressed={c.cape === ""} onClick={() => set({ cape: "" })}>
                none
              </button>
            </div>
            <p className="note">Wardrobe changes are free. Clothes, hats, capes and companions come from the shop. Your outfit also earns trim, a cape and a circlet as your total level climbs.</p>
          </div>
        )}
        {tab === "bank" && (
          <div className="sh-bank-tab">
            <div className="sh-stats">
              <div>
                Wallet <b className={m.wallet < 0 ? "debt" : ""}>{gp(m.wallet)}</b>
              </div>
              <div>
                Bank <b>{gp(m.bank)}</b>
              </div>
              <div>
                Interest earned <b>{gp(m.interest)}</b>
              </div>
              <div>
                Spent on vices <b className="debt">{gp(m.vices)}</b>
              </div>
            </div>
            <p className="note">
              This week: wages {gp(m.week.wage)} · self-investment {gp(m.week.stipend)} · saved {gp(m.week.deposit)} · vices <span className="debt">-{gp(m.week.cost)}</span>
            </p>
            <p className="note">The bank pays {Math.round(BANK_RATE * 100)}% every week on what's in it. Leave it and it compounds. Take it out and it stops working for you.</p>
            <div className="sh-row">
              <input type="number" min={1} max={Math.max(0, m.bank)} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount" />
              <button
                disabled={!(Number(amount) > 0 && Number(amount) <= m.bank)}
                onClick={() => {
                  onWithdraw(Math.floor(Number(amount)));
                  setAmount("");
                }}
              >
                Withdraw to wallet
              </button>
            </div>
            <h4>What your habits pay</h4>
            <ul className="sh-flows">
              {flows.map(({ h, f }) => (
                <li key={h.id}>
                  <span>{h.name}</span>
                  <b className={f.kind === "cost" ? "debt" : f.kind === "deposit" ? "save" : ""}>
                    {f.kind === "cost" ? "-" : "+"}
                    {gp(f.amount)}
                    <small> {f.kind === "wage" ? "wage" : f.kind === "stipend" ? "self-investment" : f.kind === "deposit" ? "to bank" : "cost"}</small>
                  </b>
                </li>
              ))}
            </ul>
            <p className="note">Work pays the most. Other good habits pay a little. Saving goes to the bank. Vices cost you, like they do in real life. Quests pay a bounty.</p>
          </div>
        )}
      </div>
    </div>
  );
}
