// World layout: tile map, stations, collision and pathfinding.
// Legend:  . grass  , flowers  = path  ~ water  h/v bridge (E-W / N-S)
//          T tree  P pine  r rock  b bush  f fence   (T P r b f and ~ block movement)
import { SK, VICE_PLACES, type Habit, type SkillId, type VicePlace } from "./data";

export const T = 32; // on-screen tile size (art is 16px, drawn at 2x)

export const MAP: string[] = [
  "TTPTTTTTTTTPPTTTPTTTTPTTTT~PTTTTTTTTTTTP",
  "P.PT.TTTTTPTPT.TTPT.TTPP.P~T.TPPT...P.PT",
  "TTTT.P...T.........T.TT...~.T...P...T.PT",
  "TTTr....r.................~.......T...TT",
  "T........r..........,.....~~.........TTT",
  "PTP.............T.P...r....~..........TT",
  "PT.r..=.r..................~b..=.......T",
  "TT..r.=..r................,~...=......TP",
  "T.T.T.=...Pr..........=====h====.......T",
  "P.....=r..............=....~..........PP",
  "PT....=...............=....~~..~~~...TPT",
  "PTT...=.b.............=....,.~~~~~~~.TTP",
  "T.T.r.=...............=.....~~~~~~~~~T.T",
  "TTT,..======================~~~~~~~~~.PT",
  "TT.........=...,.=.T.,..,.,.~~~~~~~~~.TT",
  "TT.........=.....=.bb..,...r~~~~~~~~~.PT",
  "TTT..r.....=,....=.........b.~~~~~~~..TP",
  "TT.......===.....=......,......~~~....PT",
  "T.....,..........=...T,.........~....PTP",
  "PT.....r.........=..............~..b.T.T",
  "TT........bb.....=......T.......~....TPT",
  "TP...............=..............~.....TT",
  "TT...............=.............P~~....PT",
  "TTT.==============...............~....TT",
  "T.T..............................~r....T",
  "PP........,......................~...T.T",
  "P..,,.,.....,...T................~...T.T",
  "TT.....T...T..P.T..T..PPP.....T..~...TTP",
  "TP.TTTPT..TTTPTTTTTTTTP.PTPT..T.T~T.PTTP",
  "TTPTTTPTTTTTTPPPTPTTTTTTTTTTPTPTT~PTTPPP",
];
export const ROWS = MAP.length;
export const COLS = MAP[0].length;
export const START = { x: 20, y: 14 };

export type StationId = SkillId | VicePlace;
export interface Station {
  id: StationId;
  skill: SkillId | null;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number; // approach tile: where the character stands
  ay: number;
  verb: string;
  examine: string;
}

// Names, verbs and examine text are from v1; positions are for the larger map.
export const STATIONS: Station[] = [
  { id: "wealth", skill: "wealth", name: "Gold mine", x: 5, y: 4, w: 2, h: 2, ax: 6, ay: 6, verb: "mine", examine: "Veins of gold run through the rock. Each swing adds up." },
  { id: "mind", skill: "mind", name: "Standing stone", x: 31, y: 4, w: 2, h: 2, ax: 31, ay: 6, verb: "pray", examine: "An old altar. Quiet here." },
  { id: "business", skill: "business", name: "Market stall", x: 19, y: 12, w: 2, h: 1, ax: 19, ay: 13, verb: "trade", examine: "Your stall. The pipeline is built one conversation at a time." },
  { id: "learning", skill: "learning", name: "Library", x: 8, y: 15, w: 3, h: 2, ax: 9, ay: 17, verb: "study", examine: "Shelves of books. Twenty pages a day, forever." },
  { id: "health", skill: "health", name: "Training yard", x: 18, y: 22, w: 3, h: 2, ax: 17, ay: 23, verb: "train", examine: "A training dummy and some iron. It never gets easier, you get stronger." },
  { id: "relationship", skill: "relationship", name: "Cottage", x: 23, y: 11, w: 3, h: 2, ax: 24, ay: 13, verb: "visit", examine: "Home. The hearth is warm." },
  { id: "tavern", skill: null, name: "Tavern", x: 15, y: 11, w: 2, h: 2, ax: 16, ay: 13, verb: "drink", examine: "The tavern. Everyone ends up here sometimes. Be honest about it." },
  { id: "shack", skill: null, name: "Smoke shack", x: 4, y: 21, w: 2, h: 2, ax: 5, ay: 23, verb: "light up", examine: "A leaning shack in a permanent haze. Time goes soft in here." },
  { id: "sweets", skill: null, name: "Sweet stall", x: 8, y: 22, w: 2, h: 1, ax: 8, ay: 23, verb: "snack", examine: "Bright, sticky and always open. It's never just one." },
  { id: "den", skill: null, name: "The den", x: 11, y: 21, w: 2, h: 2, ax: 12, ay: 23, verb: "scroll", examine: "Curtains drawn, screens glowing. You look up and two hours are gone." },
];

export const isVice = (id: StationId): id is VicePlace => VICE_PLACES.some((v) => v.id === id);
/** Icon shown on labels and the minimap. */
export const stationIcon = (s: Station) => (s.skill ? SK[s.skill].ico : VICE_PLACES.find((v) => v.id === s.id)!.ico);

/** Habits offered at a station: build-up habits at their skill's station (v1 rule),
 *  tear-down habits at their chosen vice place (the tavern if none is set, as in v1). */
export const habitsAtStation = (s: Station, habits: Habit[]): Habit[] =>
  habits.filter((h) => (isVice(s.id) ? h.type === "neg" && (h.place ?? "tavern") === s.id : h.type === "pos" && (h.skill === s.skill || h.skill2 === s.skill)));

export const cell = (x: number, y: number): string => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? "T" : MAP[y][x]);
export const isWater = (c: string) => c === "~" || c === "h" || c === "v";
export const isPath = (c: string) => c === "=" || c === "h" || c === "v";

export const blocked: boolean[][] = [];
for (let y = 0; y < ROWS; y++) {
  blocked.push([]);
  for (let x = 0; x < COLS; x++) blocked[y].push("TPrbf~".includes(MAP[y][x]));
}
STATIONS.forEach((s) => {
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) blocked[y][x] = true;
});
export const stationAt = (x: number, y: number) => STATIONS.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);

export type Pt = [number, number];

// ---- pathfinding (BFS, 4-dir), unchanged from v1 ----
export function findPath(sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (blocked[ty] && blocked[ty][tx]) return null;
  const key = (x: number, y: number) => y * COLS + x;
  const prev = new Map<number, Pt | null>();
  const q: Pt[] = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === tx && y === ty) {
      const path: Pt[] = [];
      let cur: Pt | null | undefined = [x, y];
      while (cur) {
        path.push(cur);
        cur = prev.get(key(cur[0], cur[1]));
      }
      return path.reverse().slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (blocked[ny][nx]) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, [x, y]);
      q.push([nx, ny]);
    }
  }
  return null;
}
