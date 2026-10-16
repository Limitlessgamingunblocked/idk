// Runs many games per level in parallel and summarises them.
// CLI: node sim/run.js --levels 1-30,101-130 --bots random,greedy,lookahead --games 1000 [--lookahead-games 200] [--kit] --out sim/results/x.json
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os'), fs = require('fs'), path = require('path');

if (!isMainThread) {
  const { playLevel, simulateSession } = require('./play.js');
  parentPort.on('message', job => {
    const out = [];
    for (let i = 0; i < job.count; i++) {
      const seed = (job.seed + i * 2654435761) >>> 0;
      out.push(job.bot === 'session' ? simulateSession(seed, job.opts) : playLevel(job.n, job.bot, seed, job.opts));
    }
    parentPort.postMessage({ id: job.id, games: out });
  });
  return;
}

// Wilson 95% interval for a win rate
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function summarise(games) {
  const n = games.length, wins = games.filter(g => g.won), losses = games.filter(g => !g.won);
  // how close a loss came: share of the goals still left (0 = nearly won)
  const leftShare = g => mean(g.left.map((l, i) => l / Math.max(1, g.need[i])));
  const ci = wilson(wins.length, n);
  return {
    games: n, wins: wins.length, winRate: wins.length / n, ci,
    turnsToWin: { mean: mean(wins.map(g => g.turns)), p10: pct(wins.map(g => g.turns), .1), p50: pct(wins.map(g => g.turns), .5), p90: pct(wins.map(g => g.turns), .9) },
    movesLeftOnWin: mean(wins.map(g => g.movesLeft)),
    stars: [1, 2, 3].map(s => wins.filter(g => g.stars === s).length / n),
    nearMiss: losses.filter(g => leftShare(g) <= .1).length / n,
    lossLeftShare: mean(losses.map(leftShare)),
    score: mean(games.map(g => g.score)),
    perGame: {
      specialsMade: [0, 1, 2, 3, 4, 5].map(k => mean(games.map(g => g.stats.specialsMade[k]))),
      specialsFired: [0, 1, 2, 3, 4, 5].map(k => mean(games.map(g => g.stats.specialsFired[k]))),
      cascades: mean(games.map(g => g.stats.cascades)), shuffles: mean(games.map(g => g.stats.shuffles)),
      chests: mean(games.map(g => g.stats.chests)), rainbowsDropped: mean(games.map(g => g.stats.rainbowsDropped)),
      spreads: mean(games.map(g => g.stats.spreads)), gold: mean(games.map(g => g.gold)), revives: mean(games.map(g => g.revives)),
    },
    boostersUsed: games.reduce((acc, g) => { for (const k in g.used) acc[k] = (acc[k] || 0) + g.used[k] / n; return acc; }, {}),
  };
}

// jobs: [{ n, bot, games, seed, opts, key }] -> { key: summary }
function runJobs(jobs, { threads = os.cpus().length, chunk = 50, keepGames = false, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const tasks = [];
    jobs.forEach((j, ji) => { for (let s = 0; s < j.games; s += chunk) tasks.push({ id: tasks.length, ji, n: j.n, bot: j.bot, opts: j.opts || {}, seed: (j.seed || 1) + s * 2654435761, count: Math.min(chunk, j.games - s) }); });
    const byJob = jobs.map(() => []);
    let next = 0, done = 0;
    const workers = Array.from({ length: Math.min(threads, tasks.length || 1) }, () => new Worker(__filename));
    const feed = w => { if (next < tasks.length) w.postMessage(tasks[next++]); else w.terminate(); };
    workers.forEach(w => {
      w.on('message', msg => { byJob[tasks[msg.id].ji].push(...msg.games); done++; onProgress && onProgress(done, tasks.length); feed(w); });
      w.on('error', reject);
      w.on('exit', () => { if (done === tasks.length && workers.every(x => x.threadId === -1 || true)) {} });
      feed(w);
    });
    const check = setInterval(() => {
      if (done === tasks.length) {
        clearInterval(check);
        const out = {};
        jobs.forEach((j, ji) => { out[j.key || `${j.n}:${j.bot}`] = keepGames ? { summary: summarise(byJob[ji]), games: byJob[ji] } : summarise(byJob[ji]); });
        resolve(out);
      }
    }, 50);
  });
}
module.exports = { runJobs, summarise, wilson };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const levels = arg('levels', '1-30,101-130').split(',').flatMap(r => { const [a, b] = r.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
  const bots = arg('bots', 'random,greedy,lookahead').split(',');
  const games = +arg('games', 1000), lookGames = +arg('lookahead-games', 200);
  const kit = process.argv.includes('--kit') ? { rainbow: 1, swarm: 1, moves: 1 } : null;
  const out = arg('out', 'sim/results/run.json');
  const jobs = [];
  for (const n of levels) for (const bot of bots) jobs.push({ n, bot, games: bot === 'lookahead' ? lookGames : games, seed: n * 100003 + 17, opts: kit ? { kit } : {}, key: `${n}:${bot}${kit ? ':kit' : ''}` });
  const t0 = Date.now();
  runJobs(jobs, { onProgress: (d, t) => { if (d % 50 === 0 || d === t) process.stderr.write(`\r${d}/${t} chunks`); } }).then(res => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), levels, bots, games, lookGames, kit, results: res }, null, 1));
    process.stderr.write(`\nwrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  });
}
