// Three play styles. None can see future refills: greedy and lookahead evaluate moves on copies of the
// board that refill from their own random stream.
'use strict';
const { R, doSwap, cloneWorld } = require('./engine.js');

// How much a position is worth: goal progress first, then specials on the board, then score.
const SPECIAL_VALUE = [0, 3, 3, 5, 9, 5];
function progress(w) {
  let p = 0;
  for (const g of w.goals) {
    if (g.kind === 'score') p += 100 * Math.min(1, w.score / g.need);
    else p += 100 * (1 - Math.max(0, g.left) / Math.max(1, g.need));
  }
  return p / w.goals.length;
}
function value(w) {
  if (R.goalsMet(w)) return 1e6 + w.moves * 1000;
  let v = progress(w) * 10;
  for (const row of w.grid) for (const t of row) if (t && t.special > 0) v += SPECIAL_VALUE[t.special];
  for (const row of w.grid) for (const t of row) if (t && t.key) v += .5;
  return v + w.score / 2000;
}

function randomBot(rng) {
  return { name: 'random', choose(w) { const m = R.allMoves(w); return m.length ? m[Math.floor(rng() * m.length)] : null; } };
}
function evalMove(w, mv, seed) { const c = cloneWorld(w, seed); if (!doSwap(c, mv.a, mv.b)) return -Infinity; return value(c); }
function greedyBot(rng) {
  return {
    name: 'greedy',
    choose(w) {
      const moves = R.allMoves(w); if (!moves.length) return null;
      let best = null, bv = -Infinity;
      for (const mv of moves) { const v = evalMove(w, mv, (rng() * 2 ** 32) >>> 0) + rng() * 1e-3; if (v > bv) { bv = v; best = mv; } }
      return best;
    },
  };
}
// Lookahead: shortlist the top K greedy moves, then for each sample S refills and add the best greedy reply.
function lookaheadBot(rng, K = 4, S = 3) {
  return {
    name: 'lookahead',
    choose(w) {
      const moves = R.allMoves(w); if (!moves.length) return null;
      const scored = moves.map(mv => ({ mv, v: evalMove(w, mv, (rng() * 2 ** 32) >>> 0) + rng() * 1e-3 })).sort((a, b) => b.v - a.v).slice(0, K);
      let best = scored[0].mv, bv = -Infinity;
      for (const { mv } of scored) {
        let total = 0;
        for (let s = 0; s < S; s++) {
          const c = cloneWorld(w, (rng() * 2 ** 32) >>> 0);
          if (!doSwap(c, mv.a, mv.b)) { total = -Infinity; break; }
          if (R.goalsMet(c) || c.moves <= 0) { total += value(c); continue; }
          let rv = value(c);
          for (const m2 of R.allMoves(c)) rv = Math.max(rv, evalMove(c, m2, (rng() * 2 ** 32) >>> 0));
          total += rv;
        }
        if (total / S > bv) { bv = total / S; best = mv; }
      }
      return best;
    },
  };
}
const BOTS = { random: randomBot, greedy: greedyBot, lookahead: lookaheadBot };
module.exports = { BOTS, value, progress };
