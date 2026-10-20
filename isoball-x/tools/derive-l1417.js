/* L14-L17 sol 枚举器 v2：每个格子一组"摆放配方"（含支撑块/桥），枚举组合 → canPlace+simulate 找 win */
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

function* combos(n, opts) {
  if (n === 0) { yield []; return; }
  for (const v of opts[0]) for (const rest of combos(n - 1, opts.slice(1))) yield [v, ...rest];
}

// recipe: { put: [ [type, c, r], ... ]（先放的在下）, top: {type, rot} 或 null（链顶积木） }
function tryAll(idx, cells, budget, label, maxShow = 3, ignoreBudget = false) {
  const raw0 = LEVELS[idx - 1];
  const space = cells.map(c => c.recipes);
  const total = space.reduce((a, o) => a * o.length, 1);
  const winners = [];
  let placed = 0;
  for (const combo of combos(cells.length, space)) {
    // 预算
    const use = {};
    let over = false;
    for (const rec of combo) {
      for (const [p] of rec.put) { use[p] = (use[p] || 0) + 1; }
      if (rec.top) use[rec.top.type] = (use[rec.top.type] || 0) + 1;
    }
    if (!ignoreBudget) for (const k in use) if (use[k] > (budget[k] || 0)) { over = true; break; }
    if (over) continue;
    const raw = JSON.parse(JSON.stringify(raw0));
    const L = SIM.parseLevel(raw);
    const pm = new Map();
    let fail = false;
    for (let i = 0; i < cells.length && !fail; i++) {
      const { c, r } = cells[i];
      const rec = combo[i];
      for (const [p] of rec.put) {
        const st = SIM.canPlace(L, pm, p, c, r);
        if (!st.ok) { fail = true; break; }
        const pc = { type: p, rot: 0 };
        if (st.on) { pc.on = true; pc.zAbs = st.z; pc.under = pm.get(c + ',' + r); }
        else if (st.under) pc.under = st.under;
        if (p === 'bridge' && st.deck !== undefined) pc.deck = st.deck;
        pm.set(c + ',' + r, pc);
      }
      if (fail) break;
      if (rec.top) {
        const st = SIM.canPlace(L, pm, rec.top.type, c, r);
        if (!st.ok) { fail = true; break; }
        const pc = { type: rec.top.type, rot: rec.top.rot || 0 };
        if (st.on) { pc.on = true; pc.zAbs = st.z; pc.under = pm.get(c + ',' + r); }
        else if (st.under) pc.under = st.under;
        pm.set(c + ',' + r, pc);
      }
    }
    if (fail) continue;
    placed++;
    try {
      const R = SIM.simulate(L, pm);
      if (R.result === 'win') winners.push({ combo, time: R.time });
    } catch (e) { /* skip */ }
  }
  console.log(`${label}: 组合${total} 成功摆放${placed} win=${winners.length}`);
  for (const w of winners.slice(0, maxShow)) {
    const use = {};
    for (const rec of w.combo) { for (const [p] of rec.put) use[p] = (use[p] || 0) + 1; if (rec.top) use[rec.top.type] = (use[rec.top.type] || 0) + 1; }
    console.log('  win 用量:', JSON.stringify(use), `t=${w.time.toFixed(1)}s`);
    console.log('    full:', JSON.stringify(w.combo.map(r => ({ put: r.put.map(p => p[0] + '@' + p[1] + ',' + p[2]), top: r.top }))));
  }
  return winners;
}

// ============ L14 ============
// 路径: (4,0)↓坡 (4,1) (4,2)[箭头←] (3,2) (2,2) → 洞(0,2)
tryAll(14, [
  { name: 'A40', c: 4, r: 0, recipes: [
    { put: [['block2', 4, 0], ['block1', 4, 0]], top: { type: 'ramp1', rot: 3 } },
    { put: [['block2', 4, 0]], top: { type: 'ramp2', rot: 3 } },
  ]},
  { name: 'A41', c: 4, r: 1, recipes: [
    { put: [['bridge', 4, 1]], top: null },
    { put: [['bridge', 4, 1]], top: { type: 'ramp1', rot: 3 } },
  ]},
  { name: 'A42', c: 4, r: 2, recipes: [
    { put: [['bridge', 4, 2]], top: { type: 'arrow', rot: 2 } },
    { put: [['bridge', 4, 2], ['block1', 4, 2]], top: { type: 'arrow', rot: 2 } },
  ]},
  { name: 'A32', c: 3, r: 2, recipes: [
    { put: [['bridge', 3, 2]], top: null },
    { put: [['bridge', 3, 2]], top: { type: 'ramp1', rot: 0 } },
    { put: [['bridge', 3, 2]], top: { type: 'ramp2', rot: 0 } },
    { put: [], top: null },
  ]},
  { name: 'A22', c: 2, r: 2, recipes: [
    { put: [], top: { type: 'ramp1', rot: 0 } },
    { put: [['block1', 2, 2]], top: { type: 'ramp1', rot: 0 } },
    { put: [], top: { type: 'ramp2', rot: 0 } },
    { put: [], top: null },
    { put: [], top: { type: 'ramp1', rot: 2 } },
    { put: [], top: { type: 'ramp2', rot: 2 } },
  ]},
], { block1: 1, ramp1: 2, block2: 1, ramp2: 1, arrow: 1, bridge: 3 }, 'L14', 3, true);
