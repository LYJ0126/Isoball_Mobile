const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
function trace(sol, tag) {
  const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[37])));
  let pm;
  try { pm = SIM.applySolution(L, sol); } catch (e) { console.log(tag, 'APPLY FAIL:', e.message); return; }
  // 塔顶高度（编辑态/降柱后）
  const R = SIM.newRun(L, pm);
  const dt = 1/120; let t = 0, lastCell='';
  const out=[];
  while (!R.done && t < 30) {
    SIM.step(R, dt); t += dt;
    const b = R.ball, cell = Math.floor(b.x)+','+Math.floor(b.y);
    if (cell !== lastCell || R.events.length) {
      out.push(`t=${t.toFixed(2)} ${cell} z=${b.z.toFixed(2)} d=${b.dir}` + (R.events.length?' EVT:'+R.events.map(e=>e.type).join('|'):''));
      R.events.length=0; lastCell=cell;
    }
  }
  console.log('===', tag, '→', R.result, 't='+t.toFixed(2));
  console.log(out.join('\n'));
}
const base = LEVELS[37].sol;
const six = base.slice();
while (six.filter(x => x.p === 'elevator').length < 6) six.push({ p:'elevator', c:4, r:1 });
trace(base, '当前 sol（5 电梯）');
trace(six, '改 6 电梯');
