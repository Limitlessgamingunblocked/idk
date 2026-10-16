/* Sugar Shapes rules engine.
   Every decision the game makes lives here, with no drawing, sound or real time of its own:
   matching, specials, combos, gravity, refills, goals, keys, chests, boosters and the level table.
   The game inlines this file (tools/build.js) and animates what it returns; the simulator (sim/)
   runs it headless. All rule randomness comes from the world's seeded generator, so a seed plus a
   list of moves replays a game exactly. Visual effects are reported through world.fx(name, data, t),
   where t is seconds after the blast starts; the simulator leaves fx unset. */
(function (root, factory) {
  const R = factory();
  if (typeof module === 'object' && module.exports) module.exports = R; else root.SugarRules = R;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const COLS = 8, ROWS = 8;
const NONE = 0, SH = 1, SV = 2, WRAP = 3, BOMB = 4, SEEK = 5;
const CREATE_BONUS = [0, 120, 120, 200, 500, 150];
const FIRE_BONUS = [0, 100, 100, 180, 300, 150];
const POINTS_PER_CANDY = 20, MAX_MULT = 8, RUSH_POINTS = 150;
const KEY_MAX = 3, START_KEYS = 2;
const CHEST_FIRST = 3, CHEST_MAX = 6;
const UNICORNS = 3, PARADE = 7;

// Booster strength and the in-game economy, in one place so the economy model and the game share them.
const TUNE = {
  // generosity of the core rules (the balance study switches these to measure each feature)
  boxMatches: true,                         // 2x2 boxes match and make unicorns
  bigRainbow: 6,                            // a group this big makes a rainbow (Infinity: only 5 in a line)
  meterMax: 150,                            // candies cleared per free rainbow (Infinity: meter off)
  keyChance: .04,                           // chance a new candy carries a key (0: no keys)
  chestRewards: 'one',                      // 'rainbow+2' or 'one' (a single random special)
  unicornSplash: 'plus',                    // 'plus': target and 4 neighbours; 'single': just the target
  stampede: 8,                              // unicorns launched by Unicorn Stampede
  party: 'board',                           // 'board': hits every candy; 'specials': fires partySpecials random specials
  partySpecials: 6,
  econ: {
    startGold: 50,
    startBoosters: { hammer: 3, swap: 3, rainbow: 2, swarm: 2, moves: 2, party: 1 },
    winGold: [5, 5, 10],                    // base, per star, first-clear bonus
    chestGold: [5, 10],                     // inclusive range
    reviveBase: 10,                         // nth revive in one attempt costs reviveBase * n
    reviveMoves: 5,
    price: { hammer: 15, swap: 15, rainbow: 25, swarm: 30, moves: 20, party: 60 },
    boosterPool: ['hammer', 'hammer', 'swap', 'swap', 'rainbow', 'swarm', 'swarm', 'moves', 'party'],
  },
};
const winGold = (stars, firstClear) => TUNE.econ.winGold[0] + TUNE.econ.winGold[1] * stars + (firstClear ? TUNE.econ.winGold[2] : 0);
const reviveCost = n => TUNE.econ.reviveBase * n;

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const idxOf = (r, c) => r * COLS + c, rOf = i => (i / COLS) | 0, cOf = i => i % COLS;
const colorOf = t => t && t.special !== BOMB ? t.type : -1;
const randi = (w, n) => Math.floor(w.rng() * n);
const randType = w => randi(w, w.colors);
const tileAt = (w, i) => w.grid[rOf(i)][cOf(i)];
const fx = (w, name, data, t = 0) => { if (w.fx) w.fx(name, data, t); };
function shuffleInPlace(w, a) { for (let i = a.length - 1; i > 0; i--) { const j = randi(w, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ------------------------------------------------------------------ levels */
const LOGO_CIRCLES = [[340, 322, 301], [1523, 322, 301], [633, 835, 297]];
const LOGO_TRIS = [[930, 41, 1210, 582, 648, 582], [946, 564, 1509, 564, 1228, 1105]];
const LOGO_BOX = { x: 39, y: 21, w: 1785, h: 1111 };
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function inLogo(x, y) {
  for (const [cx, cy, r] of LOGO_CIRCLES) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  return LOGO_TRIS.some(t => inTri(x, y, ...t));
}
function logoCell(r, c) {
  let n = 0;
  for (const [fx_, fy] of [[.5, .5], [.25, .25], [.75, .25], [.25, .75], [.75, .75]])
    if (inLogo(LOGO_BOX.x + (c + fx_) / COLS * LOGO_BOX.w, LOGO_BOX.y + (r + fy) / ROWS * LOGO_BOX.h)) n++;
  return n >= 3;
}
// jelly (Candy) or dust (Furniture) layouts: layers per cell
const PAT = {
  center: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 1 : 0,
  ring: (r, c) => r === 0 || r === 7 || c === 0 || c === 7 ? 1 : 0,
  ring2: (r, c) => r === 0 || r === 7 || c === 0 || c === 7 ? 2 : 0,
  cross: (r, c) => r === 3 || r === 4 || c === 3 || c === 4 ? 1 : 0,
  x: (r, c) => (r === c || r + c === 7) ? 2 : 0,
  full: () => 1,
  core2: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 2 : 1,
  logo: (r, c) => logoCell(r, c) ? 1 : 0,
  logo2: (r, c) => logoCell(r, c) ? 2 : 0,
  corners: (r, c) => (r < 3 || r > 4) && (c < 3 || c > 4) ? 2 : 0,
  bottom: r => r >= 5 ? 2 : 0,
  checker: (r, c) => (r + c) % 2 ? 1 : 0,
  // Furniture Mode seeds: a little dust that spreads if you leave it alone
  rug: (r, c) => r >= 3 && r <= 4 && c >= 3 && c <= 4 ? 1 : 0,
  corner: (r, c) => r >= 6 && c <= 1 ? 1 : 0,
  twoCorners: (r, c) => (r >= 6 && c <= 1) || (r <= 1 && c >= 6) ? 1 : 0,
  hall: (r, c) => r === 7 ? 1 : 0,
  underBed: (r, c) => r >= 5 && c >= 2 && c <= 5 ? 1 : 0,
  fourCorners: (r, c) => (r <= 1 || r >= 6) && (c <= 1 || c >= 6) ? 1 : 0,
  attic: (r, c) => r <= 2 ? 1 : 0,
  stripes2: (r, c) => c % 3 === 1 ? 1 : 0,
};
let LEVELS = null;                       // filled by setLevels() from levels.json
function setLevels(table) { LEVELS = table; }
const LEVEL_COUNT = 30, HOME_FIRST = 101, HOME_LAST = 130;
function levelDef(n) {
  const d = LEVELS && LEVELS[n];
  if (!d) throw new Error('No level ' + n);
  return d;
}
function makeLevel(n) { return levelFromDef(n, levelDef(n)); }
function levelFromDef(n, d) {
  const L = { n, moves: d.moves, colors: d.colors, jelly: d.jelly || null, layers: d.layers || 0, spread: !!d.spread, goals: d.goals, home: n >= HOME_FIRST, stars: d.stars };
  if (!L.stars) {
    const r100 = v => Math.round(v / 100) * 100, sg = d.goals.find(g => g[0] === 'score');
    L.stars = sg ? [sg[1], r100(sg[1] * 1.5), r100(sg[1] * 2.1)] : (() => { const b = d.moves * 130; return [r100(b * .5), r100(b), r100(b * 1.7)]; })();
  }
  return L;
}

/* ------------------------------------------------------------------ world */
function defaultTile(type, special = NONE) { return { type, special, key: false, r: 0, c: 0, immune: false }; }
function newWorld(level, seed, mkTile) {
  const w = {
    level, seed: seed >>> 0, rng: mulberry(seed >>> 0), colors: level.colors, mkTile: mkTile || defaultTile,
    grid: [], jelly: [], score: 0, moves: level.moves, over: false, meter: 0, rainbows: 0,
    chest: { need: CHEST_FIRST, have: 0, pending: 0 }, turnJelly: 0, fx: null,
    stats: { specialsMade: [0, 0, 0, 0, 0, 0], specialsFired: [0, 0, 0, 0, 0, 0], cascades: 0, shuffles: 0, chests: 0, rainbowsDropped: 0, spreads: 0 },
  };
  const pat = level.jelly ? PAT[level.jelly] : null;
  let jt = 0;
  // `layers` (if set) gives every jelly cell that many layers instead of the pattern's own count
  for (let r = 0; r < ROWS; r++) { w.jelly.push([]); for (let c = 0; c < COLS; c++) { let v = pat ? pat(r, c) : 0; if (v && level.layers) v = level.layers; w.jelly[r].push(v); jt += v; } }
  w.goals = level.goals.map(g => g[0] === 'score' ? { kind: 'score', need: g[1] } : g[0] === 'collect' ? { kind: 'collect', type: g[1], need: g[2], left: g[2] } : { kind: 'jelly', need: jt, left: jt });
  return w;
}
function goalsMet(w) { return w.goals.every(g => g.kind === 'score' ? w.score >= g.need : g.left <= 0); }
const jellyGoal = w => w.goals.find(g => g.kind === 'jelly');
function plainTiles(w) { const out = []; w.grid.forEach(row => row.forEach(t => t && !t.special && out.push(t))); return out; }
const keysOnBoard = w => w.grid.reduce((n, row) => n + row.filter(t => t && t.key).length, 0);

/* ------------------------------------------------------------------ matching */
// Lines of 3+ and 2x2 boxes of one colour; overlapping shapes merge into one group.
function findGroups(w) {
  const g_ = w.grid, runs = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const k = colorOf(g_[r][c]); let e = c + 1;
      if (k >= 0) while (e < COLS && colorOf(g_[r][e]) === k) e++;
      if (k >= 0 && e - c >= 3) { const cells = []; for (let x = c; x < e; x++) cells.push(idxOf(r, x)); runs.push({ h: true, cells, type: k }); }
      c = e;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const k = colorOf(g_[r][c]); let e = r + 1;
      if (k >= 0) while (e < ROWS && colorOf(g_[e][c]) === k) e++;
      if (k >= 0 && e - r >= 3) { const cells = []; for (let y = r; y < e; y++) cells.push(idxOf(y, c)); runs.push({ h: false, cells, type: k }); }
      r = e;
    }
  }
  if (TUNE.boxMatches) for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
    const k = colorOf(g_[r][c]);
    if (k >= 0 && colorOf(g_[r][c + 1]) === k && colorOf(g_[r + 1][c]) === k && colorOf(g_[r + 1][c + 1]) === k)
      runs.push({ box: true, cells: [idxOf(r, c), idxOf(r, c + 1), idxOf(r + 1, c), idxOf(r + 1, c + 1)], type: k });
  }
  if (!runs.length) return [];
  const par = runs.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const owner = new Map();
  runs.forEach((run, i) => run.cells.forEach(x => { if (owner.has(x)) par[find(i)] = find(owner.get(x)); else owner.set(x, i); }));
  const map = new Map();
  runs.forEach((run, i) => {
    const root = find(i); if (!map.has(root)) map.set(root, { cells: new Set(), runs: [], type: run.type });
    const g = map.get(root); g.runs.push(run); run.cells.forEach(x => g.cells.add(x));
  });
  const groups = [...map.values()];
  for (const g of groups) {
    const lines = g.runs.filter(r => !r.box), hasBox = lines.length < g.runs.length;
    let longest = lines[0] || g.runs[0]; const seen = new Map();
    for (const run of lines) { if (run.cells.length > longest.cells.length) longest = run; run.cells.forEach(x => seen.set(x, (seen.get(x) || 0) + 1)); }
    g.longest = longest; g.inter = -1; for (const [x, n] of seen) if (n > 1) { g.inter = x; break; }
    const hasH = lines.some(r => r.h), hasV = lines.some(r => !r.h), len = lines.length ? longest.cells.length : 0;
    // priority: rainbow (5 in a line, or 6+ candies) > wrapped (L/T) > striped (4) > unicorn (2x2 box)
    g.special = len >= 5 || g.cells.size >= TUNE.bigRainbow ? BOMB : hasH && hasV ? WRAP : len === 4 ? (longest.h ? SV : SH) : hasBox ? SEEK : NONE;
  }
  return groups;
}
function matchAt(w, r, c) {
  const g = w.grid, k = colorOf(g[r][c]); if (k < 0) return false;
  let n = 1; for (let x = c - 1; x >= 0 && colorOf(g[r][x]) === k; x--) n++; for (let x = c + 1; x < COLS && colorOf(g[r][x]) === k; x++) n++;
  if (n >= 3) return true;
  n = 1; for (let y = r - 1; y >= 0 && colorOf(g[y][c]) === k; y--) n++; for (let y = r + 1; y < ROWS && colorOf(g[y][c]) === k; y++) n++;
  if (n >= 3) return true;
  if (TUNE.boxMatches) for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [-1, -1]]) {
    const r0 = r + dr, c0 = c + dc; if (r0 < 0 || c0 < 0 || r0 + 1 >= ROWS || c0 + 1 >= COLS) continue;
    if (colorOf(g[r0][c0]) === k && colorOf(g[r0][c0 + 1]) === k && colorOf(g[r0 + 1][c0]) === k && colorOf(g[r0 + 1][c0 + 1]) === k) return true;
  }
  return false;
}
const isComboSwap = (a, b) => a.special === BOMB || b.special === BOMB || (a.special > 0 && b.special > 0);
function allMoves(w) {
  const out = [], g = w.grid;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc; if (r2 >= ROWS || c2 >= COLS) continue;
    const a = g[r][c], b = g[r2][c2]; if (!a || !b) continue;
    let ok = isComboSwap(a, b);
    if (!ok) { g[r][c] = b; g[r2][c2] = a; ok = matchAt(w, r, c) || matchAt(w, r2, c2); g[r][c] = a; g[r2][c2] = b; }
    if (ok) out.push({ a: { r, c }, b: { r: r2, c: c2 } });
  }
  return out;
}
function swapGrid(w, a, b) {
  const g = w.grid, ta = g[a.r][a.c], tb = g[b.r][b.c];
  g[a.r][a.c] = tb; g[b.r][b.c] = ta;
  ta.r = b.r; ta.c = b.c; tb.r = a.r; tb.c = a.c;
}
// A fresh board: no ready-made matches, at least 3 moves, and a couple of keys.
function genBoard(w) {
  for (let tries = 0; tries < 50; tries++) {
    w.grid = [];
    for (let r = 0; r < ROWS; r++) {
      w.grid.push([]);
      for (let c = 0; c < COLS; c++) {
        const g = w.grid; let k;
        do k = randType(w); while ((c >= 2 && g[r][c - 1].type === k && g[r][c - 2].type === k) || (r >= 2 && g[r - 1][c].type === k && g[r - 2][c].type === k) ||
          (r >= 1 && c >= 1 && g[r - 1][c].type === k && g[r][c - 1].type === k && g[r - 1][c - 1].type === k));
        const t = w.mkTile(k); t.r = r; t.c = c; g[r].push(t);
      }
    }
    if (allMoves(w).length >= 3) break;
  }
  for (let placed = 0; placed < (TUNE.keyChance > 0 ? START_KEYS : 0);) { const t = w.grid[1 + randi(w, ROWS - 2)][randi(w, COLS)]; if (!t.key) { t.key = true; placed++; } }
}

