// Economy model: simulated 20-minute sessions for different players, under a given economy.
// Usage: node sim/economy.js <variant> [sessions]   variants are defined below; results go to sim/results/economy-<variant>.json
'use strict';
const fs = require('fs');
const { runJobs } = require('./run.js');
const R = require('../src/rules.js');

const SHIPPED = JSON.parse(JSON.stringify(R.TUNE.econ));
const VARIANTS = {
  shipped: { econ: SHIPPED, party: 'board', stampede: 8 },
  proposed: {
    econ: {
      startGold: 30,
      startBoosters: { hammer: 1, swap: 1, rainbow: 1, swarm: 1, moves: 1, party: 0 },
      winGold: [2, 1, 3],                  // base, per star, first clear
      chestGold: [2, 4],
      reviveBase: 25,                      // 25, then 50, then 75 within one attempt
      reviveMoves: 5,
      price: { hammer: 30, swap: 30, rainbow: 45, swarm: 50, moves: 40, party: 120 },
      boosterPool: ['hammer', 'hammer', 'swap', 'swap', 'moves', 'rainbow'],
    },
    party: 'specials', stampede: 5,
  },
};
// Assumed human pace: thinking time per move (an assumption until playtests measure it) plus the game's
// own animation time per turn (measured by tools/timing.js), plus intro/win screens per attempt.
const PACE = { think: 3, anim: +(process.env.ANIM || 1.3), overhead: 12 };

const variant = process.argv[2] || 'shipped', sessions = +(process.argv[3] || 300), v = VARIANTS[variant];
const tune = { econ: v.econ, party: v.party, stampede: v.stampede };
const PROFILES = {
  'new player, saves boosters': { start: 1, policy: 'hoard' },
  'new player, uses boosters': { start: 1, policy: 'use' },
  'mid-game player (from level 12)': { start: 12, policy: 'hoard', gold: v.econ.startGold * 3 },
  'Furniture Mode (from level 101)': { start: 101, world: 'home', policy: 'hoard' },
};
const jobs = Object.entries(PROFILES).map(([name, p], i) => ({ bot: 'session', n: 0, games: sessions, seed: 1000 + i * 101, key: name,
  opts: Object.assign({ minutes: 20, close: .75, maxRevives: 2, tune }, PACE, p) }));
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
runJobs(jobs, { keepGames: true, chunk: 10 }).then(res => {
  const out = { variant, econ: v.econ, party: v.party, stampede: v.stampede, pace: PACE, profiles: {} };
  for (const name of Object.keys(PROFILES)) {
    const s = res[name].games;
    const net = s.map(x => x.goldEnd - x.goldStart), bNet = s.map(x => x.boostersEnd - x.boostersStart);
    out.profiles[name] = {
      sessions: s.length,
      levelsCleared: { p50: q(s.map(x => x.cleared), .5), p10: q(s.map(x => x.cleared), .1), p90: q(s.map(x => x.cleared), .9) },
      attemptsPerClear: mean(s.map(x => x.attempts / Math.max(1, x.cleared))),
      revivesPerSession: mean(s.map(x => x.revives)),
      goldNet: { p10: q(net, .1), p50: q(net, .5), p90: q(net, .9) },
      goldIn: { wins: mean(s.map(x => x.goldIn.wins)), chests: mean(s.map(x => x.goldIn.chests)) },
      goldOut: { revives: mean(s.map(x => x.goldOut.revives)) },
      boostersNet: { p10: q(bNet, .1), p50: q(bNet, .5), p90: q(bNet, .9) },
      boostersEarned: mean(s.map(x => x.boostersEarned)),
      boostersUsed: Object.fromEntries(['hammer', 'swap', 'rainbow', 'swarm', 'moves', 'party'].map(k => [k, mean(s.map(x => x.boostersUsed[k] || 0))])),
      winsHelped: mean(s.map(x => x.winsHelped / Math.max(1, x.wins))),
      goldTimeline: [0, 300, 600, 900, 1200].map(sec => q(s.map(x => { let g = x.timeline[0][1]; for (const [t, gg] of x.timeline) if (t <= sec) g = gg; return g; }), .5)),
    };
  }
  fs.writeFileSync(`sim/results/economy-${variant}.json`, JSON.stringify(out, null, 1));
  console.log(`economy: ${variant}`);
  for (const [name, p] of Object.entries(out.profiles))
    console.log(`${name.padEnd(34)} cleared ${p.levelsCleared.p50} (${p.levelsCleared.p10}-${p.levelsCleared.p90})  tries/clear ${p.attemptsPerClear.toFixed(2)}  revives ${p.revivesPerSession.toFixed(2)}  gold net ${p.goldNet.p50} (${p.goldNet.p10}..${p.goldNet.p90})  boosters net ${p.boostersNet.p50}  wins helped ${(p.winsHelped * 100).toFixed(0)}%`);
});
