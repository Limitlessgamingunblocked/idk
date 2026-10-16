// Tunes all 60 levels to the difficulty curve, then validates on fresh seeds.
// 1. For a level design and goal scale, play N greedy games with unlimited moves and record the move each
//    win came on. Because limiting moves only cuts the same game short, P(win with M moves) = share of games
//    won within M moves, so one batch gives the whole win-rate-by-moves curve.
// 2. Pick the move count whose win rate is closest to the target. If it falls outside 18-34 moves, scale
//    the goal (bigger orders, higher score targets, two-layer jelly) and try again.
// 3. Validate the chosen levels on new seeds with random, greedy, greedy-with-boosters and lookahead bots.
// Writes src/levels.json, sim/results/tuned.json and sim/results/tuning-log.json.
'use strict';
const fs = require('fs');
const { runJobs, summarise } = require('./run.js');
const D = require('./designs.js');

const N = +(process.argv[2] || 400), VALID = +(process.argv[3] || 1000), LOOK = +(process.argv[4] || 100);
const MIN_MOVES = 18, MAX_MOVES = 34, CAP = 70;
const levels = [];
for (let i = 1; i <= 30; i++) levels.push({ n: i, design: D.candyDesign(i) }, { n: 100 + i, design: D.homeDesign(i) });

function curve(games) { // win rate if the level had M moves, for M = 0..CAP
  const T = games.map(g => g.won ? g.turns : Infinity).sort((a, b) => a - b), out = [];
  for (let M = 0, k = 0; M <= CAP; M++) { while (k < T.length && T[k] <= M) k++; out.push(k / T.length); }
  return out;
}
function bestMoves(cv, target) { let best = 1, bd = Infinity; for (let M = 5; M <= CAP; M++) { const d = Math.abs(cv[M] - target); if (d < bd - 1e-9) { bd = d; best = M; } } return best; }

(async () => {
  const t0 = Date.now(), log = {};
  for (const lv of levels) { lv.scale = 1; lv.target = D.targetWinRate(lv.design.i); lv.done = false; log[lv.n] = []; }
  // tune all levels together, a round at a time, so every round uses all cores
  for (let round = 0; round < 14 && levels.some(l => !l.done); round++) {
    const todo = levels.filter(l => !l.done);
    const res = await runJobs(todo.map(l => ({ n: l.n, bot: 'greedy', games: N, seed: l.n * 1009 + round * 7, opts: { def: D.build(l.design, l.scale, CAP) }, key: String(l.n) })), { keepGames: true });
    for (const l of todo) {
      const cv = curve(res[l.n].games), M = bestMoves(cv, l.target);
      log[l.n].push({ round, scale: +l.scale.toFixed(3), moves: M, winAtMoves: +cv[M].toFixed(3), wonEver: +cv[CAP].toFixed(3) });
      l.moves = M; l.curve = cv;
      const canScale = D.scalable(l.design);
      if (M < MIN_MOVES && canScale && l.scale < 9) l.scale *= Math.min(1.6, Math.max(1.15, MIN_MOVES / Math.max(M, 1)));
      else if (M > MAX_MOVES && l.scale > .5) l.scale /= Math.min(1.5, Math.max(1.12, M / MAX_MOVES));
      else l.done = true;
    }
    process.stderr.write(`round ${round}: ${levels.filter(l => l.done).length}/${levels.length} levels settled (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  }

  // final definitions
  const table = {};
  for (const l of levels) table[l.n] = D.build(l.design, l.scale, l.moves);

  // validation on fresh seeds
  const jobs = [];
  for (const l of levels) {
    const def = table[l.n], s = l.n * 99991 + 123456;
    jobs.push({ n: l.n, bot: 'greedy', games: VALID, seed: s, opts: { def }, key: `${l.n}:greedy` });
    jobs.push({ n: l.n, bot: 'random', games: VALID, seed: s + 1, opts: { def }, key: `${l.n}:random` });
    jobs.push({ n: l.n, bot: 'greedy', games: VALID, seed: s + 2, opts: { def, kit: { rainbow: 1, swarm: 1, moves: 1 } }, key: `${l.n}:greedy:kit` });
    jobs.push({ n: l.n, bot: 'lookahead', games: LOOK, seed: s + 3, opts: { def }, key: `${l.n}:lookahead` });
  }
  const val = await runJobs(jobs, { keepGames: true, onProgress: (d, t) => { if (d % 100 === 0 || d === t) process.stderr.write(`\rvalidation ${d}/${t}`); } });
  process.stderr.write('\n');

  // stars from the greedy bot's winning scores: 2 stars at the median win, 3 stars at the top 15%
  const r100 = v => Math.max(100, Math.round(v / 100) * 100);
  const results = {};
  for (const l of levels) {
    const g = val[`${l.n}:greedy`].games.filter(x => x.won).map(x => x.score).sort((a, b) => a - b);
    const q = p => g.length ? g[Math.min(g.length - 1, Math.floor(p * g.length))] : 0;
    const sg = table[l.n].goals.find(x => x[0] === 'score');
    table[l.n].stars = [sg ? sg[1] : r100(q(.05)), r100(q(.5)), r100(q(.85))];
    if (table[l.n].stars[1] <= table[l.n].stars[0]) table[l.n].stars[1] = table[l.n].stars[0] + 100;
    if (table[l.n].stars[2] <= table[l.n].stars[1]) table[l.n].stars[2] = table[l.n].stars[1] + 100;
    results[l.n] = { target: l.target, kind: D.kindOf(l.design.i), world: l.design.world, def: table[l.n], scale: +l.scale.toFixed(3), tuningCurve: l.curve.map(x => +x.toFixed(3)),
      greedy: summarise(val[`${l.n}:greedy`].games), random: summarise(val[`${l.n}:random`].games), kit: summarise(val[`${l.n}:greedy:kit`].games), lookahead: summarise(val[`${l.n}:lookahead`].games) };
  }
  fs.writeFileSync('src/levels.json', JSON.stringify(table, null, 1));
  fs.writeFileSync('sim/results/tuned.json', JSON.stringify({ when: new Date().toISOString(), N, VALID, LOOK, results }, null, 1));
  fs.writeFileSync('sim/results/tuning-log.json', JSON.stringify(log, null, 1));
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
})();
