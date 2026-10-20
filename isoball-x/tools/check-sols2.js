const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

function run(idx, sol, label) {
  const raw = JSON.parse(JSON.stringify(LEVELS[idx - 1]));
  const L = SIM.parseLevel(raw);
  try {
    const pm = SIM.applySolution(L, sol);
    const R = SIM.simulate(L, pm);
    console.log(label + ': ' + R.result + ' [' + R.events.map(e => e.type + (e.cell ? '@' + e.cell.c + ',' + e.cell.r : '') + (e.reason ? ':' + e.reason : '')).join(',') + ']');
    return R.result === 'win';
  } catch (e) {
    console.log(label + ': 放置失败 — ' + e.message);
    return false;
  }
}

// ---- L15：只改最后一个斜坡朝向 ----
const base15 = [
  { p: 'block1', c: 1, r: 1 },
  { p: 'ramp1', c: 1, r: 1, rot: 3 },
  { p: 'bridge', c: 1, r: 0 },
  { p: 'ramp1', c: 1, r: 0, rot: 3 },
  { p: 'block1', c: 1, r: 2 },
  { p: 'arrow', c: 1, r: 2, rot: 0 },
  { p: 'bridge', c: 2, r: 2 },
  { p: 'block1', c: 3, r: 2 },
  { p: 'arrow', c: 3, r: 2, rot: 1 },
  { p: 'block1', c: 3, r: 3 },
  { p: 'bridge', c: 3, r: 4 },
  { p: 'block1', c: 3, r: 5 },
  { p: 'arrow', c: 3, r: 5, rot: 0 },
];
for (const rot of [0, 1, 2, 3]) {
  run(15, base15.concat([{ p: 'ramp1', c: 4, r: 5, rot }]), 'L15 ramp1(4,5) rot=' + rot);
}

// ---- L14：围绕用户骨架枚举 (3,2) 桥/斜坡 + (2,2) 斜坡/block1 的组合 ----
function attempt(combo) {
  const sol = [
    { p: 'block2', c: 4, r: 0 },
    { p: 'ramp2', c: 4, r: 0, rot: 3 },
    { p: 'bridge', c: 4, r: 1 },
    { p: 'bridge', c: 4, r: 2 },
    { p: 'arrow', c: 4, r: 2, rot: 2 },
  ];
  if (combo.b1at22) sol.push({ p: 'block1', c: 2, r: 2 });
  if (combo.b32) sol.push({ p: 'bridge', c: 3, r: 2 });
  if (combo.r22 !== null) sol.push({ p: 'ramp1', c: 2, r: 2, rot: combo.r22 });
  if (combo.r32 !== null) sol.push({ p: 'ramp1', c: 3, r: 2, rot: combo.r32 });
  const raw = JSON.parse(JSON.stringify(LEVELS[13]));
  const L = SIM.parseLevel(raw);
  try {
    const pm = SIM.applySolution(L, sol);
    const R = SIM.simulate(L, pm);
    return { win: R.result === 'win', res: R.result, ev: R.events.map(e => e.type).join(','), sol };
  } catch (e) {
    return { win: false, res: 'place-fail', ev: e.message, sol };
  }
}
const wins = [];
const seen = new Set();
for (const b1at22 of [false, true]) {
  for (const b32 of [false, true]) {
    for (const r22 of [null, 0, 1, 2, 3]) {
      for (const r32 of [null, 0, 1, 2, 3]) {
        const combo = { b1at22, b32, r22, r32 };
        // 库存：block1×1、ramp1×2
        const ramps = (r22 !== null ? 1 : 0) + (r32 !== null ? 1 : 0);
        if (ramps > 2) continue;
        const key = JSON.stringify(combo);
        if (seen.has(key)) continue;
        seen.add(key);
        const r = attempt(combo);
        if (r.win) { wins.push({ combo, sol: r.sol }); console.log('L14 WIN:', key, '[' + r.ev + ']'); }
      }
    }
  }
}
if (!wins.length) console.log('L14: 骨架内无 win 组合');
