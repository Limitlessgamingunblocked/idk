// Measures game-feel timing in the real game (real time, real animations) against TIMING.md.
// Usage: NODE_PATH=$(npm root -g) node tools/timing.js [turnsPerLevel]   (needs Playwright + Chromium)
// Runs best on an idle machine: background load stretches frames.
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ms = v => Number.isFinite(v) ? Math.round(v) + ' ms' : 'n/a';

(async () => {
  const turnsPer = +(process.argv[2] || 20);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(600);
  await page.evaluate(() => __sugar.skipTutorials());
  const turns = [], bounces = [];
  const readyWait = async () => { for (let i = 0; i < 600; i++) { const s = await page.evaluate(() => ({ c: __sugar.canPlay(), o: __sugar.state().over })); if (s.c || s.o) return s; await page.waitForTimeout(20); } return { c: false, o: true }; };
  for (const [n, seed] of [[7, 11], [12, 22], [20, 33], [26, 44], [110, 55]]) {
    await page.evaluate(([n, seed]) => { __sugar.start(n, seed); __sugar.begin(); __sugar.setMoves(99); }, [n, seed]);
    await readyWait();
    for (let k = 0; k < turnsPer; k++) {
      const before = await page.evaluate(() => __sugar.marks().length);
      // every 5th turn try an illegal swap first, to time the bounce
      if (k % 5 === 4) {
        const ok = await page.evaluate(() => {
          const legal = new Set(__sugar.moves().map(m => `${m.a.r},${m.a.c},${m.b.r},${m.b.c}`)), g = __sugar.grid();
          for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) if (!legal.has(`${r},${c},${r},${c + 1}`) && g[r][c][1] === 0 && g[r][c + 1][1] === 0) { __sugar.swap({ r, c }, { r, c: c + 1 }); return true; }
          return false;
        });
        if (ok) { await readyWait(); const m = (await page.evaluate(() => __sugar.marks())).slice(before); const sw = m.find(x => x[0] === 'swap'), rd = m.find(x => x[0] === 'ready'); if (sw && rd) bounces.push(rd[1] - sw[1]); }
        continue;
      }
      const st = await page.evaluate(() => { const m = __sugar.moves(); if (!m.length) return false; __sugar.swap(m[0].a, m[0].b); return true; });
      if (!st) break;
      const s = await readyWait();
      const m = (await page.evaluate(() => __sugar.marks())).slice(before);
      const sw = m.find(x => x[0] === 'swap'), rd = m.filter(x => x[0] === 'ready').pop();
      if (!sw || !rd) continue;
      const t0 = sw[1], matches = m.filter(x => x[0] === 'match').map(x => x[1]), pops = m.filter(x => x[0] === 'pop').map(x => x[1]);
      // anything visibly happening: the swap slide, each pop (200 ms), each fall, unicorn flights and sparks
      const busy = [[t0, t0 + 160]].concat(pops.map(p => [p, p + 200]), m.filter(x => x[0] === 'flight').map(x => [x[1], x[1] + x[2]]));
      let fallStart = null; for (const [k2, t] of m) { if (k2 === 'fall') fallStart = t; if (k2 === 'land' && fallStart !== null) { busy.push([fallStart, t]); fallStart = null; } }
      busy.sort((a, b) => a[0] - b[0]);
      const gaps = []; let end = t0;
      for (const [a, b] of busy) { if (a > end) gaps.push(a - end); end = Math.max(end, b); }
      if (rd[1] > end) gaps.push(rd[1] - end);
      turns.push({ marks: m.map(x => [x[0], Math.round(x[1] - t0), x[2]]), level: n, dur: rd[1] - t0, toMatch: matches.length ? matches[0] - t0 : NaN, cascade: matches.slice(1).map((t, i) => t - matches[i]), steps: matches.length, maxGap: Math.max(0, ...gaps), gaps });
      if (s.o) break;
    }
  }
  const frames = (await page.evaluate(() => __sugar.frames())).filter(x => x > 0 && x < 1000);
  const audio = await page.evaluate(() => __sugar.audio());
  const T = await page.evaluate(() => __sugar.timing());
  const plain = turns.filter(t => t.steps === 1), cascades = turns.flatMap(t => t.cascade), gaps = turns.flatMap(t => t.gaps);
  const report = {
    turnsMeasured: turns.length,
    swapToFirstMatch: { p50: q(turns.map(t => t.toMatch), .5) },
    plainTurn: { n: plain.length, p50: q(plain.map(t => t.dur), .5), p90: q(plain.map(t => t.dur), .9) },
    allTurns: { p50: q(turns.map(t => t.dur), .5), p90: q(turns.map(t => t.dur), .9), max: Math.max(...turns.map(t => t.dur)) },
    cascadeInterval: { n: cascades.length, p10: q(cascades, .1), p50: q(cascades, .5), p90: q(cascades, .9) },
    deadGap: { p50: q(gaps, .5), p90: q(gaps, .9), max: Math.max(0, ...gaps), turnsWithGapOver150: turns.filter(t => t.maxGap > 150).length },
    bounce: { n: bounces.length, p50: q(bounces, .5) },
    frames: { n: frames.length, p50: q(frames, .5), p99: q(frames, .99), over20: frames.filter(f => f > 20).length / frames.length },
    audio, timing: T,
  };
  console.log(JSON.stringify(report, null, 1));
  require('fs').writeFileSync(path.join(__dirname, '..', 'sim/results/timing.json'), JSON.stringify({ when: new Date().toISOString(), report, turns }, null, 1));
  await browser.close();
})();
