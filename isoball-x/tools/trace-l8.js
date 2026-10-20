// L8 逐帧追踪：打印球每次跨界/转向/传送/坠落的关键状态
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
const parsed = SIM.parseLevel(LEVELS[7]);
const pm = SIM.applySolution(parsed, LEVELS[7].sol);

const R = SIM.newRun(parsed, pm);
const dt = 1 / 120;
let t = 0;
let last = { x: R.ball.x, y: R.ball.y, z: R.ball.z, status: R.ball.status, done: R.done };
while (!R.done && t < 30) {
  SIM.step(R, dt);
  t += dt;
  const b = R.ball;
  const moved = Math.hypot(b.x - last.x, b.y - last.y) > 0.2;
  const zchg = Math.abs(b.z - last.z) > 0.05;
  const stchg = b.status !== last.status;
  if (moved || zchg || stchg || R.events.length) {
    console.log(
      `t=${t.toFixed(2)} st=${b.status} c=${b.x.toFixed(2)} r=${b.y.toFixed(2)} z=${b.z.toFixed(2)} d=${b.dir} v2=${b.v2.toFixed(2)}` +
      (R.events.length ? '  EVT:' + R.events.map(e => e.type + (e.reason ? ':' + e.reason : '')).join('|') : '')
    );
    R.events.length = 0;
    last = { x: b.x, y: b.y, z: b.z, status: b.status, done: R.done };
  }
}
console.log('final:', R.status, 't=' + t.toFixed(2));
