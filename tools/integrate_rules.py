# One-off migration: point index.html's game logic at the shared rules engine (src/rules.js).
# Kept in the repo as a record of how the game was split; tools/build.js does the ongoing work.
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(p).read()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:120])
    s = s.replace(old, new)

def cut(start, end_exclusive, new):
    """Replace from the line starting with `start` up to (not including) the line starting with `end_exclusive`."""
    global s
    a = s.index(start); b = s.index(end_exclusive, a)
    s = s[:a] + new + s[b:]

# ---- the rules engine is inlined here by tools/build.js
rep("<script>\n(() => {\n'use strict';", "<script>\n/* @rules:begin */\n/* @rules:end */\n</script>\n<script>\n(() => {\n'use strict';")

# ---- constants come from the rules
rep("""const COLS = 8, ROWS = 8;
const NONE = 0, SH = 1, SV = 2, WRAP = 3, BOMB = 4, SEEK = 5;""", """const R = SugarRules;
const { COLS, ROWS, NONE, SH, SV, WRAP, BOMB, SEEK, METER_MAX, HOME_FIRST, HOME_LAST, LEVEL_COUNT } = R;""")
rep("""const CREATE_BONUS = [0, 120, 120, 200, 500, 150];
const FIRE_BONUS = [0, 100, 100, 180, 300, 150];
const METER_MAX = 36;         // candies cleared to earn a free rainbow
const KEY_CHANCE = .07;       // chance a new candy carries a key (while fewer than 3 are on the board)
""", "")
rep("const PRICE = { hammer: 15, swap: 15, rainbow: 25, swarm: 30, moves: 20, party: 60 };", "const PRICE = R.ECON.price;")
rep("const HOME_FIRST = 101, HOME_LAST = 130;\n", "")
cut("function inTri(px, py", "/* ---------- save data ---------- */", "\n")
rep("let save = { unlocked: 1, unlockedHome: HOME_FIRST, gold: 50, stars: {}, best: {}, sfx: true, music: true, boosters: { hammer: 3, swap: 3, rainbow: 2, swarm: 2, moves: 2, party: 1 } };",
    "let save = { unlocked: 1, unlockedHome: HOME_FIRST, gold: R.ECON.startGold, stars: {}, best: {}, sfx: true, music: true, boosters: { ...R.ECON.startBoosters } };")
cut("/* ---------- levels ---------- */", "/* ---------- audio: everything synthesised ---------- */",
    "/* ---------- levels ---------- */\n// level data lives in src/levels.json and is inlined with the rules\nconst makeLevel = n => R.makeLevel(n);\n\n")

# ---- world state: the rules world *is* the game state
rep("""const colorOf = t => t && t.special !== BOMB ? t.type : -1;
const idxOf = (r, c) => r * COLS + c;
const tileAtIdx = i => grid[(i / COLS) | 0][i % COLS];
const randType = () => randi(L.colors);
""", "")