/* ------------------------------------------------------------------ blasts */
// A blast is every cell cleared by one step, each with the time it pops; specials it reaches fire in turn.
class Blast {
  constructor(w, mult) { this.w = w; this.mult = mult; this.time = new Map(); this.src = new Map(); this.queue = []; this.activated = new Set(); this.sources = []; this.merge = new Map(); this.noActivate = new Set(); }
  source(x, y, type, t = 0) { const s = { x, y, type, t, pts: 0 }; this.sources.push(s); return s; }
  add(i, t, src) {
    const r = rOf(i), c = cOf(i); if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const cur = this.time.get(i); if (cur !== undefined && cur <= t) return;
    this.time.set(i, t); if (!this.src.has(i) || cur === undefined) this.src.set(i, src); this.queue.push(i);
  }
  addRC(r, c, t, src) { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) this.add(idxOf(r, c), t, src); }
  process() {
    while (this.queue.length) {
      const i = this.queue.shift(), t = tileAt(this.w, i);
      if (!t || t.immune) continue;
      if (t.special > 0 && !this.activated.has(i) && !this.noActivate.has(i)) { this.activated.add(i); activate(this, i, t, this.time.get(i)); }
    }
  }
  // Removes every scheduled tile from the board; returns the clears in pop order.
  plan() {
    this.process();
    const clears = []; let maxT = 0;
    const order = [...this.time.entries()].sort((a, b) => a[1] - b[1]);
    for (const [i, t] of order) {
      const r = rOf(i), c = cOf(i), tile = this.w.grid[r][c];
      if (!tile || tile.immune) continue;
      this.w.grid[r][c] = null;
      const src = this.src.get(i), pts = POINTS_PER_CANDY * this.mult; src.pts += pts;
      const m = this.merge.get(i);
      clears.push({ tile, r, c, t, pts, src, mergeTo: m !== undefined && !tile.special ? { r: rOf(m), c: cOf(m) } : null });
      maxT = Math.max(maxT, t);
    }
    return { clears, sources: this.sources, maxT };
  }
}
function mostCommon(B) {
  const w = B.w, cnt = [0, 0, 0, 0, 0, 0];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const t = w.grid[r][c]; if (t && !t.immune && !B.time.has(idxOf(r, c))) { const k = colorOf(t); if (k >= 0) cnt[k]++; } }
  let best = -1, bv = 0; cnt.forEach((v, i) => { if (v > bv) { bv = v; best = i; } }); return best;
}
function beamCells(B, r, c, horiz, t, src) {
  fx(B.w, 'beam', { r, c, horiz, type: src && src.type >= 0 ? src.type : 0 }, t);
  for (let k = 0; k < (horiz ? COLS : ROWS); k++) {
    const rr = horiz ? r : k, cc = horiz ? k : c;
    B.addRC(rr, cc, t + .04 + Math.abs(horiz ? cc - c : rr - r) * .03, src);
  }
}
const DIAMOND2 = []; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 2) DIAMOND2.push([dr, dc]);
function activate(B, i, tile, t) {
  const w = B.w, r = rOf(i), c = cOf(i), type = tile.type;
  w.stats.specialsFired[tile.special]++;
  const src = B.source(c + .5, r + .5, tile.special === BOMB ? -1 : type, t); src.pts += FIRE_BONUS[tile.special];
  if (tile.special === SH || tile.special === SV) {
    fx(w, 'stripe', { r, c }, t);
    beamCells(B, r, c, tile.special === SH, t, src);
  } else if (tile.special === WRAP) {
    fx(w, 'wrap', { r, c, type }, t);
    for (const [dr, dc] of DIAMOND2) B.addRC(r + dr, c + dc, t + .05 + (Math.abs(dr) + Math.abs(dc)) * .04, src);
  } else if (tile.special === SEEK) {
    launchSeekers(B, r, c, type, t, UNICORNS, NONE, src);
  } else if (tile.special === BOMB) {
    const col = mostCommon(B);
    fx(w, 'bomb', { r, c }, t);
    if (col >= 0) {
      let k = 0;
      for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
        const o = w.grid[rr][cc];
        if (o && colorOf(o) === col && !B.time.has(idxOf(rr, cc))) {
          const d = t + .14 + k++ * .03;
          fx(w, 'bolt', { r1: r, c1: c, r2: rr, c2: cc, type: col }, d - .08);
          B.add(idxOf(rr, cc), d, src);
        }
      }
    }
  }
}
// Unicorns home in on what the level needs most: jelly, then keys, then goal candies.
function seekTargets(B, n) {
  const w = B.w, need = new Set(w.goals.filter(g => g.kind === 'collect' && g.left > 0).map(g => g.type)), out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = w.grid[r][c], i = idxOf(r, c);
    if (!t || t.immune || B.time.has(i)) continue;
    out.push({ i, s: w.jelly[r][c] * 10 + (t.key ? 8 : 0) + (need.has(colorOf(t)) ? 6 : 0) - (t.special ? 4 : 0) + w.rng() * 3 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, n).map(o => o.i);
}
const UNICORN_FLIGHT = .95;              // seconds a unicorn spends looping around the screen
function launchSeekers(B, r, c, type, t, n, carry, src) {
  const w = B.w;
  fx(w, 'unicornLaunch', { r, c }, t);
  seekTargets(B, n).forEach((ti, k) => {
    const tr = rOf(ti), tc = cOf(ti), dur = UNICORN_FLIGHT + k * .07, hit = t + dur, col = type >= 0 ? type : k % 6;
    fx(w, 'unicorn', { r, c, tr, tc, dur, type: col }, t);
    B.add(ti, hit, src);
    fx(w, 'unicornHit', { r: tr, c: tc, type: col, carry }, hit);
    if (carry === WRAP) { for (const [dr, dc] of DIAMOND2) B.addRC(tr + dr, tc + dc, hit + .04 + (Math.abs(dr) + Math.abs(dc)) * .04, src); }
    else if (carry === SH || carry === SV) beamCells(B, tr, tc, carry === SH, hit, src);
    else if (TUNE.unicornSplash === 'plus') for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) B.addRC(tr + dr, tc + dc, hit + .05, src);
  });
}

