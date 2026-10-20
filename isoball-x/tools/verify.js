/* 关卡验证器：应用预置解法 → 无头模拟 → 必须进洞
 * 用法: node verify.js [关卡号...]   (不带参数=全部)
 * 无 sol 的关卡跳过（不计成败）——设计者试玩关不强制带解法
 */
const fs = require('fs');
const path = require('path');
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

const args = process.argv.slice(2).map(Number);
const targets = args.length ? args.map(i => LEVELS[i - 1]) : LEVELS;
let pass = 0, fail = 0, skip = 0;

for (const L of targets) {
  const idx = LEVELS.indexOf(L) + 1;
  if (!L.sol || !L.sol.length) {
    skip++;
    console.log(`- L${idx}  无 sol，跳过（待试玩验证）`);
    continue;
  }
  try {
    const parsed = SIM.parseLevel(L);
    const pm = SIM.applySolution(parsed, L.sol);
    // 库存核对
    const used = {};
    for (const s of L.sol) used[s.p] = (used[s.p] || 0) + 1;
    let invOk = true;
    for (const k in used) if (used[k] > (L.pieces[k] || 0)) { invOk = false; console.log(`  库存不足: ${k} 需要${used[k]} 只有${L.pieces[k]}`); }
    const R = SIM.simulate(parsed, pm);
    const trace = R.events.map(e => e.type + (e.reason ? ':' + e.reason : '')).join(' → ') || '(无事件)';
    if (R.result === 'win' && invOk) {
      pass++;
      console.log(`✓ L${idx}  [${R.time.toFixed(1)}s]  ${trace}`);
    } else {
      fail++;
      console.log(`✗ L${idx}  结果=${R.result}  ${trace}`);
    }
  } catch (err) {
    fail++;
    console.log(`✗ L${idx}  异常: ${err.message}`);
  }
}
console.log(`\n${pass} 通过 / ${fail} 失败 / ${skip} 跳过（共 ${targets.length} 关）`);
process.exit(fail ? 1 : 0);