# ---- matching, blasts, turn flow and pops: replaced by thin async wrappers around the rules
cut("/* ---------- matching ---------- */", "/* ---------- effects ---------- */", r"""/* ---------- turn flow: the rules decide, this code animates ---------- */
// Visual effects the rules report while planning a blast, scheduled at their time offsets.
function onRuleFx(name, d, t) {
  after(t, () => {
    switch (name) {
      case 'beam': fxBeam(d.r, d.c, d.horiz, d.type); break;
      case 'stripe': SFX.zap(); shake(4); buzz(12); break;
      case 'wrap': fxExplosion(d.r, d.c, d.type, 2.6); SFX.boom(); shake(11); buzz(30); hitStop(.07); break;
      case 'bomb': SFX.bomb(); shake(6); flash(.25); fxExplosion(d.r, d.c, -1, 1.4); hitStop(.06); break;
      case 'bolt': fxBolt(d.c1, d.r1, d.c2, d.r2, d.type); break;
      case 'unicornLaunch': SFX.unicorn(); SFX.launch(); buzz(14); break;
      case 'unicorn': missiles.push({ x0: sx(d.c), y0: sy(d.r), tr: d.tr, tc: d.tc, t: 0, dur: d.dur, type: d.type,
        c1: { x: rand(.08, .92) * W, y: rand(.06, .5) * H }, c2: { x: rand(.08, .92) * W, y: rand(.06, .45) * H } }); break;
      case 'unicornHit':
        if (d.carry === WRAP) { fxExplosion(d.r, d.c, d.type, 2.4); SFX.boom(); shake(9); }
        else if (d.carry === SH || d.carry === SV) { SFX.zap(); shake(4); }
        else { fxExplosion(d.r, d.c, d.type, 1.3); SFX.hit(); shake(3); }
        break;
    }
  });
}
const canPlay = () => screen === 'game' && !state.busy && !state.over && !paused && $('#modalBack').hidden && !tutorialBlocks();
// Plan a blast (the rules take the tiles off the board), then animate each pop at its time.
async function runBlast(B, onPlanned) {
  const p = B.plan();
  if (onPlanned) onPlanned(p);
  for (const cl of p.clears) {
    const tile = cl.tile;
    tile.mergeTo = cl.mergeTo; tile.popDelay = cl.t; tile.dying = true; tile.popR = cl.r; tile.popC = cl.c; tile.pts = cl.pts; tile.clear = cl;
    dying.push(tile);
  }
  for (const s of p.sources) if (s.pts > 0) after(s.t + .06, () => popup(s.x, s.y, '+' + fmt(s.pts), s.type));
  await wait(p.maxT + TIMING.afterBlast);
}
async function attemptSwap(a, b, free = false) {
  if (!canPlay()) return;
  if (b.r < 0 || b.r >= ROWS || b.c < 0 || b.c >= COLS) return;
  const ta = grid[a.r][a.c], tb = grid[b.r][b.c]; if (!ta || !tb) return;
  if (!tutorialAllows(a, b)) { ta.bsv -= 3; SFX.bad(); return; }
  state.busy = true; hint = null; sel = null; idleT = 0;
  if (free) spendBooster('swap');
  R.startTurn(state);
  SFX.swap(); mark('swap');
  R.swapGrid(state, a, b);
  await Promise.all([tween(ta, { x: b.c, y: b.r }, TIMING.swap, Ease.inOutQuad), tween(tb, { x: a.c, y: a.r }, TIMING.swap, Ease.inOutQuad)]);
  const combo = R.isComboSwap(ta, tb);
  if (free && !combo && !R.findGroups(state).length) { ta.bsv += 4; tb.bsv += 4; await afterTurn(); return; }
  if (!combo && !R.findGroups(state).length) {
    SFX.bad(); R.swapGrid(state, a, b);
    await Promise.all([tween(ta, { x: a.c, y: a.r }, TIMING.bounce, Ease.outBack), tween(tb, { x: b.c, y: b.r }, TIMING.bounce, Ease.outBack)]);
    ta.bsv -= 3; tb.bsv -= 3; shake(2);
    state.busy = false; idleT = 0; return;
  }
  if (!free) { state.moves--; updateHUD(); }
  popSeq = 0;
  if (combo) { await comboSwap(ta, tb); await collapse(); await resolveBoard(null, 1); }
  else await resolveBoard([a, b], 0);
  await afterTurn();
  tutorialAfterMove();
}
async function resolveBoard(swapCells, cascade) {
  for (let guard = 0; guard < 60; guard++) {
    const groups = R.findGroups(state); if (!groups.length) break;
    cascade++;
    if (cascade >= 2) { comboText(cascade); state.stats.cascades++; }
    await matchStep(groups, cascade, swapCells); swapCells = null;
    await collapse();
  }
}
async function matchStep(groups, cascade, swapCells) {
  buzz(Math.min(6 + cascade * 4, 30)); mark('match');
  const { B, creates } = R.matchStep(state, groups, cascade, swapCells);
  for (const cr of creates) after(TIMING.createAt, () => {
    const ev = R.applyCreate(state, cr), t = cr.tile;
    t.bsv += 7; fxCreate(t); SFX.create(cr.special); if (cr.special === BOMB) { shake(5); flash(.2); }
    if (ev.jelly) { jwob[t.r][t.c] = 1; const g = state.goals.find(g => g.kind === 'jelly'); if (g) { g.shown--; updateGoals(); } }
  });
  await runBlast(B);
  R.endCreates(creates);
}
const COMBO_TEXT = { meltdown: 'Total Meltdown!', wrapStorm: 'Wrapped Frenzy!', unicornStorm: 'Unicorn Storm!', stripeStorm: 'Stripe Storm!', parade: 'Unicorn Parade!', laserDrop: 'Laser Drop!', bombDrop: 'Bomb Drop!', kaboom: 'Kaboom!', megaCross: 'Mega Cross!' };
async function comboSwap(ta, tb) {
  const cp = R.comboPlan(state, ta, tb), k = cp.kind, r0 = cp.r, c0 = cp.c;
  if (k === 'meltdown') { SFX.mega(); flash(.7); shake(18); buzz(80); fxExplosion(r0, c0, -1, 6); hitStop(.12); }
  else if (k === 'colorClear' || cp.conv.length || k.endsWith('Storm')) { SFX.bomb(); flash(.3); shake(6); hitStop(.08); }
  else if (k === 'parade') { shake(6); flash(.2); }
  else if (k === 'laserDrop' || k === 'bombDrop') shake(6);
  else if (k === 'kaboom') { SFX.boom(); after(.15, () => SFX.boom()); shake(16); flash(.35); buzz(60); fxExplosion(r0, c0, ta.type, 4.2); hitStop(.1); }
  else { const wide = k === 'megaCross'; SFX.zap(); after(.06, () => SFX.zap()); shake(wide ? 12 : 7); buzz(30); if (wide) SFX.boom(); hitStop(wide ? .08 : .05); }
  if (COMBO_TEXT[k]) comboText(k === 'megaCross' ? 4 : k === 'meltdown' ? 6 : 5, COMBO_TEXT[k]);
  // rainbow + special: show each candy turning into that special as the bolts reach it
  await runBlast(cp.B, () => cp.conv.forEach((cv, i) => {
    cv.tile.shownSpecial = 0;
    after(i * .04, () => { fxBolt(cp.bomb.c, cp.bomb.r, cv.tile.c, cv.tile.r, cp.color); cv.tile.shownSpecial = undefined; cv.tile.bsv += 6; SFX.ding(i); });
  }));
}
function collapse() {
  const { moved, spawned } = R.collapse(state);
  for (const t of moved) { t.falling = true; t.delay = t.c * TIMING.columnStagger; }
  for (const t of spawned) { t.x = t.c; t.y = t.dropFrom; t.falling = true; t.delay = t.c * TIMING.columnStagger; }
  if (!moved.length && !spawned.length) return Promise.resolve();
  return waitFor(() => !anyFalling());
}
async function afterTurn() {
  if (!R.goalsMet(state) && state.moves > 0 && (state.chest.pending || state.rainbows)) {
    await waitFor(() => !flyers.length);
    while (state.chest.pending > 0) await openChest();
    while (state.rainbows > 0) await dropRainbow();
  }
  const sp = R.spreadDust(state); if (sp) await showSpread(sp);
  mark('settled');
  if (R.goalsMet(state)) { await levelWon(); return; }
  if (state.moves <= 0) { state.over = true; await waitFor(() => !flyers.length); await wait(.5); levelLost(); return; }
  if (!R.allMoves(state).length) await shuffle();
  state.busy = false; idleT = 0; mark('ready');
}
async function shuffle() {
  bigText = { text: 'Shuffle!', t: 0, dur: 1.2, size: 1 };
  hint = null; sel = null;
  SFX.whoosh();
  const tiles = R.shuffleBoard(state);
  await Promise.all(tiles.map((t, i) => tween(t, { x: t.c, y: t.r }, .55, Ease.outBack, i * .006)));
}
// a spark flies from a HUD element to a candy that the rules have already made special
function sparkTo(el, t, special, delay = 0, onLand) {
  const from = elCenter(el);
  t.shownSpecial = 0;
  flyers.push({ spark: true, x0: from.x, y0: from.y, tx: () => sx(t.x), ty: () => sy(t.y), t: -delay, dur: .55, type: t.type,
    done: () => { t.shownSpecial = undefined; t.bsv += 8; fxCreate(t); SFX.create(special); burst(sx(t.x), sy(t.y), special === BOMB ? -1 : t.type, .6); onLand && onLand(); } });
}
async function dropRainbow() {
  const t = R.dropRainbow(state); if (!t) return;
  bigText = { text: 'Free Rainbow!', t: 0, dur: 1.2, size: .95 };
  SFX.rainbow(); bumpEl($('#meter'));
  sparkTo($('#meter'), t, BOMB, 0, () => { shake(5); flash(.2); });
  await waitFor(() => !flyers.length); updateMeter();
}
async function openChest() {
  const res = R.openChest(state); if (!res) return;
  const ch = state.chest, el = $('#chest');
  ch.shownHave = ch.have; updateChest();
  bumpEl(el); SFX.chest(); buzz(40);
  bigText = { text: 'Chest Opened!', t: 0, dur: 1.4, size: 1 };
  const c = elCenter(el); burst(c.x, c.y, 2, 1.8); burst(c.x, c.y, -1, 1.4);
  res.placed.forEach((p, i) => sparkTo(el, p.tile, p.special, .25 + i * .15));
  grantBooster(res.prize, el);
  addGold(res.gold, el);
  await waitFor(() => !flyers.length); await wait(.2);
}
// Furniture Mode: dust creeps onto a clean tile when a turn cleans none
let spreadToldOnce = false;
async function showSpread(sp) {
  jwob[sp.r][sp.c] = 1;
  const g = state.goals.find(g => g.kind === 'jelly'); if (g) { g.shown++; updateGoals(); bumpEl(g.el); }
  const x = sx(sp.c), y = sy(sp.r), cs = BR.cs;
  for (let i = 0; i < (REDUCED ? 3 : 10); i++) { const a = rand(0, Math.PI * 2), v = rand(.5, 1.6) * cs; particles.push({ k: 'dot', x: sx(sp.fromC), y: sy(sp.fromR), vx: (x - sx(sp.fromC)) * 2.5 + Math.cos(a) * v, vy: (y - sy(sp.fromR)) * 2.5 + Math.sin(a) * v, g: 0, drag: 3, life: 0, max: rand(.4, .7), sz: rand(.08, .14) * cs, rot: 0, vr: 0, col: 'rgba(150,130,115,.8)' }); }
  SFX.whoosh();
  if (!spreadToldOnce) { spreadToldOnce = true; bigText = { text: 'The dust spreads!', t: 0, dur: 1.4, size: .85 }; }
  await wait(.35);
}
async function levelWon() {
  state.over = true; state.busy = true;
  await wait(.35);
  if (state.moves > 0) await sugarRush();
  await waitFor(() => !flyers.length);
  await wait(.5);
  showWin();
}
async function sugarRush() {
  bigText = { text: 'Sugar Rush!', t: 0, dur: 1.6, size: 1.15 };
  SFX.combo(6); await wait(1.1);
  const mv = $('#movesBadge').getBoundingClientRect();
  let i = 0;
  for (let res; (res = R.rushConvert(state));) {
    const t = res.tile, n = i++;
    updateHUD();
    t.shownSpecial = 0;
    flyers.push({ spark: true, x0: mv.left + mv.width / 2, y0: mv.top + mv.height / 2, tx: () => sx(t.x), ty: () => sy(t.y), t: 0, dur: .45, type: t.type,
      done: () => { t.shownSpecial = undefined; t.bsv += 7; SFX.ding(n); burst(sx(t.x), sy(t.y), t.type, .5); } });
    await wait(.11);
  }
  await waitFor(() => !flyers.length); await wait(.35);
  for (let guard = 0; guard < 40; guard++) {
    const B = R.rushDetonate(state); if (!B) break;
    popSeq = 0;
    await runBlast(B); await collapse(); await resolveBoard(null, 1);
  }
}

/* ---------- pops & goals ---------- */
function onTilePop(t) {
  const ev = R.applyClear(state, t.clear);
  if (!state.over) {
    updateMeter();
    if (ev.key) {
      const ch = state.chest;
      flyers.push({ key: true, x0: sx(t.x), y0: sy(t.y), tx: () => elCenter($('#chestImg')).x, ty: () => elCenter($('#chestImg')).y, t: 0, dur: .6, type: t.type,
        done: () => { ch.shownHave = Math.min(ch.shownHave + 1, ch.have); updateChest(); bumpEl($('#chest')); SFX.key(); } });
    }
  }
  SFX.pop(popSeq++); mark('pop');
  const px = sx(t.x), py = sy(t.y);
  if (!t.mergeTo) { shatter(px, py, t.special === BOMB ? -1 : t.type, t.special ? 1.25 : 1); burst(px, py, t.special === BOMB ? -1 : t.type, t.special ? .9 : .45); }
  if (ev.jelly) {
    jwob[t.popR][t.popC] = 1; jellySplash(px, py);
    const g = state.goals.find(g => g.kind === 'jelly'); if (g) { g.shown--; updateGoals(); }
  }
  if (ev.collect) {
    const g = ev.collect;
    if (flyers.length > 36) { g.shown--; updateGoals(); }
    else flyers.push({ x0: px, y0: py, tx: () => elCenter(g.iconEl).x, ty: () => elCenter(g.iconEl).y, t: -rand(0, .06), dur: rand(.5, .65), type: t.type,
      done: () => { g.shown--; updateGoals(); bumpEl(g.el); SFX.collect(); } });
  }
}
function elCenter(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function bumpEl(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

""")

