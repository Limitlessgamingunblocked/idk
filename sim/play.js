// Plays one attempt at a level with a bot, and simulates whole play sessions for the economy model.
'use strict';
const { R, doSwap, useBooster, finishWin, starsFor } = require('./engine.js');
const { BOTS } = require('./bots.js');

function playLevel(n, botName, seed, opts = {}) {
  if (!opts.tune) return play(n, botName, seed, opts);
  // rule overrides for balance studies, restored afterwards
  const saved = Object.assign({}, R.TUNE); Object.assign(R.TUNE, opts.tune);
  try { return play(n, botName, seed, opts); } finally { Object.assign(R.TUNE, saved); }
}

// opts.kit: boosters the bot may spend this attempt ({ rainbow, swarm, moves, hammer, party }).
// opts.revive: { gold, close, max } — buy a revive when out of moves if the goals are at least `close` done.
function play(n, botName, seed, opts) {
  const L = opts.def ? R.levelFromDef(n, opts.def) : R.makeLevel(n), w = R.newWorld(L, seed), rng = R.mulberry((seed ^ 0x9E3779B9) >>> 0), bot = BOTS[botName](rng);
  R.genBoard(w);
  const kit = Object.assign({}, opts.kit || {}), used = {}, outright = {};
  const spend = (id, cell) => {
    if (!(kit[id] > 0)) return false; if (!useBooster(w, id, cell)) return false;
    kit[id]--; used[id] = (used[id] || 0) + 1; if (R.goalsMet(w) && outright[id] === undefined) outright[id] = true; return true;
  };
  let turns = 0, revives = 0, goldSpent = 0;
  const randomPlain = () => { const p = R.plainTiles(w); return p.length ? p[Math.floor(rng() * p.length)] : null; };
  const doneShare = () => { let s = 0; for (const g of w.goals) s += g.kind === 'score' ? Math.min(1, w.score / g.need) : 1 - Math.max(0, g.left) / Math.max(1, g.need); return s / w.goals.length; };
  while (!R.goalsMet(w)) {
    if (w.moves <= 0) {
      if (spend('moves')) continue;
      const rv = opts.revive;
      if (rv && revives < rv.max && doneShare() >= rv.close) {
        const cost = R.reviveCost(revives + 1);
        if (rv.gold - goldSpent >= cost) { revives++; goldSpent += cost; w.moves += R.ECON.reviveMoves; continue; }
      }
      break;
    }
    // booster policy: Sugar Party on the first turn, Unicorn Stampede on the second,
    // a Rainbow Drop once half the moves are gone, a Hammer on a special near the end
    if (kit.party > 0 && turns === 0) spend('party');
    if (kit.swarm > 0 && turns === (opts.swarmTurn ?? 1)) spend('swarm');
    if (kit.rainbow > 0 && w.moves <= Math.ceil(L.moves / 2)) { const t = randomPlain(); if (t) spend('rainbow', { r: t.r, c: t.c }); }
    if (kit.hammer > 0 && w.moves <= 3) { const s = []; w.grid.forEach(row => row.forEach(t => t && t.special > 0 && s.push(t))); const t = s[0] || randomPlain(); if (t) spend('hammer', { r: t.r, c: t.c }); }
    if (R.goalsMet(w)) break;
    const mv = bot.choose(w); if (!mv) break;
    if (!doSwap(w, mv.a, mv.b)) break;
    turns++;
    if (turns > 400) break;
  }
  const won = R.goalsMet(w), movesLeft = w.moves;
  if (won) finishWin(w);
  return {
    n, bot: botName, seed, won, turns, movesLeft, revives, goldSpent, used, outright, score: w.score, stars: won ? starsFor(L, w.score) : 0,
    left: w.goals.map(g => g.kind === 'score' ? Math.max(0, g.need - w.score) : Math.max(0, g.left)),
    need: w.goals.map(g => g.need),
    gold: w.earned ? w.earned.gold : 0, prizes: w.earned ? w.earned.boosters : [], stats: w.stats,
  };
}

// One player's session: play levels in order for `minutes`, carrying gold and boosters between attempts.
// profile: { start, minutes, think, anim, overhead, policy: 'hoard' | 'use', close, maxRevives, tune, gold, boosters }
function simulateSession(seed, profile) {
  const saved = Object.assign({}, R.TUNE); if (profile.tune) Object.assign(R.TUNE, profile.tune);
  try {
    const E = R.ECON, rng = R.mulberry(seed);
    let gold = profile.gold ?? E.startGold, t = 0, level = profile.start || 1, attempts = 0;
    const boosters = Object.assign({}, profile.boosters || E.startBoosters), startBoosters = Object.assign({}, boosters), stars = {};
    const out = { cleared: 0, attempts: 0, revives: 0, goldIn: { wins: 0, chests: 0 }, goldOut: { revives: 0 }, boostersUsed: {}, boostersEarned: 0, winsHelped: 0, wins: 0, timeline: [[0, gold]] };
    const totalBoosters = () => Object.values(boosters).reduce((a, b) => a + b, 0);
    while (t < profile.minutes * 60) {
      const kit = { moves: boosters.moves || 0 };
      if (profile.policy === 'use') { kit.rainbow = Math.min(1, boosters.rainbow || 0); kit.swarm = Math.min(1, boosters.swarm || 0); }
      const last = profile.world === 'home' ? R.HOME_LAST : R.LEVEL_COUNT, n = Math.min(level, last);
      const res = playLevel(n, 'greedy', (seed * 31 + attempts * 7919) >>> 0, { kit, revive: { gold, close: profile.close ?? .75, max: profile.maxRevives ?? 2 } });
      attempts++; out.attempts++;
      t += res.turns * (profile.think + profile.anim) + profile.overhead;
      for (const k in res.used) { boosters[k] -= res.used[k]; out.boostersUsed[k] = (out.boostersUsed[k] || 0) + res.used[k]; }
      gold -= res.goldSpent; out.goldOut.revives += res.goldSpent; out.revives += res.revives;
      gold += res.gold; out.goldIn.chests += res.gold;
      for (const p of res.prizes) { boosters[p] = (boosters[p] || 0) + 1; out.boostersEarned++; }
      if (res.won) {
        const first = !stars[n], g = R.winGold(res.stars, first);
        gold += g; out.goldIn.wins += g; stars[n] = Math.max(stars[n] || 0, res.stars);
        if (res.stars === 3) { const pool = E.boosterPool, b = pool[Math.floor(rng() * pool.length)]; boosters[b] = (boosters[b] || 0) + 1; out.boostersEarned++; }
        out.wins++; if (res.revives || Object.keys(res.used).length) out.winsHelped++;
        out.cleared++; if (level < last) level++;
      }
      out.timeline.push([Math.round(t), gold]);
    }
    out.goldEnd = gold; out.goldStart = profile.gold ?? E.startGold;
    out.boostersStart = Object.values(startBoosters).reduce((a, b) => a + b, 0); out.boostersEnd = totalBoosters();
    out.levelReached = level;
    return out;
  } finally { Object.assign(R.TUNE, saved); }
}
module.exports = { playLevel, simulateSession };
