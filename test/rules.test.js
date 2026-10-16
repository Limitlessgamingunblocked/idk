// Unit tests for the rulebook (RULES.md). Run: node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
R.setLevels(require('../src/levels.json'));
const E = require('../sim/engine.js');

const { NONE, SH, SV, WRAP, BOMB, SEEK } = R;
// Build a world from a picture: one letter per cell (R O Y G B P = colours 0-5), '.' = a filler colour pattern.
const LET = 'ROYGBP';
function world(rows, opts = {}) {
  const L = { n: 0, moves: 20, colors: 6, jelly: opts.jelly || null, spread: !!opts.spread, goals: opts.goals || [['score', 1e9]], stars: [1, 2, 3] };
  const w = R.newWorld(L, opts.seed || 1);
  // filler: a pattern of the colours not used, laid out so it never matches by itself
  w.grid = [];
  for (let r = 0; r < 8; r++) {
    w.grid.push([]);
    for (let c = 0; c < 8; c++) {
      const ch = rows[r] ? rows[r][c] : '.';
      const type = ch === '.' || ch === undefined ? (opts.filler || [3, 4, 5, 2])[(r + 2 * c) % 4] : LET.indexOf(ch.toUpperCase());
      const t = w.mkTile(type); t.r = r; t.c = c; t.special = 0;
      w.grid[r].push(t);
    }
  }
  return w;
}
const groupsOf = w => R.findGroups(w).map(g => ({ size: g.cells.size, special: g.special, type: g.type }));
// a neutral 8x8 filler that has no match: rows of the pattern above
const blank = () => Array(8).fill('........');

test('filler pattern has no matches on its own', () => {
  const w = world(blank());
  assert.equal(R.findGroups(w).length, 0);
});

test('three in a row is a plain match', () => {
  const rows = blank(); rows[0] = 'RRR.....';
  assert.deepEqual(groupsOf(world(rows)), [{ size: 3, special: NONE, type: 0 }]);
});

test('four in a row makes a striped candy; horizontal fours clear columns (SV), vertical fours clear rows (SH)', () => {
  const h = blank(); h[0] = 'RRRR....';
  assert.equal(groupsOf(world(h))[0].special, SV);
  const v = blank(); for (let r = 0; r < 4; r++) v[r] = 'R.......';
  assert.equal(groupsOf(world(v))[0].special, SH);
});

test('a 2x2 box makes a unicorn', () => {
  const rows = blank(); rows[0] = 'RR......'; rows[1] = 'RR......';
  assert.deepEqual(groupsOf(world(rows)), [{ size: 4, special: SEEK, type: 0 }]);
});

test('an L or T of five makes a wrapped candy', () => {
  const L = blank(); L[0] = 'RRR.....'; L[1] = 'R.......'; L[2] = 'R.......';
  assert.deepEqual(groupsOf(world(L)), [{ size: 5, special: WRAP, type: 0 }]);
  const T = blank(); T[0] = 'RRR.....'; T[1] = '.R......'; T[2] = '.R......';
  assert.equal(groupsOf(world(T))[0].special, WRAP);
});

test('five in a line, or any match of six or more, makes a rainbow', () => {
  const five = blank(); five[0] = 'RRRRR...';
  assert.equal(groupsOf(world(five))[0].special, BOMB);
  const six = blank(); six[0] = 'RRRR....'; six[1] = 'R.......'; six[2] = 'R.......';
  assert.equal(groupsOf(world(six))[0].special, BOMB);
  const block = blank(); block[0] = 'RRR.....'; block[1] = 'RRR.....';
  assert.equal(groupsOf(world(block))[0].special, BOMB);
});

test('a line of three touching a box makes a unicorn, not a wrapped candy', () => {
  const rows = blank(); rows[0] = 'RRR.....'; rows[1] = 'RR......';
  assert.deepEqual(groupsOf(world(rows)), [{ size: 5, special: SEEK, type: 0 }]);
});

test('a rainbow has no colour and never matches', () => {
  const rows = blank(); rows[0] = 'RRR.....';
  const w = world(rows); w.grid[0][1].special = BOMB;
  assert.equal(R.findGroups(w).length, 0);
});

test('move finder sees line moves, box moves and special-special swaps', () => {
  const box = blank(); box[0] = 'RR......'; box[1] = 'R.R.....';  // swapping (1,1)<->(1,2) completes a box
  const wb = world(box);
  assert.ok(R.allMoves(wb).some(m => m.a.r === 1 && m.a.c === 1 && m.b.c === 2));
  const sp = world(blank()); sp.grid[5][5].special = SH; sp.grid[5][6].special = WRAP;
  assert.ok(R.allMoves(sp).some(m => m.a.r === 5 && m.a.c === 5 && m.b.c === 6));
});

