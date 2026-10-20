const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
for (let c = 0; c <= 4; c++) {
  for (let r = 0; r <= 6; r++) {
    const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[30])));
    let pm;
    try { pm = SIM.applySolution(L, [{ p: 'button', c, r }]); } catch (e) { continue; }
    const R = SIM.simulate(L, pm, 30);
    if (R.result === 'win') console.log(`button @(${c},${r}) → win  t=${R.time.toFixed(2)}`);
  }
}
