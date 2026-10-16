// Headless turn flow. Mirrors the game's async flow (attemptSwap / resolveBoard / afterTurn / sugarRush
// in index.html) step for step, calling the same rule functions, minus animation.
'use strict';
const R = require('../src/rules.js');
R.setLevels(require('../src/levels.json'));

function runPlan(w, plan) { const evs = []; for (const cl of plan.clears) evs.push(R.applyClear(w, cl)); return evs; }

function resolveCascades(w, swapCells, cascade) {
  for (let guard = 0; guard < 60; guard++) {
    const groups = R.findGroups(w); if (!groups.length) break;
    cascade++;
    if (cascade >= 2) w.stats.cascades++;
    const { B, creates } = R.matchStep(w, groups, cascade, swapCells); swapCells = null;
    const plan = B.plan();
    for (const cr of creates) R.applyCreate(w, cr);
    runPlan(w, plan);
    R.endCreates(creates);
    R.collapse(w);
  }
  return cascade;
}

// afterTurn: chests and free rainbows (only while the level is still on), dust spread, then shuffle if stuck.
function endTurn(w) {
  const ev = { chests: [], rainbows: 0, spread: null, shuffled: false };
  if (!R.goalsMet(w) && w.moves > 0) {
    while (w.chest.pending > 0) { const c = R.openChest(w); if (c) ev.chests.push(c); }
    while (w.rainbows > 0) { if (R.dropRainbow(w)) ev.rainbows++; }
  }
  ev.spread = R.spreadDust(w);
  if (!R.goalsMet(w) && w.moves > 0 && !R.allMoves(w).length) { R.shuffleBoard(w); ev.shuffled = true; }
  w.earned = w.earned || { gold: 0, boosters: [] };
  for (const c of ev.chests) { w.earned.gold += c.gold; w.earned.boosters.push(c.prize); }
  return ev;
}

// One swap. Returns false for an illegal swap (no match and not a combo), which costs nothing.
function doSwap(w, a, b, free = false) {
  const ta = w.grid[a.r][a.c], tb = w.grid[b.r][b.c];
  if (!ta || !tb) return false;
  R.startTurn(w);
  R.swapGrid(w, a, b);
  const combo = R.isComboSwap(ta, tb);
  if (!combo && !R.findGroups(w).length) {
    if (free) { endTurn(w); return true; }
    R.swapGrid(w, a, b); return false;
  }
  if (!free) w.moves--;
  if (combo) { const cp = R.comboPlan(w, ta, tb); runPlan(w, cp.B.plan()); R.collapse(w); resolveCascades(w, null, 1); }
  else resolveCascades(w, [a, b], 0);
  endTurn(w);
  return true;
}

function settle(w) { R.collapse(w); resolveCascades(w, null, 1); endTurn(w); }
function useBooster(w, id, cell) {
  R.startTurn(w);
  if (id === 'moves') { w.moves += R.ECON.reviveMoves; return true; }
  if (id === 'rainbow') { if (!R.rainbowDropAt(w, cell.r, cell.c)) return false; endTurn(w); return true; }
  if (id === 'hammer') { runPlan(w, R.hammerPlan(w, cell.r, cell.c).plan()); settle(w); return true; }
  if (id === 'swarm') { runPlan(w, R.swarmPlan(w).plan()); settle(w); return true; }
  if (id === 'party') { runPlan(w, R.partyPlan(w).B.plan()); settle(w); return true; }
  if (id === 'swap') return doSwap(w, cell.a, cell.b, true);
  return false;
}

// Sugar Rush: leftover moves become striped candies, then every special on the board goes off.
function finishWin(w) {
  w.over = true;
  while (R.rushConvert(w)) {}
  for (let guard = 0; guard < 40; guard++) {
    const B = R.rushDetonate(w); if (!B) break;
    runPlan(w, B.plan()); R.collapse(w); resolveCascades(w, null, 1);
  }
}
const starsFor = (L, score) => 1 + (score >= L.stars[1] ? 1 : 0) + (score >= L.stars[2] ? 1 : 0);

// Deep copy for bots: same board and counters, but a fresh random stream so a bot cannot see future refills.
function cloneWorld(w, seed) {
  const c = Object.assign({}, w);
  c.rng = R.mulberry(seed >>> 0);
  c.grid = w.grid.map(row => row.map(t => t ? { type: t.type, special: t.special, key: t.key, r: t.r, c: t.c, immune: false } : null));
  c.jelly = w.jelly.map(row => row.slice());
  c.goals = w.goals.map(g => Object.assign({}, g));
  c.chest = Object.assign({}, w.chest);
  c.stats = { specialsMade: w.stats.specialsMade.slice(), specialsFired: w.stats.specialsFired.slice(), cascades: w.stats.cascades, shuffles: w.stats.shuffles, chests: w.stats.chests, rainbowsDropped: w.stats.rainbowsDropped, spreads: w.stats.spreads };
  c.earned = { gold: 0, boosters: [] };
  c.fx = null;
  return c;
}

module.exports = { R, runPlan, resolveCascades, endTurn, doSwap, useBooster, finishWin, starsFor, cloneWorld };