/* ------------------------------------------------------------------ turn steps */
function pickSpawn(w, g, swapCells) {
  const ok = i => { const t = tileAt(w, i); return t && !t.special; };
  if (swapCells) for (const s of swapCells) { const i = idxOf(s.r, s.c); if (g.cells.has(i) && ok(i)) return i; }
  if (g.special === WRAP && g.inter >= 0 && ok(g.inter)) return g.inter;
  const run = g.longest.cells, mid = run[Math.floor((run.length - 1) / 2)];
  for (const i of [mid, ...run, ...g.cells]) if (ok(i)) return i;
  return -1;
}
// One cascade step: every group clears, and groups with a special shape leave that special behind.
function matchStep(w, groups, cascade, swapCells) {
  const B = new Blast(w, Math.min(cascade, MAX_MULT)), creates = [];
  for (const g of groups) {
    const spawn = g.special ? pickSpawn(w, g, swapCells) : -1;
    let cx = 0, cy = 0; g.cells.forEach(i => { cx += cOf(i); cy += rOf(i); });
    const src = B.source(cx / g.cells.size + .5, cy / g.cells.size + .5, g.type, 0);
    if (spawn >= 0) { creates.push({ i: spawn, special: g.special, tile: tileAt(w, spawn) }); src.pts += CREATE_BONUS[g.special]; }
    for (const i of g.cells) { if (i === spawn) continue; B.add(i, 0, src); if (spawn >= 0) B.merge.set(i, spawn); }
  }
  for (const cr of creates) cr.tile.immune = true;
  return { B, creates };
}
// The new special appears where its group was; the jelly under it counts as cleared.
function applyCreate(w, cr) {
  const t = cr.tile; t.special = cr.special; w.stats.specialsMade[cr.special]++;
  const r = rOf(cr.i), c = cOf(cr.i), ev = { jelly: false };
  if (w.jelly[r][c] > 0) { w.jelly[r][c]--; w.turnJelly++; ev.jelly = true; const g = jellyGoal(w); if (g) g.left--; }
  return ev;
}
function endCreates(creates) { for (const cr of creates) cr.tile.immune = false; }
// What one popped candy does to the level: score, meter, keys, jelly and collect goals.
function applyClear(w, cl) {
  const t = cl.tile, ev = { jelly: false, key: false, meterFull: false, collect: null };
  w.score += cl.pts;
  if (!w.over) {
    if (++w.meter >= TUNE.meterMax) { w.meter = 0; w.rainbows++; ev.meterFull = true; }
    if (t.key) { const ch = w.chest; ch.have++; if (ch.have >= ch.need && ch.have - ch.need < 1) ch.pending++; ev.key = true; }
  }
  if (w.jelly[cl.r][cl.c] > 0) { w.jelly[cl.r][cl.c]--; w.turnJelly++; ev.jelly = true; const g = jellyGoal(w); if (g) g.left--; }
  if (t.special !== BOMB) for (const g of w.goals) if (g.kind === 'collect' && g.type === t.type && g.left > 0) { g.left--; ev.collect = g; }
  return ev;
}
// Swapping two specials (or a rainbow with anything) sets off a combo instead of a match.
function comboPlan(w, ta, tb) {
  const B = new Blast(w, 1), ia = idxOf(ta.r, ta.c), ib = idxOf(tb.r, tb.c), sa = ta.special, sb = tb.special;
  B.noActivate.add(ia); B.noActivate.add(ib);
  const src = B.source(ta.c + .5, ta.r + .5, sa === BOMB ? tb.type : ta.type, 0);
  const out = { B, kind: '', conv: [], r: ta.r, c: ta.c, color: -1 };
  if (sa === BOMB && sb === BOMB) {
    out.kind = 'meltdown';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) B.addRC(r, c, .15 + Math.hypot(r - ta.r, c - ta.c) * .07, src);
    src.pts += 2000;
  } else if (sa === BOMB || sb === BOMB) {
    const bomb = sa === BOMB ? ta : tb, other = sa === BOMB ? tb : ta, col = other.type, os = other.special;
    const bi = idxOf(bomb.r, bomb.c), oi = idxOf(other.r, other.c), targets = [];
    out.color = col; out.bomb = bomb; out.other = other;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const t = w.grid[r][c]; if (t && t !== other && colorOf(t) === col) targets.push(t); }
    if (os > 0) {
      out.kind = os === WRAP ? 'wrapStorm' : os === SEEK ? 'unicornStorm' : 'stripeStorm';
      targets.forEach(t => { const sp = os === WRAP || os === SEEK ? os : (w.rng() < .5 ? SH : SV); t.special = sp; out.conv.push({ tile: t, special: sp }); });
      const d0 = targets.length * .04 + .5; out.delay = d0;
      B.noActivate.delete(oi);
      B.add(bi, d0, src); B.add(oi, d0 + .05, src);
      targets.forEach((t, i) => B.add(idxOf(t.r, t.c), d0 + .1 + i * .08, src));
    } else {
      out.kind = 'colorClear'; out.targets = targets;
      targets.forEach((t, i) => { const d = .12 + i * .035; fx(w, 'bolt', { r1: bomb.r, c1: bomb.c, r2: t.r, c2: t.c, type: col }, d - .08); B.add(idxOf(t.r, t.c), d, src); });
      B.add(oi, .1, src); B.add(bi, .14 + targets.length * .035, src);
    }
  } else {
    const isS = s => s === SH || s === SV, r0 = ta.r, c0 = ta.c;
    B.add(ia, 0, src); B.add(ib, 0, src);
    if (sa === SEEK && sb === SEEK) { out.kind = 'parade'; launchSeekers(B, r0, c0, ta.type, .05, PARADE, NONE, src); src.pts += 300; }
    else if (sa === SEEK || sb === SEEK) { const carry = sa === SEEK ? sb : sa; out.kind = carry === WRAP ? 'bombDrop' : 'laserDrop'; launchSeekers(B, r0, c0, ta.type, .05, UNICORNS, carry, src); src.pts += 300; }
    else if (sa === WRAP && sb === WRAP) { out.kind = 'kaboom'; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) B.addRC(r0 + dr, c0 + dc, .08 + Math.max(Math.abs(dr), Math.abs(dc)) * .07, src); src.pts += 400; }
    else {
      const wide = !(isS(sa) && isS(sb)); out.kind = wide ? 'megaCross' : 'cross';
      for (const d of (wide ? [-1, 0, 1] : [0])) { beamCells(B, r0 + d, c0, true, 0, src); beamCells(B, r0, c0 + d, false, 0, src); }
      src.pts += wide ? 300 : 150;
    }
  }
  return out;
}
// Gravity and refill. New candies may carry a key while fewer than KEY_MAX are on the board.
function collapse(w) {
  const moved = [], spawned = [], g = w.grid;
  for (let c = 0; c < COLS; c++) {
    let wr = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) { const t = g[r][c]; if (t) { if (r !== wr) { g[wr][c] = t; g[r][c] = null; t.r = wr; moved.push(t); } wr--; } }
    for (let r = wr; r >= 0; r--) {
      const t = w.mkTile(randType(w)); t.r = r; t.c = c; t.dropFrom = r - wr - 1.15;
      if (!w.over && keysOnBoard(w) < KEY_MAX && w.rng() < TUNE.keyChance) t.key = true;
      g[r][c] = t; spawned.push(t);
    }
  }
  return { moved, spawned };
}
function shuffleBoard(w) {
  const tiles = []; w.grid.forEach(row => row.forEach(t => t && tiles.push(t)));
  for (let attempt = 0; attempt < 300; attempt++) {
    shuffleInPlace(w, tiles);
    if (attempt > 150) tiles.forEach(t => { if (!t.special) t.type = randType(w); });
    tiles.forEach((t, i) => { const r = rOf(i), c = cOf(i); w.grid[r][c] = t; t.r = r; t.c = c; });
    if (!findGroups(w).length && allMoves(w).length) break;
  }
  w.stats.shuffles++;
  return tiles;
}
function startTurn(w) { w.turnJelly = 0; }
// Chest: opens when enough keys arrive; drops a rainbow plus two specials, a booster and some gold.
function openChest(w) {
  const ch = w.chest; if (ch.pending <= 0) return null;
  ch.pending--; ch.have -= ch.need; ch.need = Math.min(CHEST_MAX, ch.need + 1); w.stats.chests++;
  const rewards = TUNE.chestRewards === 'one' ? [[BOMB, SEEK, WRAP, SH, SV][randi(w, 5)]] : [BOMB, [SEEK, WRAP, SH][randi(w, 3)], [SEEK, WRAP, SV][randi(w, 3)]];
  const pool = shuffleInPlace(w, plainTiles(w)), placed = [];
  rewards.forEach((sp, i) => { if (pool[i]) { pool[i].special = sp; placed.push({ tile: pool[i], special: sp }); } });
  const prize = TUNE.econ.boosterPool[randi(w, TUNE.econ.boosterPool.length)];
  const gold = TUNE.econ.chestGold[0] + randi(w, TUNE.econ.chestGold[1] - TUNE.econ.chestGold[0] + 1);
  return { placed, prize, gold };
}
function dropRainbow(w) {
  if (w.rainbows <= 0) return null;
  w.rainbows--;
  const pool = plainTiles(w); if (!pool.length) return null;
  const t = pool[randi(w, pool.length)]; t.special = BOMB; w.stats.rainbowsDropped++;
  return t;
}
// Furniture Mode: if a turn cleans no dust, the dust creeps onto one clean neighbouring tile.
function spreadDust(w) {
  if (!w.level.spread || w.turnJelly > 0) return null;
  const g = jellyGoal(w); if (!g || g.left <= 0) return null;
  const cand = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (w.jelly[r][c] === 0) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && w.jelly[rr][cc] > 0) { cand.push([r, c, rr, cc]); break; } }
  }
  if (!cand.length) return null;
  const [r, c, fr, fc] = cand[randi(w, cand.length)];
  w.jelly[r][c] = 1; g.left++; g.need++; w.stats.spreads++;
  return { r, c, fromR: fr, fromC: fc };
}

