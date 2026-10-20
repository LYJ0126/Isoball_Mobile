/* 一次性校验：37 关 map 尺寸/坐标边界/portal 配对/库存非负 */
const LEVELS = require('../www/js/levels.js');
const SIM = require('../www/js/sim.js');
let bad = 0;
const THEMES = new Set(['olive', 'orange', 'red', 'green', 'dark']);
LEVELS.forEach((L, i) => {
  const n = i + 1;
  const errs = [];
  const cell = (c, r) => (L.map[r] || '')[c];
  if (L.map.length !== L.H) errs.push(`map 行数 ${L.map.length} != H ${L.H}`);
  for (const [ri, row] of L.map.entries()) {
    if (row.length !== L.W) errs.push(`map 第${ri}行长度 ${row.length} != W ${L.W}`);
  }
  if (L.start.wall === 'L' && (L.start.idx < 0 || L.start.idx >= L.H)) errs.push('start idx 出界');
  if (L.start.wall === 'R' && (L.start.idx < 0 || L.start.idx >= L.W)) errs.push('start idx 出界');
  if (L.hole && L.hole.c >= 0) {
    if (L.hole.c >= L.W || L.hole.r < 0 || L.hole.r >= L.H) errs.push('hole 出界');
    if (cell(L.hole.c, L.hole.r) === undefined) errs.push('hole 越图');
  } // hole 缺省/图外负坐标 = 无洞关（原稿未给洞，待补），跳过洞校验
  const lightsCount = {};
  for (const p of L.portals || []) {
    const inRange = p.wall === 'L' ? p.idx < L.H : p.idx < L.W;
    if (!inRange) errs.push(`portal ${p.wall}${p.idx} idx 出界`);
    lightsCount[p.lights] = (lightsCount[p.lights] || 0) + 1;
  }
  for (const k in lightsCount) if (lightsCount[k] !== 2) errs.push(`lights:${k} 有 ${lightsCount[k]} 个门（应为2）`);
  if (!THEMES.has(L.theme)) errs.push(`未知主题 ${L.theme}`);
  for (const pl of L.pillars || []) {
    if (pl.c < 0 || pl.c >= L.W || pl.r < 0 || pl.r >= L.H) errs.push('立柱出界');
    if (cell(pl.c, pl.r) === undefined || cell(pl.c, pl.r) === '.') errs.push(`立柱(${pl.c},${pl.r})落在虚空`);
  }
  for (const k in L.pieces) if ((L.pieces[k] | 0) < 0) errs.push(`库存负数 ${k}`);
  // parseLevel 全关试解析（含 pairs 组配）
  try { SIM.parseLevel(L); } catch (e) { errs.push('parseLevel: ' + e.message); }
  if (errs.length) { bad++; console.log(`✗ 第${n}关: ${errs.join('; ')}`); }
  else console.log(`✓ 第${n}关  W${L.W}×H${L.H}  主题${L.theme}  sol=${L.sol ? L.sol.length : 0} 件`);
});
console.log(`\n共 ${LEVELS.length} 关，问题 ${bad} 关`);
process.exit(bad ? 1 : 0);
