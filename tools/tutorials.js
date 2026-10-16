// Checks every first-time tutorial in the real game: each lesson must set up its pattern, accept the
// scripted swap, and make the special it teaches; each tip must show on its level.
// Usage: NODE_PATH=$(npm root -g) node tools/tutorials.js [seeds per tutorial]   (needs Playwright + Chromium)
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const seeds = +(process.argv[2] || 10);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { let t = performance.now(); window.requestAnimationFrame = f => setTimeout(() => { t += 50; f(t); }, 0); });
  const { LESSONS, TIPS } = await page.evaluate(() => __sugar.lessons());
  const wait = async (fn, what) => { for (let i = 0; i < 2000; i++) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(5); } throw new Error('timed out waiting for ' + what); };
  const start = async (n, seed) => { await page.evaluate(([n, seed]) => { __sugar.resetTutorials(); __sugar.start(n, seed); __sugar.begin(); }, [n, seed]); };
  let pass = 0, total = 0;
  for (const [n, lesson] of Object.entries(LESSONS)) for (let s = 0; s < seeds; s++) {
    total++;
    const seed = 500 + s * 7907 + +n;
    try {
      await start(+n, seed);
      const tu = await wait(() => { const t = __sugar.tutorial(); return t && t.move && __sugar.canPlay() ? t : null; }, 'lesson');
      if (tu.text !== lesson.before) throw new Error('wrong text');
      await page.evaluate(m => __sugar.swap(m.a, m.b), tu.move);
      await wait(() => __sugar.canPlay() || (__sugar.tutorial() && __sugar.tutorial().blocking), 'move to finish');
      const grid = await page.evaluate(() => __sugar.grid());
      if (lesson.special && !grid.some(row => row.some(t => t && t[1] === lesson.special))) throw new Error('special not made');
      if (lesson.after) { const after = await page.evaluate(() => __sugar.tutorial()); if (!after || after.text !== lesson.after) throw new Error('no follow-up text'); }
      pass++;
    } catch (e) { console.log(`lesson ${lesson.id} level ${n} seed ${seed}: ${e.message}`); }
  }
  for (const [n, tip] of Object.entries(TIPS)) for (let s = 0; s < seeds; s++) {
    total++;
    try {
      await start(+n, 900 + s * 7919);
      await wait(() => { const t = __sugar.tutorial(); return t && t.blocking ? t : null; }, 'tip');
      pass++;
    } catch (e) { console.log(`tip ${tip.id} level ${n}: ${e.message}`); }
  }
  console.log(`${pass}/${total} tutorial runs played as scripted (${Object.keys(LESSONS).length} lessons, ${Object.keys(TIPS).length} tips, ${seeds} seeds each), page errors: ${errors.length ? errors.join('; ') : 'none'}`);
  await browser.close();
  process.exit(pass === total && !errors.length ? 0 : 1);
})();