test('the special appears on the swapped cell when it is part of the group', () => {
  const rows = blank(); rows[0] = 'RRRR....';
  const w = world(rows);
  const [g] = R.findGroups(w);
  assert.equal(R.pickSpawn(w, g, [{ r: 0, c: 2 }]), R.idxOf(0, 2));
});

function fire(w, r, c, special) {
  w.grid[r][c].special = special;
  const B = new R.Blast(w, 1); B.add(R.idxOf(r, c), 0, B.source(c, r, w.grid[r][c].type));
  return B.plan().clears.map(cl => R.idxOf(cl.r, cl.c));
}

test('striped candies clear their row (SH) or column (SV)', () => {
  assert.equal(fire(world(blank()), 3, 3, SH).length, 8);
  const col = fire(world(blank()), 3, 3, SV);
  assert.equal(col.length, 8); assert.ok(col.every(i => R.cOf(i) === 3));
});

test('wrapped candies clear a diamond of radius 2 (13 cells, clipped at edges)', () => {
  assert.equal(fire(world(blank()), 3, 3, WRAP).length, 13);
  assert.equal(fire(world(blank()), 0, 0, WRAP).length, 6);
});

test('a rainbow set off by a blast clears the most common colour left', () => {
  const w = world(blank(), { filler: [3, 3, 3, 4] });
  const cleared = fire(w, 0, 0, BOMB);
  // most common colour in the filler is 3 (G); every G is cleared plus the rainbow itself
  const greens = world(blank(), { filler: [3, 3, 3, 4] }).grid.flat().filter(t => t.type === 3).length;
  assert.ok(cleared.length >= greens);
});

test('a unicorn launches 3 unicorns; each clears its target and the 4 neighbours', () => {
  const w = world(blank());
  const cleared = fire(w, 7, 7, SEEK);
  assert.ok(cleared.length >= 1 + 3 && cleared.length <= 1 + 3 * 5);
});

test('unicorns go for jelly first', () => {
  const w = world(blank(), { jelly: 'corners' });
  w.jelly = w.jelly.map(row => row.map(() => 0)); w.jelly[0][7] = 2; w.goals = [{ kind: 'jelly', need: 2, left: 2 }];
  const B = new R.Blast(w, 1);
  assert.equal(R.seekTargets(B, 1)[0], R.idxOf(0, 7));
});

test('chain reaction: a striped candy that reaches a wrapped candy sets it off', () => {
  const w = world(blank());
  w.grid[4][7].special = WRAP;
  const cleared = fire(w, 4, 0, SH);
  assert.ok(cleared.length > 8);
});

function combo(sa, sb, setup) {
  const w = world(blank());
  const a = w.grid[3][3], b = w.grid[3][4]; a.special = sa; b.special = sb;
  if (setup) setup(w);
  R.swapGrid(w, { r: 3, c: 3 }, { r: 3, c: 4 });
  const cp = R.comboPlan(w, a, b);
  return { kind: cp.kind, cleared: cp.B.plan().clears.length };
}
test('combos: stripe+stripe is a cross, stripe+wrap a 3-wide cross, wrap+wrap a 5x5 blast', () => {
  assert.deepEqual(combo(SH, SV), { kind: 'cross', cleared: 15 });
  assert.deepEqual(combo(SH, WRAP), { kind: 'megaCross', cleared: 39 });
  assert.deepEqual(combo(WRAP, WRAP), { kind: 'kaboom', cleared: 25 });
});
test('combos: rainbow+rainbow clears the whole board; rainbow+candy clears that colour', () => {
  assert.deepEqual(combo(BOMB, BOMB), { kind: 'meltdown', cleared: 64 });
  const c = combo(BOMB, NONE);
  assert.equal(c.kind, 'colorClear');
});
test('combos: rainbow+special turns every candy of that colour into that special', () => {
  const w = world(blank());
  const a = w.grid[3][3], b = w.grid[3][4]; a.special = BOMB; b.special = SEEK;
  const col = b.type, before = w.grid.flat().filter(t => t !== b && t.type === col && t.special !== BOMB).length;
  const cp = R.comboPlan(w, a, b);
  assert.equal(cp.kind, 'unicornStorm');
  assert.equal(cp.conv.length, before);
  assert.ok(cp.conv.every(x => x.special === SEEK));
});
test('combos: unicorn+unicorn launches 7; unicorn+striped carries lasers', () => {
  assert.equal(combo(SEEK, SEEK).kind, 'parade');
  assert.equal(combo(SEEK, SH).kind, 'laserDrop');
  assert.equal(combo(SEEK, WRAP).kind, 'bombDrop');
});