# ---- the idle hint and the special-sprite lookup use the rules / visual overrides
rep("    if (idleT > 5 && !hint) { const m = allMoves();", "    if (idleT > 5 && !hint) { const m = R.allMoves(state);")
rep("  const spr = t.special === -1 ? SPR[t.type * 4] : spriteOf(t);", "  const spr = t.shownSpecial === 0 ? SPR[t.type * 4] : spriteOf(t);")
rep("  if (t.special > 0 || (hint && (t === hint.a || t === hint.b)) || t === selT) {\n    const g = t.special === BOMB || t.special <= 0 ? GLOW_W : GLOW[t.type];",
    "  const vis = t.shownSpecial === 0 ? 0 : t.special;\n  if (vis > 0 || (hint && (t === hint.a || t === hint.b)) || t === selT) {\n    const g = vis === BOMB || vis <= 0 ? GLOW_W : GLOW[t.type];")
rep("    gx.globalAlpha = t.alpha * (t.special > 0 ? .4 + .18 * Math.sin(now * 4 + t.id) : .35);\n    const gs = cs * (t.special === BOMB ? 1.9 : 1.55);",
    "    gx.globalAlpha = t.alpha * (vis > 0 ? .4 + .18 * Math.sin(now * 4 + t.id) : .35);\n    const gs = cs * (vis === BOMB ? 1.9 : 1.55);")
