/* v0 自动调参：摩擦加大后为 stall 关卡搜索最小可通关 v0 */
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

function tryV0(lvIdx, v0) {
  const src = JSON.parse(JSON.stringify(LEVELS[lvIdx]));
  src.start.v0 = v0;
  const L = SIM.parseLevel(src);
  const pm = SIM.applySolution(L, LEVELS[lvIdx].sol);
  L._beams = SIM.computeBeams(L, pm);
  const R = SIM.simulate(L, pm, 60);
  return R.result;
}

// 从命令行参数取关卡号（1 基），缺省跑全部 stall 关
const targets = process.argv.slice(2).map(Number);
for (const lv of targets) {
  const idx = lv - 1;
  const cur = LEVELS[idx].start.v0;
  let found = null;
  for (let v0 = Math.round(cur * 10) / 10; v0 <= cur + 4; v0 += 0.1) {
    const r = tryV0(idx, Math.round(v0 * 10) / 10);
    if (r === 'win') { found = Math.round(v0 * 10) / 10; break; }
  }
  console.log(`L${lv} ${LEVELS[idx].name}: v0 ${cur} -> ${found || 'NOT FOUND(>cur+4)'}`);
}
