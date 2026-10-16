// Second tuning pass: levels whose validated greedy win rate is more than 5 points off target get a larger
// unlimited-moves batch, a new move count, and a fresh validation. Also measures what spreading dust does to
// Furniture Mode by replaying its dust levels with spreading switched off.
// Usage: node sim/refine.js   (after sim/tune.js)
'use strict';
const fs = require('fs');
const { runJobs, summarise } = require('./run.js');
const T = require('./results/tuned.json'), table = require('../src/levels.json');
const CAP = 70, BIG = 1500, VALID = 1000, LOOK = 100;
const curve = games => { const t = games.map(g => g.won ? g.turns : Infinity).sort((a, b) => a - b), out = []; for (let M = 0, k = 0; M <= CAP; M++) { while (k < t.length && t[k] <= M) k++; out.push(k / t.length); } return out; };
const bestMoves = (cv, target) => { let best = 1, bd = Infinity; for (let M = 5; M <= CAP; M++) { const d = Math.abs(cv[M] - target); if (d < bd - 1e-9) { bd = d; best = M; } } return best; };

(async () => {
  const off = Object.entries(T.results).filter(([, r]) => Math.abs(r.greedy.winRate - r.target) > .05).map(([n]) => +n);
  console.log('refining', off.join(', '));
  const res = await runJobs(off.map(n => ({ n, bot: 'greedy', games: BIG, seed: n * 4441 + 77, opts: { def: Object.assign({}, table[n], { moves: CAP }) }, key: String(n) })), { keepGames: true });
  const jobs = [];
  for (const n of off) {
    const cv = curve(res[n].games), M = bestMoves(cv, T.results[n].target);
    console.log(`level ${n}: target ${T.results[n].target.toFixed(2)}, ${table[n].moves} -> ${M} moves (curve says ${cv[M].toFixed(3)})`);
    table[n].moves = M;
    const def = table[n], s = n * 77773 + 999;
    jobs.push({ n, bot: 'greedy', games: VALID, seed: s, opts: { def }, key: `${n}:greedy` }, { n, bot: 'random', games: VALID, seed: s + 1, opts: { def }, key: `${n}:random` },
      { n, bot: 'greedy', games: VALID, seed: s + 2, opts: { def, kit: { rainbow: 1, swarm: 1, moves: 1 } }, key: `${n}:greedy:kit` }, { n, bot: 'lookahead', games: LOOK, seed: s + 3, opts: { def }, key: `${n}:lookahead` });
  }
  // spreading dust on vs off, same levels and moves
  const dust = Object.keys(table).map(Number).filter(n => table[n].spread);
  for (const n of dust) jobs.push({ n, bot: 'greedy', games: 600, seed: n * 13 + 5, opts: { def: Object.assign({}, table[n], { spread: false }) }, key: `${n}:nospread` });
  const val = await runJobs(jobs, { keepGames: true });
  const r100 = v => Math.max(100, Math.round(v / 100) * 100);
  for (const n of off) {
    const g = val[`${n}:greedy`].games.filter(x => x.won).map(x => x.score).sort((a, b) => a - b), q = p => g.length ? g[Math.min(g.length - 1, Math.floor(p * g.length))] : 0;
    const sg = table[n].goals.find(x => x[0] === 'score');
    table[n].stars = [sg ? sg[1] : r100(q(.05)), r100(q(.5)), r100(q(.85))];
    if (table[n].stars[1] <= table[n].stars[0]) table[n].stars[1] = table[n].stars[0] + 100;
    if (table[n].stars[2] <= table[n].stars[1]) table[n].stars[2] = table[n].stars[1] + 100;
    Object.assign(T.results[n], { def: table[n], refined: true, greedy: summarise(val[`${n}:greedy`].games), random: summarise(val[`${n}:random`].games), kit: summarise(val[`${n}:greedy:kit`].games), lookahead: summarise(val[`${n}:lookahead`].games) });
    console.log(`  validated: greedy ${(T.results[n].greedy.winRate * 100).toFixed(1)}% (target ${(T.results[n].target * 100).toFixed(0)}%)`);
  }
  T.spreadStudy = {};
  for (const n of dust) T.spreadStudy[n] = { withSpread: T.results[n].greedy.winRate, withoutSpread: summarise(val[`${n}:nospread`].games).winRate, spreadsPerGame: T.results[n].greedy.perGame.spreads };
  const avg = k => dust.reduce((a, n) => a + T.spreadStudy[n][k], 0) / dust.length;
  console.log(`spreading dust: greedy win ${(avg('withSpread') * 100).toFixed(1)}% with spreading vs ${(avg('withoutSpread') * 100).toFixed(1)}% without, ${avg('spreadsPerGame').toFixed(1)} spreads per game`);
  fs.writeFileSync('src/levels.json', JSON.stringify(table, null, 1));
  fs.writeFileSync('sim/results/tuned.json', JSON.stringify(T, null, 1));
})();