rep("  if (t.special === BOMB) gx.rotate(Math.sin(now * 2 + t.id) * .12);", "  if (vis === BOMB) gx.rotate(Math.sin(now * 2 + t.id) * .12);")

# ---- economy numbers from the rules
rep("const reviveCost = () => 10 * (state.revives + 1);", "const reviveCost = () => R.reviveCost(state.revives + 1);")
rep("  for (let i = 0; i < 5; i++) flyers.push({ spark: true, x0: from.x, y0: from.y, tx: () => m.x, ty: () => m.y, t: -i * .1, dur: .55, type: 2,\n    done: () => { state.moves++;",
    "  for (let i = 0; i < R.ECON.reviveMoves; i++) flyers.push({ spark: true, x0: from.x, y0: from.y, tx: () => m.x, ty: () => m.y, t: -i * .1, dur: .55, type: 2,\n    done: () => { state.moves++;")
rep("function randomBooster() { const pool = ['hammer', 'hammer', 'swap', 'swap', 'rainbow', 'swarm', 'swarm', 'moves', 'party']; return pool[randi(pool.length)]; }",
    "function randomBooster() { const pool = R.ECON.boosterPool; return pool[randi(pool.length)]; }")
rep("  const goldBefore = save.gold, reward = 5 + stars * 5 + (prevBest ? 0 : 10);", "  const goldBefore = save.gold, reward = R.winGold(stars, !prevBest);")

