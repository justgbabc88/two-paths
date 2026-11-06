import { useState } from "react";
import type { Custom, GameState } from "../game/data";
import { BANK_RATE, ITEM, ITEMS, flowFor, gp, money, type ShopItem } from "../game/economy";
import { todayLook } from "../game/appearance";
import type { Computed } from "../game/logic";
import { CharacterPreview } from "./CharacterPreview";
import { FREEZE_PRICE, MAX_FREEZES, RARITY_COLOR, ownedIds, streakInfo } from "../game/rewards";

interface Props {
  state: GameState;
  c: Computed;
  start: "shop" | "wardrobe" | "bank";
  onBuy(item: ShopItem): void;
  onBuyFreeze(): void;
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
export function ShopPanel({ state, c: computed, start, onBuy, onBuyFreeze, onCustom, onWithdraw, onClose }: Props) {
  const [trial, setTrial] = useState<string | null>(null); // item being tried on
  const [tab, setTab] = useState(start);
  const [amount, setAmount] = useState("");
  const m = money(state);
  const owned = ownedIds(state);
  const streak = streakInfo(state);
  const lootItems = ITEMS.filter((i) => i.loot);
  const c = state.custom ?? {};
  const set = (patch: Custom) => onCustom({ ...c, ...patch });

  const flows = state.habits.map((h) => ({ h, f: flowFor(h) }));

  // what the preview shows: your current look, plus whatever you're trying on
  const slotKey = { top: "top", hat: "hat", cape: "cape", accessory: "accessory", pet: "pet" } as const;
  const trialItem = trial ? ITEM[trial] : null;
  const previewState: GameState = trialItem
    ? { ...state, owned: [...(state.owned ?? []), trialItem.id], custom: { ...c, [slotKey[trialItem.slot]]: trialItem.id } }
    : state;
  const preview = todayLook(previewState, computed).player;
  const tryOn = (id: string | null) => setTrial(id);
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
      <div className="sh-main">
      <div className="sh-body" onMouseLeave={() => tryOn(null)}>
        {tab === "shop" && (
          <div className="sh-freeze">
            <span className="sw">❄️</span>
            <div>
              <b>Streak freeze</b> <small>({streak.held}/{MAX_FREEZES} held)</small>
              <p className="note">Covers a day you miss so your 🔥 {streak.current}-day streak survives. Used automatically.</p>
            </div>
            <button className="buy" disabled={m.wallet < FREEZE_PRICE || streak.held >= MAX_FREEZES} onClick={() => confirm(`Buy a streak freeze for ${gp(FREEZE_PRICE)}?`) && onBuyFreeze()}>
              {streak.held >= MAX_FREEZES ? "Full" : gp(FREEZE_PRICE)}
            </button>
          </div>
        )}
        {tab === "shop" && (
          <div>
            <h4>
              Loot collection <small>({lootItems.filter((i) => owned.has(i.id)).length}/{lootItems.length} found)</small>
            </h4>
            <div className="sh-grid">
              {lootItems.map((it) => {
                const has = owned.has(it.id);
                const key = SLOTS.find((x) => x.slot === it.slot)!.key;
                const worn = c[key] === it.id;
                return has ? (
                  <div key={it.id} className={"sh-item loot" + (worn ? " worn" : "") + (trial === it.id ? " trying" : "")} style={{ borderColor: RARITY_COLOR[it.loot!] }} title={it.blurb} tabIndex={0} onMouseEnter={() => tryOn(it.id)} onFocus={() => tryOn(it.id)} onClick={() => tryOn(it.id)}>
                    <span className="sw" style={{ background: it.color }} />
                    <span className="nm">{it.name}</span>
                    <button onClick={() => set({ [key]: worn ? "" : it.id } as Custom)}>{worn ? "Take off" : "Wear"}</button>
                  </div>
                ) : (
                  <div key={it.id} className="sh-item loot locked" style={{ borderColor: RARITY_COLOR[it.loot!] }} title={`A ${it.loot} drop. Keep logging good habits.`}>
                    <span className="sw">?</span>
                    <span className="nm">???</span>
                    <small style={{ color: RARITY_COLOR[it.loot!] }}>{it.loot}</small>
                  </div>
                );
              })}
            </div>
            <h4>Secret</h4>
            <div className="sh-grid">
              {ITEMS.filter((i) => i.secret).map((it) => {
                const has = owned.has(it.id);
                const worn = c.hat === it.id;
                return has ? (
                  <div key={it.id} className={"sh-item loot" + (worn ? " worn" : "") + (trial === it.id ? " trying" : "")} style={{ borderColor: "#9ae8ff" }} title={it.blurb} tabIndex={0} onMouseEnter={() => tryOn(it.id)} onFocus={() => tryOn(it.id)} onClick={() => tryOn(it.id)}>
                    <span className="sw" style={{ background: it.color }} />
                    <span className="nm">{it.name}</span>
                    <button onClick={() => set({ hat: worn ? "" : it.id })}>{worn ? "Take off" : "Wear"}</button>
                  </div>
                ) : (
                  <div key={it.id} className="sh-item loot locked" style={{ borderColor: "#9ae8ff" }} title="Can't be bought. Can't be found. Only earned, somewhere nobody goes.">
                    <span className="sw">?</span>
                    <span className="nm">???</span>
                    <small style={{ color: "#9ae8ff" }}>secret</small>
                  </div>
                );
              })}
            </div>
            <p className="note">Every good habit you log has a chance to drop gold or one of these. Bigger habits drop more often and drop rarer things.</p>
          </div>
        )}
        {tab === "shop" &&
          SLOTS.map(({ slot, label, key }) => (
            <div key={slot}>
              <h4>{label}</h4>
              <div className="sh-grid">
                {ITEMS.filter((i) => i.slot === slot && !i.loot && !i.secret).map((it) => {
                  const has = owned.has(it.id);
                  const worn = c[key] === it.id;
                  return (
                    <div
                      key={it.id}
                      className={"sh-item" + (worn ? " worn" : "") + (trial === it.id ? " trying" : "")}
                      title={it.blurb}
                      tabIndex={0}
                      onMouseEnter={() => tryOn(it.id)}
                      onFocus={() => tryOn(it.id)}
                      onClick={() => tryOn(it.id)}
                    >
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
              {(["short", "long", "bun", "ponytail", "curly", "spiky", "buzz", "bald"] as const).map((h) => (
                <button key={h} aria-pressed={(c.hairStyle ?? "short") === h} onClick={() => set({ hairStyle: h })}>
                  {h}
                </button>
              ))}
            </div>
            <h4>Facial hair</h4>
            <div className="sh-row">
              {(["none", "stubble", "moustache", "goatee", "beard"] as const).map((f) => (
                <button key={f} aria-pressed={(c.facialHair ?? (c.beard ? "beard" : "none")) === f} onClick={() => set({ facialHair: f, beard: f === "beard" })}>
                  {f}
                </button>
              ))}
            </div>
            <h4>Eyes</h4>
            <div className="sh-swatches">
              {EYES.map((s) => (
                <button key={s} aria-label={"eyes " + s} aria-pressed={(c.eyes ?? EYES[0]) === s} style={{ background: s }} onClick={() => set({ eyes: s })} />
              ))}
            </div>
            <Choice label="Build" value={c.build ?? "average"} options={["slim", "average", "broad"]} onPick={(v) => set({ build: v as Custom["build"] })} />
            <Choice label="Height" value={HEIGHTS.find((x) => x[1] === (c.height ?? 1))?.[0] ?? "average"} options={HEIGHTS.map((x) => x[0])} onPick={(v) => set({ height: HEIGHTS.find((x) => x[0] === v)![1] })} />
            <Choice label="Face" value={c.face ?? "oval"} options={["oval", "round", "square"]} onPick={(v) => set({ face: v as Custom["face"] })} />
            <Choice label="Nose" value={c.nose ?? "medium"} options={["small", "medium", "large"]} onPick={(v) => set({ nose: v as Custom["nose"] })} />
            <Choice label="Brows" value={c.brows ?? "normal"} options={["thin", "normal", "thick"]} onPick={(v) => set({ brows: v as Custom["brows"] })} />
            <Choice label="Glasses" value={c.glasses || "none"} options={["none", "round", "square"]} onPick={(v) => set({ glasses: v === "none" ? "" : (v as "round" | "square") })} />
            <Choice label="Freckles" value={c.freckles ? "yes" : "no"} options={["no", "yes"]} onPick={(v) => set({ freckles: v === "yes" })} />
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
              Loot found {gp(m.loot)} · streak and level bounties {gp(m.bounties)}
            </p>
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
      <aside className="sh-preview">
        <CharacterPreview appearance={preview} label={trialItem ? `Trying on: ${trialItem.name}` : "You"} />
        {trialItem && !trialItem.loot && !owned.has(trialItem.id) && (
          <button className="buy" disabled={m.wallet < trialItem.price} onClick={() => confirm(`Buy ${trialItem.name} for ${gp(trialItem.price)}?`) && onBuy(trialItem)}>
            Buy for {gp(trialItem.price)}
          </button>
        )}
        <p className="note">{trialItem ? trialItem.blurb : "Hover or tap an item to try it on. Drag to turn."}</p>
      </aside>
      </div>
    </div>
  );
}

const EYES = ["#3a2a1a", "#6b4a22", "#4a6a8a", "#4a6a3a", "#6a6a6a"];
const HEIGHTS: [string, number][] = [["short", 0.93], ["average", 1], ["tall", 1.07]];

function Choice({ label, value, options, onPick }: { label: string; value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <>
      <h4>{label}</h4>
      <div className="sh-row">
        {options.map((o) => (
          <button key={o} aria-pressed={value === o} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
    </>
  );
}
