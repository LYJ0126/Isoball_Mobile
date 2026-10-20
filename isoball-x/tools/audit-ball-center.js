// 审计：球在滚动中跨格时，是否都走在格子中心线（而不是贴着格子边/墙）
// 判据：水平移动(dir 0/2)时 y 应 ≈ 所在行中心；竖直移动(dir 1/3)时 x 应 ≈ 所在列中心。
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
const TOL = 0.08;
let bad = 0, checked = 0;
for (let i = 0; i < LEVELS.length; i++) {
  const lv = LEVELS[i];
  if (!lv.sol || !lv.sol.length) continue;
  const L = SIM.parseLevel(JSON.parse(JSON.stringify(lv)));
  const pm = SIM.applySolution(L, lv.sol);
  const R = SIM.newRun(L, pm);
  const dt = 1 / 240;
  let t = 0, prevKey = '', hits = [];
  while (!R.done && t < 40) {
    SIM.step(R, dt); t += dt;
    const b = R.ball;
    if (b.mode !== 'roll' || b.ramp || b.hidden) { prevKey = ''; continue; }
    const cx = Math.floor(b.x), cy = Math.floor(b.y);
    const key = cx + ',' + cy;
    if (key === prevKey) continue;
    prevKey = key; checked++;
    const horiz = (b.dir === 0 || b.dir === 2);
    const off = horiz ? Math.abs(b.y - (cy + 0.5)) : Math.abs(b.x - (cx + 0.5));
    if (off > TOL) hits.push(`${key} d=${b.dir} off=${off.toFixed(3)} pos=(${b.x.toFixed(2)},${b.y.toFixed(2)})`);
  }
  if (hits.length) {
    bad++;
    console.log(`✗ 第${i + 1}关 贴边滚动 ${hits.length} 处:`);
    hits.slice(0, 6).forEach(h => console.log('    ' + h));
  }
}
console.log(bad ? `\n${bad} 关存在贴边滚动` : `\n✓ 43 关全部没有贴边滚动（共检查 ${checked} 次跨格）`);
