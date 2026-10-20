/* 验证「光带穿传送门」+「光带任意方向可跑」 */
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');

// ---- 测试1：L42 用户描述的场景 ----
const raw = LEVELS[41]; // 第42关
const L = SIM.parseLevel(JSON.parse(JSON.stringify(raw)));
const pm = SIM.applySolution(L, [
  { p: 'block1', c: 3, r: 5 },
  { p: 'glow', c: 3, r: 5, on: true },
  { p: 'block1', c: 1, r: 4 },
  { p: 'glow', c: 1, r: 4, on: true },
]);
L._beams = SIM.computeBeams(L, pm);
const got = [];
for (const [k, v] of L._beams) got.push(k + '(z' + v.z + ',axis' + v.axis + ')');
console.log('穿门光带格:', got.join(' ') || '(空)');

const want = ['0,5', '1,5', '2,5', '1,0', '1,1', '1,2', '1,3'];
const missing = want.filter(k => !L._beams.has(k));
console.log(missing.length === 0 ? '✓ 两段光带均生成（含穿门）' : '✗ 缺少: ' + missing.join(','));
const wrongZ = want.filter(k => L._beams.has(k) && L._beams.get(k).z !== 2);
console.log(wrongZ.length === 0 ? '✓ 光带高度均=2（与门等高）' : '✗ 高度错误: ' + wrongZ.join(','));

// ---- 测试2：光带垂直方向可跑 ----
// (1,2) 是竖向光带（axis=3），从西侧 (0,2) 向东进 (1,2)
const gctx = { holeOpen: false, pillarsUp: true, beams: L._beams };
const perp = SIM.surfaceAt(L, pm, gctx, 1, 2, 2, 0);   // d=0 东进（垂直轴向）
const par = SIM.surfaceAt(L, pm, gctx, 1, 2, 2, 1);    // d=1 南进（沿轴向）
console.log('垂直方向进(1,2):', JSON.stringify(perp));
console.log('沿轴向进(1,2):', JSON.stringify(par));
console.log(perp && perp.kind === 'beam' ? '✓ 垂直方向也能站在光带上' : '✗ 垂直方向不能跑');

// ---- 测试3：遮挡会断开（需高于光带 z2 才挡光） ----
const L2 = SIM.parseLevel(JSON.parse(JSON.stringify(raw)));
const pm2 = SIM.applySolution(L2, [
  { p: 'block1', c: 3, r: 5 },
  { p: 'glow', c: 3, r: 5, on: true },
  { p: 'block1', c: 1, r: 4 },
  { p: 'glow', c: 1, r: 4, on: true },
  { p: 'block1', c: 2, r: 5 },
  { p: 'block1', c: 2, r: 5 }, // 顶2 恰好等于光带高度 → 不挡
  { p: 'block1', c: 2, r: 5 }, // 叠到顶3 > 2 → 挡
]);
L2._beams = SIM.computeBeams(L2, pm2);
console.log('高积木遮挡后 (0,5) 光带:', L2._beams.has('0,5') ? '仍在（错误）' : '已断开 ✓');
console.log('高积木遮挡后 (3,4) 光带（北向经 lights2）:', L2._beams.has('3,4') ? '仍在 ✓' : '被断开（错误）');
console.log('lights1 另一段 (1,0) 应同时断开（依赖 (2,5) 畅通）:', L2._beams.has('1,0') ? '仍在（错误）' : '已断开 ✓');
console.log('lights2 的 (0,4) 段仍在:', L2._beams.has('0,4') ? '在 ✓' : '不在（错误）');
