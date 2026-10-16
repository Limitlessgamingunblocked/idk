// Level designs before tuning: what each level asks for. The tuner (sim/tune.js) sets the move count and
// goal size so each level hits its place on the difficulty curve.
'use strict';
const original = require('../src/levels-original.json');

// Where each level should sit: the greedy bot's win rate without boosters.
// Gentle start, slow decline, a hard level every 5th from level 10, and a breather after each hard one.
function targetWinRate(i) {             // i = 1..30 within its world
  if (i <= 4) return .95;
  const base = .92 - (i - 1) * (.92 - .62) / 29;
  if (i % 5 === 0 && i >= 10) return Math.max(.3, base - .27);
  if (i % 5 === 1 && i >= 11) return Math.min(.95, base + .06);
  if (i === 5) return base - .08;
  return base;
}
const kindOf = i => (i % 5 === 0 && i >= 10) ? 'hard' : (i % 5 === 1 && i >= 11) ? 'breather' : 'normal';

// Candy levels keep their goals and layouts; 6 colours from level 4 on.
function candyDesign(i) {
  const d = original[i];
  return { world: 'candy', i, goals: d.goals, jelly: d.jelly || null, colors: i <= 3 ? 5 : 6 };
}
// Furniture Mode: dust that spreads when a turn cleans none, mixed with furniture orders.
const SEEDS = ['rug', 'corner', 'twoCorners', 'hall', 'underBed', 'fourCorners', 'attic', 'stripes2'];
function homeDesign(i) {
  const k = i % 5, seed = SEEDS[(i * 3) % SEEDS.length], types = [(i * 2) % 6, (i * 2 + 3) % 6, (i + 1) % 6];
  let d;
  if (i === 1) d = { goals: [['jelly']], jelly: 'rug', spread: true };
  else if (i === 2) d = { goals: [['collect', 0, 14], ['collect', 4, 14]] };
  else if (i === 3) d = { goals: [['jelly']], jelly: 'twoCorners', spread: true };
  else if (k === 1) d = { goals: [['jelly']], jelly: seed, spread: true };
  else if (k === 2) d = { goals: [['jelly'], ['collect', types[0], 16]], jelly: seed, spread: true };
  else if (k === 3) d = { goals: [['jelly']], jelly: seed, spread: true, layers: 2 };
  else if (k === 4) d = { goals: types.map(t => ['collect', t, 16]) };
  else d = { goals: [['jelly']], jelly: ['attic', 'underBed', 'stripes2', 'fourCorners'][(i / 5) % 4], spread: true };
  return Object.assign({ world: 'home', i, colors: i <= 2 ? 5 : 6, jelly: null }, d);
}

// Turn a design plus a difficulty scale into a level definition.
// scale grows collect counts and score targets; jelly/dust levels go to 2 layers once scale >= 1.4.
// Dust levels grow by starting from a bigger dusty area (smallest to largest), then by doubling its layers.
const DUST_LADDER = ['rug', 'corner', 'twoCorners', 'hall', 'underBed', 'fourCorners', 'stripes2', 'attic'];
function build(design, scale, moves) {
  const goals = design.goals.map(g => g[0] === 'score' ? ['score', Math.round(g[1] * scale / 100) * 100]
    : g[0] === 'collect' ? ['collect', g[1], Math.max(6, Math.round(g[2] * scale))] : g.slice());
  const def = { moves, colors: design.colors, goals };
  if (design.jelly && design.spread) {
    const start = DUST_LADDER.indexOf(design.jelly), step = Math.max(0, Math.floor(Math.log(scale) / Math.log(1.3) + 1e-9));
    const idx = start + step;
    def.jelly = DUST_LADDER[Math.min(idx, DUST_LADDER.length - 1)]; def.spread = true;
    const layers = design.layers || (idx >= DUST_LADDER.length ? 2 : 0); if (layers) def.layers = layers;
  } else if (design.jelly) {
    def.jelly = design.jelly; const layers = design.layers || (scale >= 1.4 ? 2 : 0); if (layers) def.layers = layers;
  }
  return def;
}
const scalable = design => design.goals.some(g => g[0] !== 'jelly') || !!design.spread || (!design.layers && !!design.jelly);

module.exports = { targetWinRate, kindOf, candyDesign, homeDesign, build, scalable };
