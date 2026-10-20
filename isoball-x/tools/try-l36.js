const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
function run(sol, tag) {
  const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[35])));
  let pm;
  try { pm = SIM.applySolution(L, sol); } catch (e) { console.log(tag, 'APPLY FAIL:', e.message); return; }
  const R = SIM.simulate(L, pm, 30);
  console.log(tag, '→', R.result, 't=' + R.time.toFixed(2));
  if (R.result !== 'win') {
    const b = R.ball; console.log('   ball', b.x.toFixed(2), b.y.toFixed(2), b.z.toFixed(2), 'd=' + b.dir);
  }
}
run([
  { p:'arrow', c:0, r:6, rot:3 },
  { p:'arrow', c:0, r:1, rot:2 },
  { p:'arrow', c:4, r:0, rot:0 },
  { p:'elevator', c:5, r:0 },
  { p:'elevator', c:5, r:0, on:true },
], 'A 最小');
