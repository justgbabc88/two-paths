// World layout: tile map, stations, collision and pathfinding.
// Legend:  . grass  , flowers  = path  ~ water  h/v bridge (E-W / N-S)
//          T tree  P pine  r rock  b bush  f fence  w wheat  W stone wall  M mountain
//          (everything except grass, flowers, paths and bridges blocks movement)
// The village from v2 sits in the middle at VILLAGE_X/VILLAGE_Y; the surroundings were
// laid out around it (woods, keep ruins, mountains, farmland, coast).
import { SK, VICE_PLACES, type Habit, type SkillId, type VicePlace } from "./data";

export const T = 32; // on-screen tile size (art is 16px, drawn at 2x)

export const MAP: string[] = [
  "TPMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
  "TTMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
  "TTMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
  "TTMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM.....MMMMMMMMMMMMMMMMMMMMMMM",
  "TPMMWWWWWWWWWWWMMMMMMMMMMMMMMT.,..MMMMMMM..T.......MMMMMMMMMMMMMMMMMMMMM",
  "TPMMW.........W..MMMMMMMMMT.P..,.....r,.............bMMMMMMMMMMMMMMMMMMM",
  "TTP.W.........W..TT..MM....T..,...,r.T.................MMMMMMMMMMMMMMMMM",
  "TTPTW.........W,.T.........T..T.r.r..T...........T.Tr....P.MMMMMMMMMMMMM",
  "TTbTW.........W.....T..........,....TT...T.TT.....b...TT...MMMMMMMMMMMMM",
  "PTTTW.........W..P...T..................,.....,...T......P..PP..P.P..PPM",
  "TPTTW.........W..........P...r,...T.T..,T...TT,b....,.,....r.......PP..M",
  "TTT.W....=....W.......r.T...T..T.........T.,..r...T.....TTr......P.rP..M",
  "PTTPW....=....W..TPT..,...T.rP.T.........T......T...T.....P.....P.....PM",
  "TTTTWWWWT=TWWWW..TP.T.=.T.T.PT.T..TTT.T....PT..TT.T..TT..P............TM",
  "TPPPT.TT.=.P.TPTP.PT.T=TTTPTPT.TTPT.TTPP.P~T.TPPT...P.PT.........P.TrP.M",
  "TTT.TT.T.=.T..TTTTTT.P=..T.........T.TT...~.T...P...T.PT...P..=........M",
  "TTPTT...T==============.r.................~.......T...T..Pr.PP=PTPTPP..M",
  "TTPTT.TT.=TTbTT.......=..r..........,.....~~.........TTT.PPTP.=..PTPPP.M",
  "PTPT.T..T=T.TT..PTP...=.........T.P...r....~..........TT.PTTPT=..rPPPP.M",
  "PTTTP.TP.=bbTTT.PT.r..=.r..................~b..=.......T..PPPP=PPPP.Pr.M",
  "PT.TTP.T.=.TT...TT..r.=..r................,~...=......T....T..=PPP.P.PPM",
  "TTbTTTTTT=.TTTT.T.T.T.=...Pr..........=====h===================PTT..T.TM",
  "TTTT.T.P.=TTTTT.P.....=r..............=....~..........PP.P...P.T...Pr..M",
  "PTT.T.TT.=...P.TPT....=...............=....~~..~~~...TPT,.TPPP.P..PP.rPM",
  "TTTT...TT=TbT.T.PTT...=.b.............=....,.~~~~~~~.TTP...P..P.rTrP...M",
  "PT.b..TTT=T.TTT...T.r.=...............=.....~~~~~~~~~T...P..T...TPP...PM",
  "TTT.b.TTT========TT,..======================~~~~~~~~~.P.....TT........TM",
  "TTT..bT.T=P.bT..TT.........=...,.=.T.,..,.,.~~~~~~~~~.TT....T.r.,.r....M",
  "TTPT.T.TT=PTT.T.TT.........=.....=.bb..,...r~~~~~~~~~.P..T....P......r.M",
  "TT.P.....=T.TTT..TT..r.....=,....=.........b.~~~~~~~..T...P.........T..M",
  "TT.TP....=TT..P.TT.......===.....=......,......~~~....PTT..b.......P....",
  "PTP.T....=.TT.........,..........=...T,.........~....PT.......,..T..Tr,.",
  "PTT.T..===TTPTT..T.....r.........=..............~..b.T.......T..........",
  "TTT.PTTT........TT........bb.....=......T.......~....TPT........,.......",
  "TT..TTPTT.PT.TT.TP...............=..............~.....TT...TT...P.......",
  "TTTTTTTTTT..TPT.TT...............=.............P~~....PT....T.......,.T.",
  "TTTP...PT.PP.T...TT.==============...............~....T.TT.....T..b....b",
  "TTT.PP.TTPT.TTT.T.T..............=...............~r......T...T..........",
  "TTPTPP..TTTT.bT,PP........,......=...............~...T......T..bT....T..",
  "TT.TT.TTTTT.TT.,P..,,.,.....,...T=...............~...T.T,.....,.T.T,....",
  "PTTffffffffffffffff....T...T..P.T=.T..PPP.....T..~...TT...T.............",
  "TTPfwwwwwwffwwwwwwfTTTPT..TTTPTTT=TTTTP.PTPT..T.T~T.PTTPTTT......T.T.TrT",
  "TPPfwwwwwwffwwwwwwfTT..T..TTTP.P.=TT.T...TTT.TPTT..TTPP...PP..T.b..T..P.",
  "TT.fwwwwwwffwwwwwwf...T.P......r.=.....TTr.....,.~P.....................",
  "TTTfwwwwwwffwwwwwwf....T.....,..T=..T.........b.b~....................b.",
  "TT.ffffffffffffffff.............T=...............~................T..T,.",
  "TTTTTTTP.TTTT.T..,...............================h=========......T.....,",
  "TPTfffffffffffffff...........,...=T...........T..~..,..,..=...~~~~~~~~~~",
  "TP.fwwwwwwffwwwwwf.T......=......=.......~~~.....~...T,...v~~~~~~~~~~~~~",
  "PTTfwwwwwwffwwwwwf.,..=...=....T.=..~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TTPfwwwwwwffwwwwwf....============..~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TTTfwwwwwwffwwwwwf...T........T..,..~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TP.fffffffffffffff....T.,...........~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TT...TTT.PTTTTT,............T......T~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TTTT....P.bPTTP.....T...............~~~~~~~~~~~~~~~~~~~~~~v~~~~~~~~~~~~~",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
];
export const ROWS = MAP.length;
export const COLS = MAP[0].length;
export const VILLAGE_X = 16,
  VILLAGE_Y = 13;
