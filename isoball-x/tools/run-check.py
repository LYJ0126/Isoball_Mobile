# -*- coding: utf-8 -*-
# 校验用户手打 sol（L14/15/17）+ 截图推导 L16 —— 直接跑完整物理
import json, subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

JS = r'''
const SIM = require('./www/js/sim.js');
const LEVELS = require('./www/js/levels.js');

const userSols = {
  14: [
    { p: 'block2', c: 4, r: 0 },
    { p: 'ramp2', c: 4, r: 0, rot: 3 },
    { p: 'bridge', c: 4, r: 1 },
    { p: 'bridge', c: 4, r: 2 },
    { p: 'arrow', c: 4, r: 2, rot: 2 },
    { p: 'ramp1', c: 2, r: 2, rot: 0 },
    { p: 'bridge', c: 3, r: 2 },
    { p: 'ramp1', c: 3, r: 2, rot: 0 },
  ],
  15: [
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
    { p: 'ramp1', c: 4, r: 5, rot: 0 },
  ],
  16: [
    { p: 'block2', c: 2, r: 2 },
    { p: 'block2', c: 2, r: 2 },
    { p: 'arrow', c: 2, r: 2, rot: 1 },
    { p: 'block2', c: 2, r: 3 },
    { p: 'ramp2', c: 2, r: 3, rot: 3 },
    { p: 'block2', c: 2, r: 4 },
    { p: 'block2', c: 2, r: 5 },
    { p: 'arrow', c: 2, r: 5, rot: 2 },
    { p: 'block1', c: 1, r: 5 },
    { p: 'ramp1', c: 1, r: 5, rot: 0 },
    { p: 'bridge', c: 1, r: 2 },
    { p: 'ramp1', c: 1, r: 2, rot: 2 },
    { p: 'bridge', c: 0, r: 2 },
    { p: 'ramp1', c: 0, r: 2, rot: 2 },
  ],
  17: [
    { p: 'block1', c: 4, r: 2 },
    { p: 'ramp1', c: 4, r: 2, rot: 3 },
    { p: 'bridge', c: 4, r: 1 },
    { p: 'ramp2', c: 4, r: 1, rot: 3 },
    { p: 'bridge', c: 4, r: 0 },
    { p: 'ramp2', c: 4, r: 0, rot: 3 },
    { p: 'ramp1', c: 4, r: 3, rot: 3 },
    { p: 'ramp2', c: 4, r: 4, rot: 1 },
    { p: 'bridge', c: 4, r: 5 },
    { p: 'arrow', c: 4, r: 5, rot: 2 },
    { p: 'ramp2', c: 3, r: 5, rot: 0 },
    { p: 'ramp2', c: 1, r: 5, rot: 2 },
    { p: 'bridge', c: 0, r: 5 },
    { p: 'arrow', c: 0, r: 5, rot: 3 },
    { p: 'ramp2', c: 0, r: 4, rot: 1 },
    { p: 'arrow', c: 0, r: 0, rot: 0 },
  ],
};

for (const idx of [14, 15, 16, 17]) {
  const raw = JSON.parse(JSON.stringify(LEVELS[idx - 1]));
  const L = SIM.parseLevel(raw);
  const sol = userSols[idx];
  // 库存核对
  const use = {};
  sol.forEach(s => use[s.p] = (use[s.p] || 0) + 1);
  const over = Object.keys(use).filter(k => use[k] > (raw.pieces[k] || 0));
  try {
    const pm = SIM.applySolution(L, sol);
    const R = SIM.simulate(L, pm);
    const deck = [];
    for (const [k, p] of pm) if (p.type === 'bridge') deck.push(k + '=d' + p.deck);
    console.log('L' + idx + ': ' + R.result + ' [' + R.events.map(e => e.type).join(',') + ']');
    if (over.length) console.log('   超库存: ' + over.map(k => k + '×' + use[k] + '/' + raw.pieces[k]).join(' '));
    if (deck.length) console.log('   桥面: ' + deck.join(' '));
  } catch (e) {
    console.log('L' + idx + ': 放置失败 — ' + e.message);
    if (over.length) console.log('   超库存: ' + over.map(k => k + '×' + use[k] + '/' + raw.pieces[k]).join(' '));
  }
}
'''
open(r'C:\Users\Jacky\Desktop\smallball\isoball-x\tools\check-sols.js', 'w', encoding='utf-8').write(JS)
r = subprocess.run(['node', r'C:\Users\Jacky\Desktop\smallball\isoball-x\tools\check-sols.js'],
                   capture_output=True, text=True, encoding='utf-8', cwd=r'C:\Users\Jacky\Desktop\smallball\isoball-x')
print(r.stdout)
print(r.stderr[-1500:] if r.returncode else '')
