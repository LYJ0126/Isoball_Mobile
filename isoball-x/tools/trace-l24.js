const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[23])));
const pm = SIM.applySolution(L, LEVELS[23].sol);
const R = SIM.newRun(L, pm);
const dt = 1/120; let t = 0, lastX = R.ball.x, lastY = R.ball.y;
while (!R.done && t < 30) {
  SIM.step(R, dt); t += dt;
  const b = R.ball;
  if (Math.abs(b.x - lastX) > 0.25 || Math.abs(b.y - lastY) > 0.25 || R.events.length) {
    console.log(`t=${t.toFixed(2)} pos=(${b.x.toFixed(2)},${b.y.toFixed(2)}) z=${b.z.toFixed(2)} d=${b.dir}` +
      (R.events.length ? '  EVT:' + R.events.map(e => e.type).join('|') : ''));
    R.events.length = 0; lastX = b.x; lastY = b.y;
  }
}
console.log('FINAL:', R.result);