/* ------------------------------------------------------------------ end of level and boosters */
function rushConvert(w) {
  if (w.moves <= 0) return null;
  const pool = plainTiles(w); if (!pool.length) return null;
  const t = pool[randi(w, pool.length)]; w.moves--; w.score += RUSH_POINTS;
  const special = w.rng() < .5 ? SH : SV; t.special = special;
  return { tile: t, special };
}
function rushDetonate(w) {
  const list = []; w.grid.forEach(row => row.forEach(t => t && t.special > 0 && list.push(idxOf(t.r, t.c))));
  if (!list.length) return null;
  const B = new Blast(w, 1);
  shuffleInPlace(w, list).slice(0, 5).forEach((i, k) => { const t = tileAt(w, i); B.add(i, k * .14, B.source(t.c + .5, t.r + .5, t.type, k * .14)); });
  return B;
}
function hammerPlan(w, r, c) { const t = w.grid[r][c], B = new Blast(w, 1); B.add(idxOf(r, c), 0, B.source(c + .5, r + .5, colorOf(t))); return B; }
function swarmPlan(w) { const B = new Blast(w, 1), src = B.source(COLS / 2, ROWS - .5, -1); launchSeekers(B, ROWS + .4, (COLS - 1) / 2, -1, .1, TUNE.stampede, NONE, src); return B; }
// Sugar Party. 'board': every candy is hit once. 'specials': a handful of candies become specials and all fire.
function partyPlan(w) {
  const B = new Blast(w, 2), src = B.source(COLS / 2, ROWS / 2, -1), placed = [];
  if (TUNE.party === 'board') {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) B.addRC(r, c, .25 + Math.hypot(r - 3.5, c - 3.5) * .08, src);
  } else {
    const kinds = [SH, SV, WRAP, SEEK];
    shuffleInPlace(w, plainTiles(w)).slice(0, TUNE.partySpecials).forEach((t, i) => { const sp = kinds[i % kinds.length]; t.special = sp; placed.push({ tile: t, special: sp }); });
    placed.forEach((p, i) => B.add(idxOf(p.tile.r, p.tile.c), .35 + i * .12, src));
  }
  return { B, placed };
}
function rainbowDropAt(w, r, c) { const t = w.grid[r][c]; if (!t) return null; t.special = BOMB; return t; }

return {
  COLS, ROWS, NONE, SH, SV, WRAP, BOMB, SEEK, CREATE_BONUS, FIRE_BONUS, POINTS_PER_CANDY, MAX_MULT, KEY_MAX,
  CHEST_FIRST, CHEST_MAX, UNICORNS, PARADE, UNICORN_FLIGHT, TUNE, get ECON() { return TUNE.econ; }, winGold, reviveCost, LEVEL_COUNT, HOME_FIRST, HOME_LAST, PAT,
  mulberry, idxOf, rOf, cOf, colorOf, logoCell, setLevels, levelDef, makeLevel, levelFromDef, newWorld, goalsMet, plainTiles, keysOnBoard,
  findGroups, matchAt, isComboSwap, allMoves, swapGrid, genBoard, Blast, mostCommon, seekTargets, pickSpawn, matchStep, applyCreate,
  endCreates, applyClear, comboPlan, collapse, shuffleBoard, startTurn, openChest, dropRainbow, spreadDust, rushConvert, rushDetonate,
  hammerPlan, swarmPlan, partyPlan, rainbowDropAt,
};
});