test('jelly: each clear removes one layer and counts toward the goal', () => {
  const rows = blank(); rows[7] = 'RRR.....';
  const w = world(rows, { jelly: 'bottom', goals: [['jelly']] });
  const before = w.goals[0].left;
  E.resolveCascades(w, null, 0);
  assert.ok(w.goals[0].left <= before - 3);
  assert.equal(w.goals[0].left, w.jelly.flat().reduce((a, b) => a + b, 0));
});

test('collect goals count matched candies of that colour, never rainbows', () => {
  const rows = blank(); rows[0] = 'RRR.....';
  const w = world(rows, { goals: [['collect', 0, 10]] });
  const { B } = R.matchStep(w, R.findGroups(w), 1, null);
  for (const cl of B.plan().clears) R.applyClear(w, cl);
  assert.equal(w.goals[0].left, 7);
});

test('gravity: after a turn the board is full and every tile knows its cell', () => {
  const rows = blank(); rows[2] = 'RRR.....';
  const w = world(rows);
  E.resolveCascades(w, null, 0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const t = w.grid[r][c]; assert.ok(t); assert.equal(t.r, r); assert.equal(t.c, c); }
  assert.equal(R.findGroups(w).length, 0);
});

test('scoring: 20 per candy times the cascade number, plus bonuses for making and firing specials', () => {
  const rows = blank(); rows[0] = 'RRR.....';
  const w = world(rows);
  const { B } = R.matchStep(w, R.findGroups(w), 2, null);
  const plan = B.plan(); for (const cl of plan.clears) R.applyClear(w, cl);
  assert.equal(w.score, 3 * 20 * 2);
});

test('keys: the third key opens the chest, which places a rainbow and two specials', () => {
  const w = world(blank());
  for (let i = 0; i < 3; i++) R.applyClear(w, { tile: { type: 0, special: 0, key: true }, r: 0, c: 0, pts: 0 });
  assert.equal(w.chest.pending, 1);
  const out = R.openChest(w);
  assert.equal(out.placed.length, 3); assert.equal(out.placed[0].special, BOMB);
  assert.equal(w.chest.need, 4);
});

test('rainbow meter: every 36 candies cleared earns one free rainbow', () => {
  const w = world(blank());
  for (let i = 0; i < 36; i++) R.applyClear(w, { tile: { type: 1, special: 0 }, r: 0, c: 0, pts: 0 });
  assert.equal(w.rainbows, 1); assert.equal(w.meter, 0);
});

test('Furniture Mode dust spreads one tile on a turn that cleans none', () => {
  const w = world(blank(), { jelly: 'rug', spread: true, goals: [['jelly']] });
  const before = w.goals[0].left;
  R.startTurn(w);
  const s = R.spreadDust(w);
  assert.ok(s); assert.equal(w.goals[0].left, before + 1);
  R.startTurn(w); w.turnJelly = 1;
  assert.equal(R.spreadDust(w), null);
});

test('new boards: no ready-made matches, at least 3 moves, 2 keys (200 seeds)', () => {
  for (let s = 1; s <= 200; s++) {
    const w = R.newWorld(R.makeLevel(1 + (s % 30)), s); R.genBoard(w);
    assert.equal(R.findGroups(w).length, 0, 'seed ' + s);
    assert.ok(R.allMoves(w).length >= 3, 'seed ' + s);
    assert.equal(R.keysOnBoard(w), 2);
  }
});

test('determinism: the same seed and moves give the same game', () => {
  const run = () => {
    const w = R.newWorld(R.makeLevel(7), 1234); R.genBoard(w);
    for (let i = 0; i < 10; i++) { const m = R.allMoves(w)[0]; if (!m) break; E.doSwap(w, m.a, m.b); }
    return JSON.stringify({ g: w.grid.map(r => r.map(t => [t.type, t.special, t.key])), s: w.score, j: w.jelly });
  };
  assert.equal(run(), run());
});

test('shuffle leaves a board with no matches and at least one move', () => {
  for (let s = 1; s <= 30; s++) {
    const w = R.newWorld(R.makeLevel(5), s); R.genBoard(w);
    R.shuffleBoard(w);
    assert.equal(R.findGroups(w).length, 0); assert.ok(R.allMoves(w).length > 0);
  }
});
