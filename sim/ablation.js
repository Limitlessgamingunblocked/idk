// Balance study: how much does each generous rule shorten a level? Unlimited moves, 6 colours, greedy bot.
// Reports the moves a win takes (median and 75th percentile) per rule variant.
'use strict';
const fs = require('fs');
const { runJobs } = require('./run.js');
const base = require('../src/levels-original.json');
const LEVELS = [1, 2, 3, 7, 8, 10, 12, 20, 26];
const VARIANTS = process.argv[3] === 'calibrate' ? {
  'as shipped': {},
  'meter 72': { meterMax: 72 },
  'meter 100, 1-special chest': { meterMax: 100, chestRewards: 'one' },
  '+ keys 4%': { meterMax: 100, chestRewards: 'one', keyChance: .04 },
  'meter 150, 1-special chest, keys 4%': { meterMax: 150, chestRewards: 'one', keyChance: .04 },
  '+ unicorn hits one tile': { meterMax: 150, chestRewards: 'one', keyChance: .04, unicornSplash: 'single' },
} : {
  'as shipped': {},
  'no 2x2 unicorns': { boxMatches: false },
  'rainbow only from 5 in a line': { bigRainbow: Infinity },
  'no rainbow meter': { meterMax: Infinity },
  'no keys or chests': { keyChance: 0 },
  'chest gives one special': { chestRewards: 'one' },
  'unicorn hits one tile': { unicornSplash: 'single' },
  'all of the above off': { boxMatches: false, bigRainbow: Infinity, meterMax: Infinity, keyChance: 0, unicornSplash: 'single' },
};
const games = +(process.argv[2] || 300);
const jobs = [];
for (const [name, tune] of Object.entries(VARIANTS)) for (const n of LEVELS) {
  const def = Object.assign({}, base[n], { moves: 80, colors: 6 });
  jobs.push({ n, bot: 'greedy', games, seed: n * 7777 + 3, opts: { def, tune }, key: `${name}|${n}` });
}
runJobs(jobs, { keepGames: true }).then(res => {
  const out = {};
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  for (const name of Object.keys(VARIANTS)) {
    out[name] = {};
    for (const n of LEVELS) { const gs = res[`${name}|${n}`].games, T = gs.map(g => g.won ? g.turns : 81); out[name][n] = { p50: q(T, .5), p75: q(T, .75), win80: gs.filter(g => g.won).length / gs.length }; }
  }
  fs.writeFileSync(process.argv[3] === 'calibrate' ? 'sim/results/calibration.json' : 'sim/results/ablation.json', JSON.stringify(out, null, 1));
  console.log('median moves to win (75th percentile), 6 colours, greedy bot, unlimited moves');
  console.log('variant'.padEnd(32) + LEVELS.map(n => ('L' + n).padStart(9)).join(''));
  for (const name of Object.keys(VARIANTS)) console.log(name.padEnd(32) + LEVELS.map(n => `${out[name][n].p50}(${out[name][n].p75})`.padStart(9)).join(''));
});