# ---- boosters: the rules plan, the game animates
cut("async function settle() {", "/* ---------- screens & modals ---------- */", r"""async function settle() { popSeq = 0; await collapse(); await resolveBoard(null, 1); await afterTurn(); }
async function useHammer(cell) {
  const t = grid[cell.r][cell.c]; if (!t) return;
  spendBooster('hammer'); state.busy = true; sel = null; R.startTurn(state);
  swings.push({ r: cell.r, c: cell.c, t: 0, dur: .5 }); SFX.whoosh();
  await wait(.2);
  SFX.hammer(); shake(10); buzz(35); hitStop(.08); fxExplosion(cell.r, cell.c, t.special === BOMB ? -1 : t.type, 1.4);
  await runBlast(R.hammerPlan(state, cell.r, cell.c)); await settle();
}
async function useRainbowDrop(cell) {
  const t = grid[cell.r][cell.c]; if (!t) return;
  spendBooster('rainbow'); state.busy = true; sel = null; R.startTurn(state); SFX.rainbow();
  R.rainbowDropAt(state, cell.r, cell.c);
  sparkTo($('#b-rainbow'), t, BOMB, 0, () => { shake(5); flash(.2); });
  await waitFor(() => !flyers.length); await afterTurn();
}
async function useSwarm() {
  spendBooster('swarm'); state.busy = true; R.startTurn(state);
  comboText(5, 'Unicorn Stampede!'); flash(.15);
  await runBlast(R.swarmPlan(state)); await settle();
}
async function useParty() {
  spendBooster('party'); state.busy = true; R.startTurn(state);
  comboText(6, 'Sugar Party!'); SFX.mega(); confetti(REDUCED ? 30 : 120); shake(14); flash(.5); buzz(80);
  const { B, placed } = R.partyPlan(state);
  await runBlast(B, () => placed.forEach((p, i) => { p.tile.shownSpecial = 0; after(.05 + i * .05, () => { p.tile.shownSpecial = undefined; p.tile.bsv += 7; fxCreate(p.tile); SFX.ding(i); }); }));
  await settle();
}
function useMoves() {
  spendBooster('moves');
  const mv = $('#movesBadge'), b = $('#b-moves'), a = elCenter(b), m = elCenter(mv);
  for (let i = 0; i < R.ECON.reviveMoves; i++) flyers.push({ spark: true, x0: a.x, y0: a.y, tx: () => m.x, ty: () => m.y, t: -i * .08, dur: .5, type: 2,
    done: () => { state.moves++; updateHUD(); bumpEl(mv); SFX.ding(i + 3); } });
}

""")