export const START = { x: 36, y: 27 };

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
  { id: "wealth", skill: "wealth", name: "Gold mine", x: 21, y: 17, w: 2, h: 2, ax: 22, ay: 19, verb: "mine", examine: "Veins of gold run through the rock. Each swing adds up." },
  { id: "mind", skill: "mind", name: "Standing stone", x: 47, y: 17, w: 2, h: 2, ax: 47, ay: 19, verb: "pray", examine: "An old altar. Quiet here." },
  { id: "business", skill: "business", name: "Market stall", x: 35, y: 25, w: 2, h: 1, ax: 35, ay: 26, verb: "trade", examine: "Your stall. The pipeline is built one conversation at a time." },
  { id: "learning", skill: "learning", name: "Library", x: 24, y: 28, w: 3, h: 2, ax: 25, ay: 30, verb: "study", examine: "Shelves of books. Twenty pages a day, forever." },
  { id: "health", skill: "health", name: "Training yard", x: 34, y: 35, w: 3, h: 2, ax: 33, ay: 36, verb: "train", examine: "A training dummy and some iron. It never gets easier, you get stronger." },
  { id: "relationship", skill: "relationship", name: "Cottage", x: 39, y: 24, w: 3, h: 2, ax: 40, ay: 26, verb: "visit", examine: "Home. The hearth is warm." },
  { id: "tavern", skill: null, name: "Tavern", x: 31, y: 24, w: 2, h: 2, ax: 32, ay: 26, verb: "drink", examine: "The tavern. Everyone ends up here sometimes. Be honest about it." },
  { id: "shack", skill: null, name: "Smoke shack", x: 20, y: 34, w: 2, h: 2, ax: 21, ay: 36, verb: "light up", examine: "A leaning shack in a permanent haze. Time goes soft in here." },
  { id: "sweets", skill: null, name: "Sweet stall", x: 24, y: 35, w: 2, h: 1, ax: 24, ay: 36, verb: "snack", examine: "Bright, sticky and always open. It's never just one." },
  { id: "den", skill: null, name: "The den", x: 27, y: 34, w: 2, h: 2, ax: 28, ay: 36, verb: "scroll", examine: "Curtains drawn, screens glowing. You look up and two hours are gone." },
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
  for (let x = 0; x < COLS; x++) blocked[y].push("TPrbf~wWM".includes(MAP[y][x]));
}
STATIONS.forEach((s) => {
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) blocked[y][x] = true;
});
/** Scenery around the village. Click to examine; they block movement like buildings. */
export type LandmarkId = "keep" | "chapel" | "woodcutter" | "windmill" | "farmhouse" | "fisher";
export interface Landmark { id: LandmarkId; name: string; x: number; y: number; w: number; h: number; ax: number; ay: number; examine: string }
export const LANDMARKS: Landmark[] = [
  { id: "keep", name: "Old keep", x: 7, y: 7, w: 4, h: 3, ax: 9, ay: 11, examine: "What's left of a keep nobody remembers building. The walls still hold." },
  { id: "chapel", name: "Hill chapel", x: 61, y: 11, w: 2, h: 3, ax: 62, ay: 15, examine: "A small stone chapel. Someone still leaves flowers by the door." },
  { id: "woodcutter", name: "Woodcutter's hut", x: 6, y: 30, w: 2, h: 2, ax: 7, ay: 32, examine: "Axe marks on every stump. Firewood stacked higher than the door." },
  { id: "windmill", name: "Windmill", x: 21, y: 47, w: 2, h: 2, ax: 22, ay: 49, examine: "The sails turn whether anyone's watching or not." },
  { id: "farmhouse", name: "Farmhouse", x: 25, y: 46, w: 3, h: 2, ax: 26, ay: 48, examine: "Muddy boots by the door. Bread in the window." },
  { id: "fisher", name: "Fisher's hut", x: 57, y: 44, w: 2, h: 2, ax: 58, ay: 46, examine: "Nets drying on the rail. Smells of salt and smoke." },
];
LANDMARKS.forEach((l) => {
  for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) blocked[y][x] = true;
});
export const landmarkAt = (x: number, y: number) => LANDMARKS.find((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h);

/** The general store: buy gear with the gold your habits earn. */
export const SHOP = { x: 30, y: 31, w: 2, h: 2, ax: 32, ay: 32 };
for (let y = SHOP.y; y < SHOP.y + SHOP.h; y++) for (let x = SHOP.x; x < SHOP.x + SHOP.w; x++) blocked[y][x] = true;
export const isShop = (x: number, y: number) => x >= SHOP.x && x < SHOP.x + SHOP.w && y >= SHOP.y && y < SHOP.y + SHOP.h;

/** The Fork: a landmark arch south of the village square that shows your two futures. */
export const FORK = { x: 36, y: 29, w: 2, h: 1, ax: 36, ay: 30 };
for (let x = FORK.x; x < FORK.x + FORK.w; x++) blocked[FORK.y][x] = true;
export const isFork = (x: number, y: number) => x >= FORK.x && x < FORK.x + FORK.w && y === FORK.y;

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
