const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

const raw = JSON.parse(JSON.stringify(LEVELS[19]));
const L = SIM.parseLevel(raw);
console.log('L20 terr:', JSON.stringify(L.terr), 'start:', JSON.stringify(L.start), 'hole:', JSON.stringify(L.hole));

const sol = [
  { p: 'block1', c: 2, r: 1 },
  { p: 'block1', c: 3, r: 1 },
  { p: 'block2', c: 1, r: 1 },
  { p: 'block2', c: 1, r: 2 },
  { p: 'block2', c: 1, r: 3 },
  { p: 'ramp1', c: 2, r: 1, rot: 2 },
  { p: 'ramp1', c: 3, r: 2, rot: 3 },
  { p: 'arrow', c: 3, r: 1, rot: 1 },
  { p: 'arrow', c: 3, r: 3, rot: 2 },
  { p: 'arrow', c: 2, r: 3, rot: 3 },
  { p: 'block1', c: 1, r: 3 },
  { p: 'arrow', c: 1, r: 3, rot: 3 },
  { p: 'arrow', c: 1, r: 1, rot: 0 },
  { p: 'ramp1', c: 1, r: 2, rot: 1 },
  { p: 'bridge', c: 2, r: 3 },
  { p: 'ramp1', c: 2, r: 3, rot: 0 },
  { p: 'bridge', c: 3, r: 3 },
  { p: 'arrow', c: 3, r: 3, rot: 2 },
  { p: 'bridge', c: 3, r: 2 },
  { p: 'ramp1', c: 3, r: 2, rot: 3 },
  { p: 'bridge', c: 3, r: 1 },
  { p: 'arrow', c: 3, r: 1, rot: 1 },
  { p: 'bridge', c: 2, r: 1 },
  { p: 'ramp1', c: 2, r: 1, rot: 2 },
  { p: 'bridge', c: 1, r: 1 },
  { p: 'ramp1', c: 1, r: 1, rot: 2 },
];

let pm;
try {
  pm = SIM.applySolution(L, sol);
  console.log('全部放置成功');
  for (const [k, p] of pm) {
    const chain = [];
    let q = p;
    while (q) { chain.unshift(q.type + (q.deck !== undefined ? '(d' + q.deck + ')' : '') + (q.zAbs !== undefined ? '(z' + q.zAbs + ')' : '')); q = q.under; }
    console.log('  ' + k + ': ' + chain.join(' > '));
  }
} catch (e) {
  console.log('放置失败: ' + e.message);
  process.exit(0);
}

const R = SIM.simulate(L, pm);
console.log('RESULT:', R.result, '[' + R.events.map(e => e.type + (e.cell ? '@' + e.cell.c + ',' + e.cell.r : '') + (e.reason ? ':' + e.reason : '')).join(',') + ']');