# ---- level lifecycle: a seeded rules world per attempt
cut("function setupLevel(n) {", "async function beginLevel() {", r"""function setupLevel(n, seed) {
  resetWorld();
  L = makeLevel(n);
  THEME = L.home ? 'home' : 'candy'; mapWorld = THEME; spriteKey = ''; spreadToldOnce = false;
  // one seeded generator per attempt drives every rule decision; the same seed and moves replay the game
  const w = R.newWorld(L, seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed, mkTile);
  state = Object.assign(w, { shown: 0, busy: true, starsLit: 0, revives: 0 });
  state.chest.shownHave = 0;
  state.goals.forEach(g => { g.shown = g.left; });
  state.fx = onRuleFx;
  jelly = state.jelly; jwob = jelly.map(row => row.map(() => 0));
  shownScoreText = '';
}
function startLevel(n, seed) {
  setupLevel(n, seed);
  R.genBoard(state); grid = state.grid;
  grid.forEach(row => row.forEach(t => { t.x = t.c; t.y = t.r - ROWS - .6; }));
  showScreen('game');
  buildSprites(); buildStarbar(); buildGoals(); updateHUD(); updateMeter(); updateChest(); updateBoosters(); updateGold();
  openIntro();
}
""")

# ---- hot restore and boot
rep("      grid = data.board.map((row, r) => row.map((v, c) => { const t = mkTile(v ? v[0] : randType(), v ? v[1] : 0); t.key = !!(v && v[2]); t.r = r; t.c = c; t.x = c; t.y = r; return t; }));\n      if (data.jelly) jelly = data.jelly;",
    "      grid = state.grid = data.board.map((row, r) => row.map((v, c) => { const t = mkTile(v ? v[0] : randi(L.colors), v ? v[1] : 0); t.key = !!(v && v[2]); t.r = r; t.c = c; t.x = c; t.y = r; return t; }));\n      if (data.jelly) { jelly = state.jelly = data.jelly; jwob = jelly.map(row => row.map(() => 0)); }")
rep("if (typeof save.gold !== 'number') save.gold = 50;", "if (typeof save.gold !== 'number') save.gold = R.ECON.startGold;")
rep("if (!save.boosters || typeof save.boosters !== 'object') save.boosters = { hammer: 3, swap: 3, rainbow: 2, swarm: 2, moves: 2, party: 1 };",
    "if (!save.boosters || typeof save.boosters !== 'object') save.boosters = { ...R.ECON.startBoosters };")
rep("window.__sugar = { moves: () => allMoves(), swap: (a, b) => attemptSwap(a, b), state: () => ({ ...state, goals: state.goals.map(g => ({ kind: g.kind, left: g.left, need: g.need })) }), canPlay: () => canPlay(), start: n => startLevel(n),",
    "window.__sugar = { moves: () => R.allMoves(state), swap: (a, b) => attemptSwap(a, b), state: () => ({ score: state.score, moves: state.moves, over: state.over, busy: state.busy, meter: state.meter, rainbows: state.rainbows, chest: { ...state.chest }, revives: state.revives, seed: state.seed, goals: state.goals.map(g => ({ kind: g.kind, left: g.left, need: g.need })) }), snapshot: () => ({ g: grid.map(r => r.map(t => t ? [t.type, t.special, t.key ? 1 : 0] : null)), j: jelly.map(r => r.slice()), score: state.score, moves: state.moves, chest: { need: state.chest.need, have: state.chest.have }, meter: state.meter, goals: state.goals.map(g => g.left) }), canPlay: () => canPlay(), start: (n, seed) => startLevel(n, seed), marks: () => marks,")

open(p, 'w').write(s)
print('ok')
