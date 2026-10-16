// Plays one attempt at a level with a bot. Optional booster kit and revives for the "with boosters" and economy runs.
'use strict';
const { R, doSwap, useBooster, finishWin, starsFor } = require('./engine.js');
const { BOTS } = require('./bots.js');

// kit: { rainbow, swarm, moves, hammer, party } counts the bot may spend; revives: how many +5 revives it may buy.
function playLevel(n, botName, seed, opts = {}) {
  const L = R.makeLevel(n), w = R.newWorld(L, seed), rng = R.mulberry((seed ^ 0x9E3779B9) >>> 0), bot = BOTS[botName](rng);
  R.genBoard(w);
  const kit = Object.assign({}, opts.kit || {}), used = {};
  const spend = (id, cell) => { if (!(kit[id] > 0)) return false; if (!useBooster(w, id, cell)) return false; kit[id]--; used[id] = (used[id] || 0) + 1; return true; };
  let turns = 0, revives = 0;
  const randomPlain = () => { const p = R.plainTiles(w); return p.length ? p[Math.floor(rng() * p.length)] : null; };
  while (!R.goalsMet(w)) {
    if (w.moves <= 0) {
      // out of moves: a +5 booster first, then a paid revive if allowed
      if (spend('moves')) continue;
      if (revives < (opts.revives || 0)) { revives++; w.moves += R.ECON.reviveMoves; continue; }
      break;
    }
    // simple booster policy: party and stampede early, a rainbow drop once halfway, a hammer on a special late
    if (kit.party > 0 && turns === 0) spend('party');
    if (kit.swarm > 0 && turns === 1) spend('swarm');
    if (kit.rainbow > 0 && w.moves <= Math.ceil(L.moves / 2)) { const t = randomPlain(); if (t) spend('rainbow', { r: t.r, c: t.c }); }
    if (kit.hammer > 0 && w.moves <= 3) { const s = []; w.grid.forEach(row => row.forEach(t => t && t.special > 0 && s.push(t))); const t = s[0] || randomPlain(); if (t) spend('hammer', { r: t.r, c: t.c }); }
    if (R.goalsMet(w)) break;
    const mv = bot.choose(w); if (!mv) break;
    if (!doSwap(w, mv.a, mv.b)) break;   // bots only pick legal moves; guard against a stall
    turns++;
    if (turns > 400) break;
  }
  const won = R.goalsMet(w), movesLeft = w.moves;
  if (won) finishWin(w);
  return {
    n, bot: botName, seed, won, turns, movesLeft, revives, used, score: w.score, stars: won ? starsFor(L, w.score) : 0,
    left: w.goals.map(g => g.kind === 'score' ? Math.max(0, g.need - w.score) : Math.max(0, g.left)),
    need: w.goals.map(g => g.need),
    gold: w.earned ? w.earned.gold : 0, prizes: w.earned ? w.earned.boosters : [], stats: w.stats,
  };
}
module.exports = { playLevel };
