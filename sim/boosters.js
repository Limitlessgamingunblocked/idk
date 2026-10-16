// Booster strength: on hard and late levels, how much does one booster used at the start raise the win
// rate, and how often does it win the level by itself (goals met the moment it fires)?
// Usage: node sim/boosters.js [games]   -> sim/results/boosters.json
'use strict';
const fs = require('fs');
const { runJobs } = require('./run.js');
const LEVELS = [10, 15, 20, 25, 28, 30, 110, 120, 130];
const games = +(process.argv[2] || 400);
const SETUPS = {
  'no booster': { kit: {} },
  'Sugar Party (hits every candy)': { kit: { party: 1 }, tune: { party: 'board' } },
  'Sugar Party (6 specials)': { kit: { party: 1 }, tune: { party: 'specials' } },
  'Unicorn Stampede x8': { kit: { swarm: 1 }, tune: { stampede: 8 }, swarmTurn: 0 },
  'Unicorn Stampede x5': { kit: { swarm: 1 }, tune: { stampede: 5 }, swarmTurn: 0 },
  'Rainbow Drop': { kit: { rainbow: 1 } },
  '+5 Moves': { kit: { moves: 1 } },
};
const jobs = [];
for (const [name, s] of Object.entries(SETUPS)) for (const n of LEVELS)
  jobs.push({ n, bot: 'greedy', games, seed: n * 3331 + 9, key: `${name}|${n}`, opts: { kit: s.kit, tune: s.tune, swarmTurn: s.swarmTurn } });
runJobs(jobs, { keepGames: true }).then(res => {
  const out = {};
  for (const name of Object.keys(SETUPS)) {
    out[name] = {};
    for (const n of LEVELS) {
      const g = res[`${name}|${n}`].games;
      out[name][n] = { win: g.filter(x => x.won).length / g.length, outright: g.filter(x => Object.values(x.outright).some(Boolean)).length / g.length };
    }
    out[name].avgWin = LEVELS.reduce((a, n) => a + out[name][n].win, 0) / LEVELS.length;
    out[name].avgOutright = LEVELS.reduce((a, n) => a + out[name][n].outright, 0) / LEVELS.length;
  }
  fs.writeFileSync('sim/results/boosters.json', JSON.stringify({ levels: LEVELS, games, out }, null, 1));
  const base = out['no booster'].avgWin;
  console.log('booster'.padEnd(34) + 'avg win  (+ vs none)  wins level by itself');
  for (const [name, o] of Object.entries(out)) console.log(name.padEnd(34) + `${(o.avgWin * 100).toFixed(0)}%`.padStart(7) + `${((o.avgWin - base) * 100).toFixed(0).padStart(8)} pts` + `${(o.avgOutright * 100).toFixed(1)}%`.padStart(14));
});
