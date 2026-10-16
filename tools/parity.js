// Proves the simulator and the real game agree: the simulator plays a game, then the game (in a real
// browser) replays the same seed and moves, and the full state is compared after every move.
// Usage: NODE_PATH=$(npm root -g) node tools/parity.js [games]   (needs Playwright + Chromium)
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const E = require('../sim/engine.js'), R = E.R;
const { BOTS } = require('../sim/bots.js');

function snap(w) {
  return { g: w.grid.map(r => r.map(t => t ? [t.type, t.special, t.key ? 1 : 0] : null)), j: w.jelly.map(r => r.slice()), score: w.score, moves: w.moves,
    chest: { need: w.chest.need, have: w.chest.have }, meter: w.meter, goals: w.goals.map(g => g.left) };
}
function simGame(n, seed) {
  const L = R.makeLevel(n), w = R.newWorld(L, seed), bot = BOTS.greedy(R.mulberry(seed + 7));
  R.genBoard(w);
  const steps = [{ move: null, s: snap(w) }];
  while (!R.goalsMet(w) && w.moves > 0) {
    const mv = bot.choose(w); if (!mv) break;
    E.doSwap(w, mv.a, mv.b);
    steps.push({ move: mv, s: snap(w) });
  }
  return steps;
}
function diff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return `${p}: sim ${JSON.stringify(a)} game ${JSON.stringify(b)}`;
  for (const k of Object.keys(a)) { const d = diff(a[k], b[k], p + '.' + k); if (d) return d; }
  return `${p}: differs`;
}

(async () => {
  const games = +(process.argv[2] || 12);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  // run the game fast: the timing of animations does not affect any rule decision
  await page.evaluate(() => { const orig = window.requestAnimationFrame; let t = performance.now(); window.requestAnimationFrame = f => setTimeout(() => { t += 50; f(t); }, 0); });
  const levels = [1, 2, 3, 5, 7, 9, 12, 14, 19, 26, 101, 107];
  let checked = 0, mismatches = 0;
  for (let gi = 0; gi < games; gi++) {
    const n = levels[gi % levels.length], seed = 1000 + gi * 7919;
    const steps = simGame(n, seed);
    await page.evaluate(([n, seed]) => { __sugar.start(n, seed); __sugar.begin(); }, [n, seed]);
    const ready = async () => { for (let i = 0; i < 4000; i++) { const s = await page.evaluate(() => ({ c: __sugar.canPlay(), o: __sugar.state().over })); if (s.c || s.o) return s; await page.waitForTimeout(5); } throw new Error('game never became ready'); };
    await ready();
    let bad = diff(steps[0].s, await page.evaluate(() => __sugar.snapshot()), 'start');
    for (let i = 1; i < steps.length && !bad; i++) {
      await page.evaluate(m => __sugar.swap(m.a, m.b), steps[i].move);
      await page.waitForTimeout(5);
      const st = await ready();
      const g = await page.evaluate(() => __sugar.snapshot());
      // after the winning move the game starts Sugar Rush, which the comparison stops at
      if (st.o && i === steps.length - 1) { const s = steps[i].s; bad = diff({ goals: s.goals }, { goals: g.goals }, `move ${i}`); }
      else bad = diff(steps[i].s, g, `move ${i}`);
      checked++;
    }
    if (bad) mismatches++;
    console.log(`level ${n} seed ${seed}: ${steps.length - 1} moves ${bad ? 'MISMATCH ' + bad : 'identical'}`);
  }
  console.log(`\n${games - mismatches}/${games} games identical, ${checked} moves compared, page errors: ${errors.length ? errors.join('; ') : 'none'}`);
  await browser.close();
  process.exit(mismatches || errors.length ? 1 : 0);
})();
