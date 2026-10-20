const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

function run(idx, sol, label) {
  const raw = JSON.parse(JSON.stringify(LEVELS[idx - 1]));
  const L = SIM.parseLevel(raw);
  try {
    const pm = SIM.applySolution(L, sol);
    const R = SIM.simulate(L, pm);
    console.log(label + ': ' + R.result + ' [' + R.events.map(e => e.type).join(',') + ']');
    const decks = [];
    for (const [k, p] of pm) if (p.type === 'bridge') decks.push(k + '=' + p.deck);
    console.log('  桥面: ' + decks.join(' '));
    return R.result === 'win';
  } catch (e) {
    console.log(label + ': 放置失败 — ' + e.message);
    return false;
  }
}

// ---- L18：4 箭头（东/南/西/北），8×ramp1 + ramp2@(4,5)，双塔 (5,2)=H4 (5,5)=H2，(2,2) 塔 H6 ----
// 放置顺序=支撑链：从 (5,5) 塔出发沿斜坡背面爬升
run(18, [
  { p: 'block2', c: 5, r: 5 },
  { p: 'arrow', c: 5, r: 5, rot: 2, on: true },
  { p: 'bridge', c: 5, r: 4 },
  { p: 'ramp1', c: 5, r: 4, rot: 3, on: true },
  { p: 'bridge', c: 5, r: 3 },
  { p: 'ramp1', c: 5, r: 3, rot: 3, on: true },
  { p: 'block2', c: 5, r: 2 },
  { p: 'block2', c: 5, r: 2, on: true },
  { p: 'arrow', c: 5, r: 2, rot: 1, on: true },
  { p: 'bridge', c: 4, r: 2 },
  { p: 'ramp1', c: 4, r: 2, rot: 2, on: true },
  { p: 'bridge', c: 3, r: 2 },
  { p: 'ramp1', c: 3, r: 2, rot: 2, on: true },
  { p: 'block2', c: 2, r: 2 },
  { p: 'block2', c: 2, r: 2, on: true },
  { p: 'block2', c: 2, r: 2, on: true },
  { p: 'ramp1', c: 2, r: 2, rot: 2, on: true },
  { p: 'bridge', c: 1, r: 2 },
  { p: 'ramp1', c: 1, r: 2, rot: 2, on: true },
  { p: 'bridge', c: 0, r: 2 },
  { p: 'arrow', c: 0, r: 2, rot: 0, on: true },
  { p: 'bridge', c: 0, r: 1 },
  { p: 'ramp1', c: 0, r: 1, rot: 3, on: true },
  { p: 'bridge', c: 0, r: 0 },
  { p: 'ramp1', c: 0, r: 0, rot: 3, on: true },
  { p: 'ramp2', c: 4, r: 5, rot: 0 },
  { p: 'arrow', c: 0, r: 5, rot: 3 },
], 'L18');

// ---- L19：无方块，9 桥全靠 ramp 背面锚定，唯一地面锚 = ramp1(1,5) ----
run(19, [
  { p: 'ramp1', c: 1, r: 5, rot: 0 },
  { p: 'bridge', c: 2, r: 5 },
  { p: 'bridge', c: 3, r: 5 },
  { p: 'ramp1', c: 3, r: 5, rot: 0, on: true },
  { p: 'bridge', c: 4, r: 5 },
  { p: 'bridge', c: 5, r: 5 },
  { p: 'arrow', c: 5, r: 5, rot: 2, on: true },
  { p: 'bridge', c: 5, r: 4 },
  { p: 'ramp2', c: 5, r: 4, rot: 3, on: true },
  { p: 'bridge', c: 5, r: 3 },
  { p: 'ramp2', c: 5, r: 3, rot: 3, on: true },
  { p: 'bridge', c: 5, r: 2 },
  { p: 'bridge', c: 5, r: 1 },
  { p: 'ramp2', c: 5, r: 1, rot: 3, on: true },
  { p: 'bridge', c: 5, r: 0 },
  { p: 'ramp2', c: 5, r: 0, rot: 3, on: true },
], 'L19');
