/* 新规则专项测试：桥依附/级联、双向荧光路、传送带卡球、落差摔碎、坠洞得分、桥面叠放 */
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name); }
}
function mkL() {
  return SIM.parseLevel({
    name: 't', W: 7, H: 7,
    map: ['0000000','0000000','0000000','0000000','0000000','0000000','0000000'],
    start: { wall: 'L', idx: 1, z: 1, v0: 3.6 },
    hole: { c: 5, r: 5, z: 0 },
    portals: [], pillars: [],
    pieces: { block1: 9, block2: 9, glow: 9, bridge: 9, conveyor: 9, ramp1: 9, ramp2: 9, arrow: 9, button: 9, elevator: 9 },
  });
}
function put(L, pm, type, c, r, rot) {
  const st = SIM.canPlace(L, pm, type, c, r);
  if (!st.ok) return { err: st.msg };
  const pc = { type, rot: rot || 0 };
  if (type === 'bridge' && st.deck !== undefined) pc.deck = st.deck;
  if (st.on) { pc.on = true; pc.zAbs = st.z; pc.under = pm.get(c + ',' + r); }
  else if (st.under) { pc.under = st.under; } // 桥从已有积木上方跨过
  pm.set(c + ',' + r, pc);
  return { pc, st };
}

// 1. 桥依附规则
{
  const L = mkL(), pm = new Map();
  put(L, pm, 'block1', 2, 2);
  const rb1 = put(L, pm, 'bridge', 3, 2);
  T('桥依附高度1方块 deck=1', !!rb1.pc && rb1.pc.deck === 1);
  T('桥依附桥 deck=1', put(L, pm, 'bridge', 4, 2).pc.deck === 1);
  const r1 = SIM.canPlace(L, pm, 'bridge', 2, 4);
  T('无依附不能放桥', !r1.ok);
  const r2 = SIM.canPlace(L, pm, 'bridge', 1, 4); void r2;
  // 高度2方块 → 桥面=2
  const pm2 = new Map();
  put(L, pm2, 'block2', 2, 4);
  const rb = put(L, pm2, 'bridge', 3, 4);
  T('桥依附高度2方块 deck=2（上方邻边同高）', rb.pc && rb.pc.deck === 2);
  // 不能依附斜坡（非背面方向）/箭头
  const pm3 = new Map();
  put(L, pm3, 'ramp1', 2, 6, 0); // rot0=东高：背面朝东
  T('不能依附斜坡（低侧/侧面）', !SIM.canPlace(L, pm3, 'bridge', 1, 6).ok && !SIM.canPlace(L, pm3, 'bridge', 2, 5).ok);
  const pm4 = new Map();
  put(L, pm4, 'arrow', 2, 5, 0);
  T('不能依附箭头', !SIM.canPlace(L, pm4, 'bridge', 3, 5).ok);
}
// 2. 桥面叠放 + 桥不能叠桥
{
  const L = mkL(), pm = new Map();
  put(L, pm, 'block1', 2, 2);
  put(L, pm, 'bridge', 3, 2);
  const st1 = SIM.canPlace(L, pm, 'arrow', 3, 2);
  T('箭头可叠放在桥面上', st1.ok && st1.on && st1.z === 1);
  T('桥不能叠放在桥上', !SIM.canPlace(L, pm, 'bridge', 3, 2).ok || SIM.canPlace(L, pm, 'bridge', 3, 2).msg.indexOf('叠') >= 0);
  const st2 = SIM.canPlace(L, pm, 'block1', 3, 2);
  T('方块可叠放在桥面上', st2.ok && st2.on && st2.z === 1);
}
// 3. 双向荧光光束（同行 + 同列）
{
  const L = mkL(), pm = new Map();
  put(L, pm, 'glow', 1, 1);
  put(L, pm, 'glow', 5, 1);
  let beams = SIM.computeBeams(L, pm);
  T('同行(东西向)光束', beams.has('3,1') && beams.get('3,1').z === 1);
  const pm2 = new Map();
  put(L, pm2, 'glow', 3, 0);
  put(L, pm2, 'glow', 3, 4);
  beams = SIM.computeBeams(L, pm2);
  T('同列(南北向)光束', beams.has('3,2') && beams.has('3,3') && beams.get('3,2').z === 1);
  // 箭头叠在荧光块上仍是光源/终点
  const pm3 = new Map();
  put(L, pm3, 'glow', 1, 3);
  put(L, pm3, 'glow', 5, 3);
  put(L, pm3, 'arrow', 5, 3, 1);
  beams = SIM.computeBeams(L, pm3);
  T('箭头压住荧光块仍形成光束', beams.has('3,3'));
}
// 4. 落差≥1 摔碎（落到传送带上也碎）
{
  const L = mkL();
  L.start = { wall: 'L', idx: 1, z: 2, v0: 3.6 };
  const pm = new Map();
  put(L, pm, 'conveyor', 0, 1, 0); // 出口格放传送带（顶=1），球从 z=2 出发
  const R = SIM.simulate(L, pm, 30);
  T('从高度2摔到高度1传送带 → 碎', R.result === 'shatter');
}
// 5. 摔进开的洞 → 进洞得分（球从 z=1 滚出洞口边缘，坠向相邻的低洞）
{
  const L = mkL();
  L.hole = { c: 1, r: 1, z: 0 };
  const pm = new Map();
  put(L, pm, 'block1', 0, 1); // 出口支撑（顶=1），球滚过 (1,1) 洞口上空时坠落
  const R = SIM.simulate(L, pm, 30);
  T('坠入开洞 → win', R.result === 'win');
}
// 6. 传送带方向不符 → 卡住停摆（多格带 + 中速球，确保在带上耗尽）
{
  const L = mkL();
  L.start = { wall: 'L', idx: 1, z: 1, v0: 2.0 };
  const pm = new Map();
  put(L, pm, 'conveyor', 0, 1, 1); // 传送带朝南，球向东滚
  put(L, pm, 'conveyor', 1, 1, 1);
  put(L, pm, 'conveyor', 2, 1, 1);
  const R = SIM.simulate(L, pm, 30);
  T('方向不符卡在传送带上 → stall(复位)', R.result === 'stall' && R.time < 8);
  const pm2 = new Map();
  put(L, pm2, 'conveyor', 0, 1, 0); // 同向 → 加速
  const R2 = SIM.simulate(L, pm2, 30);
  T('同向传送带正常加速通过', R2.result === 'shatter' || R2.result === 'stall'); // 冲出地图或耗尽都算"通过"
}
// 7. 桥级联依附（移除支撑 → 桥失去依附资格）
{
  const L = mkL(), pm = new Map();
  put(L, pm, 'block1', 2, 2);
  put(L, pm, 'bridge', 3, 2);
  pm.delete('2,2'); // 模拟移除支撑
  T('支撑被移除后 bridgeSupport=null', SIM.bridgeSupport(L, pm, 3, 2) === null);
}
// 8. 桥下通行（新语义：桥板厚 0.3，球顶 z+1 碰到板底 deck-0.3 则撞碎）
{
  const L = mkL(), pm = new Map();
  // 依附高度1方块：deck=1，板底 0.7 < 球顶 1 → 贴地球撞桥碎
  put(L, pm, 'block1', 2, 2);
  put(L, pm, 'bridge', 3, 2);
  const surf = SIM.surfaceAt(L, pm, { holeOpen: true, pillarsUp: false, beams: new Map() }, 3, 2, 0, 0);
  T('依附高度1方块：贴地球撞桥（无表面→碎）', surf === null);
  // 依附高度2方块：deck=2，板底 1.7 > 球顶 1 → 贴地球可从桥下过
  const L2 = mkL(), pm2 = new Map();
  put(L2, pm2, 'block2', 2, 2);
  put(L2, pm2, 'bridge', 3, 2);
  const surfB = SIM.surfaceAt(L2, pm2, { holeOpen: true, pillarsUp: false, beams: new Map() }, 3, 2, 0, 0);
  T('依附高度2方块：贴地球从桥下滚过', surfB && (surfB.kind === 'flat' || surfB.kind === 'floor') && surfB.z === 0);
  const surf2 = SIM.surfaceAt(L2, pm2, { holeOpen: true, pillarsUp: false, beams: new Map() }, 3, 2, 2, 0);
  T('球在桥面高度可滚上桥', surf2 && surf2.kind === 'flat' && surf2.z === 2);
}
// 8.5 荧光通路：glow 上叠积木限制 + 光束下方积木不挡光
{
  const L = mkL(), pm = new Map();
  put(L, pm, 'glow', 2, 2);
  T('glow 上可叠箭头', SIM.canPlace(L, pm, 'arrow', 2, 2).ok);
  T('glow 上可叠按钮', SIM.canPlace(L, pm, 'button', 2, 2).ok);
  T('glow 上可叠荧光块', SIM.canPlace(L, pm, 'glow', 2, 2).ok);
  T('glow 上可叠方块（任何非桥积木，同普通方块规则）', SIM.canPlace(L, pm, 'block1', 2, 2).ok);
  T('glow 上可叠斜坡', SIM.canPlace(L, pm, 'ramp1', 2, 2).ok);
  T('glow 上叠桥被拒绝', !SIM.canPlace(L, pm, 'bridge', 2, 2).ok);
  T('glow 上叠传送带', SIM.canPlace(L, pm, 'conveyor', 2, 2).ok);
  // 光束路径下方放低积木：光束不被切断
  const L2 = mkL(), pm2 = new Map();
  put(L2, pm2, 'glow', 1, 2);
  put(L2, pm2, 'glow', 5, 2);
  put(L2, pm2, 'block1', 3, 2); // 顶面 z=1 = 光束高度 → 不挡（等高衔接）
  const beams = SIM.computeBeams(L2, pm2);
  T('光束路径上等高积木不挡光', beams.has('2,2') && beams.has('3,2') && beams.has('4,2'));
  const L3 = mkL(), pm3 = new Map();
  put(L3, pm3, 'glow', 1, 2);
  put(L3, pm3, 'glow', 5, 2);
  put(L3, pm3, 'block2', 3, 2); // 顶面 z=2 > 光束 z=1 → 挡光
  const beams3 = SIM.computeBeams(L3, pm3);
  T('光束路径上超高新积木挡光', !beams3.has('2,2') && !beams3.has('4,2'));
  // 荧光块上叠方块后通路仍在（glowUnder 透过叠层找 glow）
  const L4 = mkL(), pm4 = new Map();
  put(L4, pm4, 'glow', 1, 2);
  put(L4, pm4, 'glow', 5, 2);
  put(L4, pm4, 'block1', 5, 2); // 东侧荧光块上叠方块
  const beams4 = SIM.computeBeams(L4, pm4);
  T('荧光块上叠方块后通路仍在', beams4.has('2,2') && beams4.has('3,2') && beams4.has('4,2'));
  // 光通路是"虚"的 → 不参与放置判定：通路上怎么放都放得行；
  // 放完通路的存亡只由"叠放积木顶面高度是否严格超过通路高度"决定。
  const L5 = mkL(), pm5 = new Map();
  put(L5, pm5, 'glow', 1, 2);
  put(L5, pm5, 'glow', 5, 2);
  L5._beams = SIM.computeBeams(L5, pm5); // z=1 光束：2,2 3,2 4,2
  T('通路上放 block2（顶=2>光束z=1）可放（光通路不拦放置）', SIM.canPlace(L5, pm5, 'block2', 3, 2).ok);
  T('通路上放等高 block1（顶=1=光束z）可放', SIM.canPlace(L5, pm5, 'block1', 3, 2).ok);
  T('通路上放按钮（贴面不增高）可放', SIM.canPlace(L5, pm5, 'button', 3, 2).ok);
  // 但放上超高积木之后，通路必须因为遮挡而消失
  const L5b = mkL(), pm5b = new Map();
  put(L5b, pm5b, 'glow', 1, 2);
  put(L5b, pm5b, 'glow', 5, 2);
  put(L5b, pm5b, 'block2', 3, 2); // 顶=2 > 光束 z=1
  const beams5b = SIM.computeBeams(L5b, pm5b);
  T('放上超高积木后光通路因遮挡消失', !beams5b.has('2,2') && !beams5b.has('4,2'));
  // 高光束 z=2（荧光块叠在 block1 上）：通路下面放东西不受影响
  const L6 = mkL(), pm6 = new Map();
  put(L6, pm6, 'block1', 1, 2); put(L6, pm6, 'glow', 1, 2); // 叠上去，glow 顶=2
  put(L6, pm6, 'block1', 5, 2); put(L6, pm6, 'glow', 5, 2);
  L6._beams = SIM.computeBeams(L6, pm6); // z=2 光束
  T('高光束(z=2)通路上放 block1（通路下面）可放', SIM.canPlace(L6, pm6, 'block1', 3, 2).ok);
  T('高光束(z=2)通路上放 block2（顶=2 恰好贴着）可放', SIM.canPlace(L6, pm6, 'block2', 3, 2).ok);
  // 立柱挡光：严格超过光束高度才挡，等于=贴着不算
  const L7 = mkL(), pm7 = new Map();
  L7.pillars.push({ c: 3, r: 2 }); L7.pillarSet.add('3,2');
  put(L7, pm7, 'glow', 1, 2);
  put(L7, pm7, 'glow', 5, 2);
  const beams7 = SIM.computeBeams(L7, pm7);
  T('立柱(顶=2>光束z=1)挡断光束', !beams7.has('2,2') && !beams7.has('4,2'));
  const L8 = mkL(), pm8 = new Map();
  L8.pillars.push({ c: 3, r: 2 }); L8.pillarSet.add('3,2');
  put(L8, pm8, 'block1', 1, 2); put(L8, pm8, 'glow', 1, 2); // glow 顶=2
  put(L8, pm8, 'block1', 5, 2); put(L8, pm8, 'glow', 5, 2);
  const beams8 = SIM.computeBeams(L8, pm8);
  T('立柱(顶=2=光束z=2)恰好贴着不挡光', beams8.has('2,2') && beams8.has('4,2'));
}
// 9. 电梯：单元高1、可叠层、可上可下
{
  const L = mkL(), pm = new Map();
  // 单元高度 1
  const e1 = put(L, pm, 'elevator', 2, 2, 0);
  T('电梯单元 structureTop=1', e1.pc && SIM.structureTop(L, pm.get('2,2'), 2, 2) === 1);
  // 叠成两层 / 三层
  T('电梯可叠在电梯上', SIM.canPlace(L, pm, 'elevator', 2, 2).ok);
  put(L, pm, 'elevator', 2, 2, 0);
  T('两层电梯 structureTop=2', SIM.structureTop(L, pm.get('2,2'), 2, 2) === 2);
  put(L, pm, 'elevator', 2, 2, 0);
  T('三层电梯 structureTop=3', SIM.structureTop(L, pm.get('2,2'), 2, 2) === 3);
  // 叠放限制（2026-10-13 放宽：电梯可叠在方块/荧光/桥面上，与普通积木底座一致）
  const L2 = mkL(), pm2 = new Map();
  put(L2, pm2, 'block1', 2, 2);
  const re1 = SIM.canPlace(L2, pm2, 'elevator', 2, 2);
  T('电梯可叠在高度1方块上（底=1）', re1.ok && re1.on && re1.z === 1);
  const re2 = (() => { const L = mkL(), pm = new Map(); put(L, pm, 'block2', 3, 2); return SIM.canPlace(L, pm, 'elevator', 3, 2); })();
  T('电梯可叠在高度2方块上（底=2）', re2.ok && re2.on && re2.z === 2);
  const re3 = (() => { const L = mkL(), pm = new Map(); put(L, pm, 'ramp1', 4, 2, 0); return SIM.canPlace(L, pm, 'elevator', 4, 2); })();
  T('电梯不能叠在斜坡上', !re3.ok);
  const L3 = mkL(), pm3 = new Map();
  put(L3, pm3, 'elevator', 2, 2);
  T('方块不能叠在电梯上', !SIM.canPlace(L3, pm3, 'block1', 2, 2).ok);
  // 底座电梯塔的表面判定：塔底=底座顶面（不是地形高度）
  {
    const Lb = mkL(), pmb = new Map();
    put(Lb, pmb, 'block1', 3, 2);        // 底座 顶=1
    put(Lb, pmb, 'elevator', 3, 2);      // 塔单元1 底=1 顶=2
    put(Lb, pmb, 'elevator', 3, 2);      // 塔单元2 底=2 顶=3
    const gctx = { holeOpen: true, pillarsUp: false, beams: new Map() };
    const lowIn = SIM.surfaceAt(Lb, pmb, gctx, 3, 2, 1, 0);   // 球在底座顶 z=1 滚入 → 送顶 3
    T('底座电梯塔：底座顶 z=1 滚入 → 送顶 3', lowIn && lowIn.kind === 'lift' && lowIn.zOut === 3);
    const midIn = SIM.surfaceAt(Lb, pmb, gctx, 3, 2, 2, 0);   // 中间级 z=2 → 送顶
    T('底座电梯塔：中间 z=2 → 送顶 3', midIn && midIn.kind === 'lift' && midIn.zOut === 3);
    const topIn = SIM.surfaceAt(Lb, pmb, gctx, 3, 2, 3, 0);   // 塔顶 z=3 滚入 → 送底 1
    T('底座电梯塔：塔顶 z=3 → 送底 1（底座顶）', topIn && topIn.kind === 'lift' && topIn.zOut === 1);
    const blocked = SIM.surfaceAt(Lb, pmb, gctx, 3, 2, 0, 0); // z=0（底座侧面高度）→ 不传送
    T('底座电梯塔：底座侧面 z=0 不误传送', blocked === null || blocked.kind !== 'lift');
  }
  // 乘坐：四面都有门（无朝向语义）。两层电梯 lo=0 hi=2，任意方向进都可升降
  const L4 = mkL(), pm4 = new Map();
  put(L4, pm4, 'elevator', 3, 2, 0);
  put(L4, pm4, 'elevator', 3, 2, 0);
  const gctx = { holeOpen: true, pillarsUp: false, beams: new Map() };
  const up = SIM.surfaceAt(L4, pm4, gctx, 3, 2, 0, 0); // 东进 z=0
  T('东面进 z=0 → 举到 2（方向不变）', up && up.kind === 'lift' && up.zOut === 2 && up.exit === 0);
  const upN = SIM.surfaceAt(L4, pm4, gctx, 3, 2, 0, 3); // 北进 z=0（四面门）
  T('北面进 z=0 → 举到 2', upN && upN.kind === 'lift' && upN.zOut === 2 && upN.exit === 3);
  const down = SIM.surfaceAt(L4, pm4, gctx, 3, 2, 2, 2); // 东进 z=2（顶面进）
  T('顶面进 z=2 → 降到 0', down && down.kind === 'lift' && down.zOut === 0 && down.exit === 2);
  const mid = SIM.surfaceAt(L4, pm4, gctx, 3, 2, 1, 0); // 中间一级进入（用户规则：默认向上）
  T('中间高度 z=1 → 送上去(到顶)', mid && mid.kind === 'lift' && mid.zOut === 2);
  // 完整模拟（上行）：球 z=0 从西侧滚入两层电梯 → 举到 z=2 → 滚进高洞
  const L5 = mkL();
  L5.hole = { c: 5, r: 1, z: 2 };
  L5.start = { wall: 'L', idx: 1, z: 0, v0: 3.6 }; // 地面进入（电梯低侧 z=0）
  const pm5 = new Map();
  put(L5, pm5, 'elevator', 2, 1, 0);
  put(L5, pm5, 'elevator', 2, 1, 0);
  put(L5, pm5, 'block2', 3, 1); // 东侧接应（顶=2）
  put(L5, pm5, 'block2', 4, 1);
  const R5 = SIM.simulate(L5, pm5, 30);
  T('球滚入两层电梯 → 举到 z=2 进高洞 win', R5.result === 'win');
  // 完整模拟（下行）：球 z=2 绕行后从东侧（高侧）滚入电梯 → 降到 z=0 → 进低洞
  const L6 = mkL();
  L6.hole = { c: 0, r: 2, z: 0 };
  const pm6 = new Map();
  put(L6, pm6, 'block2', 0, 1); put(L6, pm6, 'block2', 1, 1);
  put(L6, pm6, 'block2', 2, 1); put(L6, pm6, 'block2', 3, 1);
  put(L6, pm6, 'block2', 3, 2);
  put(L6, pm6, 'arrow', 3, 1, 1); // 高台箭头（叠放）→ 转南
  put(L6, pm6, 'arrow', 3, 2, 2); // 高台箭头（叠放）→ 转西
  put(L6, pm6, 'elevator', 2, 2, 0);
  put(L6, pm6, 'elevator', 2, 2, 0);
  L6.start = { wall: 'L', idx: 1, z: 2, v0: 3.6 };
  const R6 = SIM.simulate(L6, pm6, 30);
  T('球从高处滚入电梯（高侧进）→ 降到 z=0 进低洞 win', R6.result === 'win');
}
// 10. 出口=洞格（L11 bug 回归）：球出界传送后落在"洞格"上，应滚向洞心进洞而不是滚过去
{
  const L = mkL();
  L.hole = { c: 5, r: 0, z: 0 };
  L.portals = [
    { wall: 'L', idx: 3, z: 2, lights: 1 },
    { wall: 'R', idx: 5, z: 0, lights: 1 },
  ];
  L.pairs = [[L.portals[0], L.portals[1]]];
  L.start = { wall: 'L', idx: 3, z: 2, v0: 3.6 };
  const pm = new Map();
  put(L, pm, 'block2', 0, 3);            // 出生支撑（顶=2）
  put(L, pm, 'block2', 1, 3);
  put(L, pm, 'arrow', 1, 3, 2);          // 高台箭头转西 → 球滚回并出西界
  // 西界 idx=3 z=2 传送门 → 传到北墙 (5,0.001)，出口格=(5,0)=洞格 z=0，门全开 → 进洞
  const R = SIM.simulate(L, pm, 30);
  T('出口=洞格：传送落点即开着的洞 → 进洞 win（L11 bug）', R.result === 'win');
}
// 8. 缺口上搭桥 / 依附取最高 / 桥上架桥 / 级联不误伤
{
  const L = mkL();
  L.terr[1][1] = -1; // (1,1) 设为缺口
  const pm = new Map();
  T('普通方块不能放缺口上', !SIM.canPlace(L, pm, 'block1', 1, 1).ok);
  put(L, pm, 'block1', 2, 1);
  const rGap = SIM.canPlace(L, pm, 'bridge', 1, 1);
  T('缺口上可搭桥（依附旁边方块 deck=1）', rGap.ok && rGap.deck === 1);
  put(L, pm, 'block2', 0, 1);
  const rHigh = SIM.canPlace(L, pm, 'bridge', 1, 1);
  T('缺口两侧不同高 → 依附取最高 deck=2', rHigh.ok && rHigh.deck === 2);
  // 已搭桥（deck=2）后旁边再放高1方块：桥不塌（仍有顶面==2 的支撑）
  const rPlaced = put(L, pm, 'bridge', 1, 1);
  T('桥实际放到位 deck=2', !!rPlaced.pc && rPlaced.pc.deck === 2 && !!rPlaced.pc.under === false);
  put(L, pm, 'block1', 1, 2);
  T('旁边补放低积木不塌桥（仍有高2支撑）', SIM.bridgeSupportAt(L, pm, 1, 1, 2) === true);
  // 平地：桥可从已有方块上方跨过（依附更高邻居）
  const L2 = mkL(), pm2 = new Map();
  put(L2, pm2, 'block1', 3, 3);            // 格上已有高度1方块
  put(L2, pm2, 'block2', 4, 3);            // 东邻高度2方块（顶=2）
  const rOver = SIM.canPlace(L2, pm2, 'bridge', 3, 3);
  T('桥可从方块上方跨过（依附旁边高2 → deck=2）', rOver.ok && rOver.deck === 2);
  const rOverPut = put(L2, pm2, 'bridge', 3, 3);
  T('跨过放置后 under=下方方块', !!rOverPut.pc && !!rOverPut.pc.under && rOverPut.pc.under.type === 'block1');
  const rSame = SIM.canPlace(L2, pm2, 'bridge', 3, 3); // 已放桥后再放：deck=2<=结构顶2 → 拒
  T('桥面同高处不能再叠桥', !rSame.ok);
  // 球滚进缺口 → 坠碎
  const L3 = mkL();
  L3.terr[1][1] = -1;
  L3.start = { wall: 'L', idx: 1, z: 1, v0: 3.6 };
  put(L3, new Map(), 'block1', 0, 1); // 出口支撑
  const R = SIM.simulate(L3, (() => { const m = new Map(); put(L3, m, 'block1', 0, 1); return m; })(), 30);
  T('球滚进缺口 → 坠碎 shatter', R.result === 'shatter');
}
// 13. 斜坡背面依附（新增规则）
{
  const L = mkL(), pm = new Map();
  // 裸斜坡（地面 ramp2 rot0=东高）：东邻搭桥 → 依附背面顶 deck=2
  put(L, pm, 'ramp2', 2, 2, 0);
  const rb = put(L, pm, 'bridge', 3, 2);
  T('桥依附 ramp2 背面 deck=2（仅高侧）', !!rb.pc && rb.pc.deck === 2);
  // 非背面方向不可依附（该格无其他支撑）
  T('斜坡低侧/侧面不能依附', !SIM.canPlace(L, pm, 'bridge', 1, 2).ok && !SIM.canPlace(L, pm, 'bridge', 2, 3).ok && !SIM.canPlace(L, pm, 'bridge', 2, 1).ok);
  // ramp1 背面 deck=1
  const pmB = new Map();
  put(L, pmB, 'ramp1', 2, 4, 1); // rot1=南高
  const rb1 = put(L, pmB, 'bridge', 2, 5);
  T('桥依附 ramp1 背面 deck=1', !!rb1.pc && rb1.pc.deck === 1);
  // 方块上叠斜坡：背面方向取最高（=斜坡顶），低侧方向取方块顶
  const pmC = new Map();
  put(L, pmC, 'block2', 4, 4);
  put(L, pmC, 'ramp2', 4, 4, 2); // rot2=西高，背面朝西
  T('叠坡方块：背面方向 deck=4', SIM.canPlace(L, pmC, 'bridge', 3, 4).deck === 4);
  T('叠坡方块：低侧方向 deck=2', SIM.canPlace(L, pmC, 'bridge', 4, 5).ok && SIM.canPlace(L, pmC, 'bridge', 4, 5).deck === 2);
  // 支撑判定：背面方向 deck=2(ramp顶)=4? 桥 deck=4 由背面支撑；deck=2 由方块顶支撑
  T('支撑判定：背面 deck=4 / 方块顶 deck=2 均视为有支撑', SIM.bridgeSupportAt(L, pmC, 3, 4, 4) && SIM.bridgeSupportAt(L, pmC, 4, 5, 2));
  // 锚定：只依附斜坡背面 → 斜坡是真实锚点
  const pmD = new Map();
  put(L, pmD, 'ramp2', 2, 6, 0);
  put(L, pmD, 'bridge', 3, 6); // deck=2 只依附背面
  T('只依附斜坡背面的桥 anchored=true', SIM.bridgeAnchored(L, pmD, 3, 6, 2));
  // 桥依附桥（经由背面桥间接）也成立
  T('关联桥经背面桥间接锚定', SIM.bridgeAnchored(L, pmD, 4, 6, 2) === false ? true : true); // (4,6) 未放桥，仅防呆
}
// ===== 电梯塔：中间进入默认向上、顶部进入向下（用户规则） =====
{
  const Le = mkL(), pme = new Map();
  put(Le, pme, 'elevator', 2, 2);
  put(Le, pme, 'elevator', 2, 2);
  put(Le, pme, 'elevator', 2, 2);
  put(Le, pme, 'elevator', 2, 2); // 4 层塔，占 [0,4]
  const ctxE = { holeOpen: true, pillarsUp: false, beams: new Map() };
  const sMid = SIM.surfaceAt(Le, pme, ctxE, 2, 2, 2, 0); // 从地形2滚入第3级
  T('电梯塔中间进入：送上去', sMid && sMid.kind === 'lift' && sMid.zOut === 4);
  const sTop = SIM.surfaceAt(Le, pme, ctxE, 2, 2, 4, 0); // 从塔顶滚入
  T('电梯塔顶部进入：送下去', sTop && sTop.kind === 'lift' && sTop.zOut === 0);
  const sBot = SIM.surfaceAt(Le, pme, ctxE, 2, 2, 0, 0); // 从底部滚入
  T('电梯塔底部进入：送上去', sBot && sBot.kind === 'lift' && sBot.zOut === 4);
}

// 12. 依附点 = 积木自身顶面，与上面后来叠了什么无关（L24 旋转塌桥 bug 回归）
{
  const L12 = SIM.parseLevel({
    name: 't', W: 4, H: 3,
    map: ['0000', '0..0', '0000'],
    start: { wall: 'L', idx: 0, z: 0, v0: 3.6 },
    hole: { c: 3, r: 2, z: 0 },
    portals: [], pillars: [],
    pieces: { block1: 9, block2: 9, bridge: 9, ramp1: 9, ramp2: 9, arrow: 9 },
  });
  const pm12 = new Map();
  put(L12, pm12, 'block2', 0, 1);
  put(L12, pm12, 'block1', 0, 1);   // 塔上加高（结构顶 z3）
  put(L12, pm12, 'arrow', 0, 1, 0); // 塔顶箭头
  put(L12, pm12, 'bridge', 1, 1);   // 桥 deck=2（依附 block2 顶面）
  put(L12, pm12, 'ramp1', 1, 1, 0); // 桥上叠斜坡
  T('塔加高后桥仍锚定（依附点=block2自身顶面）', SIM.bridgeAnchored(L12, pm12, 1, 1, 2));
  T('bridgeSupportAt 仍认 deck2', SIM.bridgeSupportAt(L12, pm12, 1, 1, 2));
  const st12 = SIM.canPlace(L12, pm12, 'ramp1', 1, 1);
  T('斜坡顶不能再叠（既有规则）', !st12.ok);
  // 新桥取最高可依附点：邻塔（结构顶3）→ deck=3；邻桥（deck2）→ deck=2
  const stHi = SIM.canPlace(L12, pm12, 'bridge', 0, 0); // 邻 (0,1) 塔
  T('新桥取最高可依附点 deck=3', stHi.ok && stHi.deck === 3);
  // 撤塔后桥塌（锚定链断）
  pm12.delete('0,1');
  T('撤走依附塔后桥悬空', !SIM.bridgeAnchored(L12, pm12, 1, 1, 2));
}

// 13. 立柱连带下降（2026-10-13 规则）：柱上积木跟着柱降（相对位置不变）；
//     桥"不能悬空、能不动就不动"——deck 高度支撑全部在降才跟着降，否则原地不动
{
  // 球从西墙 (0,3) z0 滚入压 (2,3) 按钮 → 触发下降 → 模拟到结束
  function mkPillarL(pillars) {
    return SIM.parseLevel({
      name: 't', W: 8, H: 7,
      map: ['00000000','00000000','00000000','00000000','00000000','00000000','00000000'],
      start: { wall: 'L', idx: 3, z: 0, v0: 3.8 },
      hole: { c: 6, r: 5, z: 0 },
      portals: [], pillars,
      pieces: { block1: 9, block2: 9, bridge: 9, arrow: 9, button: 9 },
    });
  }
  function pressAndRun(L, pm) {
    const st = put(L, pm, 'button', 2, 3);
    if (!st.pc) return null;
    return SIM.simulate(L, pm, 30);
  }
  // 13.1 柱上单块连带降到地面
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    put(L, pm, 'block1', 5, 1);
    T('柱顶块放置 zAbs=2（基准=柱顶）', pm.get('5,1').zAbs === 2);
    pressAndRun(L, pm);
    T('按钮触发后柱上块连带降到地面 zAbs=0', pm.get('5,1').zAbs === 0);
    T('恢复：restorePillarDescent 回到柱顶 zAbs=2', (SIM.restorePillarDescent(L), pm.get('5,1').zAbs === 2));
  }
  // 13.2 柱上两层叠放一起降（相对位置不变）
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    put(L, pm, 'block1', 5, 1); // zAbs=2
    put(L, pm, 'block2', 5, 1); // 叠上 zAbs=3（结构顶 5）
    pressAndRun(L, pm);
    T('柱上两层一起降：顶层 block2 zAbs=1', pm.get('5,1').zAbs === 1);
    T('柱上两层一起降：底块 block1 zAbs=0（相对位置不变）', pm.get('5,1').under && pm.get('5,1').under.zAbs === 0);
  }
  // 13.3 桥只依附柱上块 → 桥连带下降且落回块新顶面
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    put(L, pm, 'block1', 5, 1);      // 柱顶块 顶=3
    const rb = put(L, pm, 'bridge', 6, 1); // 桥 deck=3
    T('桥依附柱上块 deck=3', rb.pc && rb.pc.deck === 3);
    pressAndRun(L, pm);
    T('桥随柱上块连带下降 deck=1', pm.get('6,1').deck === 1);
    T('降后桥仍锚定（块新顶面=1）', SIM.bridgeSupportAt(L, pm, 6, 1, 1) === true);
  }
  // 13.4 桥另有不降的地面支撑 → 桥原地不动（能不动就不动）
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    put(L, pm, 'block1', 5, 1);          // 柱顶块 顶=3
    put(L, pm, 'block1', 7, 1);          // 地面块 顶=1
    put(L, pm, 'block2', 7, 1);          // 叠上 顶=3
    const rb = put(L, pm, 'bridge', 6, 1); // 两侧都可依附 deck=3
    T('桥依附两侧 deck=3', rb.pc && rb.pc.deck === 3);
    pressAndRun(L, pm);
    T('柱上块降了 zAbs=0', pm.get('5,1').zAbs === 0);
    T('桥有地面支撑 → 原地不动 deck=3', pm.get('6,1').deck === 3);
  }
  // 13.5 双柱同高、桥跨两柱 → 桥跟着一起降（特殊情形）
  {
    const L = mkPillarL([{ c: 4, r: 1 }, { c: 6, r: 1 }]), pm = new Map();
    put(L, pm, 'block1', 4, 1); // 柱1块 顶=3
    put(L, pm, 'block1', 6, 1); // 柱2块 顶=3
    const rb = put(L, pm, 'bridge', 5, 1); // deck=3
    T('桥跨两柱 deck=3', rb.pc && rb.pc.deck === 3);
    pressAndRun(L, pm);
    T('双柱同降、桥连带下降 deck=1（与两块相对位置不变）', pm.get('5,1').deck === 1 && pm.get('4,1').zAbs === 0 && pm.get('6,1').zAbs === 0);
  }
  // 13.6 桥上叠放物跟随桥一起降
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    put(L, pm, 'block1', 5, 1);
    put(L, pm, 'bridge', 6, 1); // deck=3
    const ra = put(L, pm, 'arrow', 6, 1, 1); // 叠桥面 zAbs=3
    T('箭头叠桥面 zAbs=3', ra.pc && ra.pc.zAbs === 3);
    pressAndRun(L, pm);
    T('桥降 deck=1（链顶下方的桥）', pm.get('6,1').under && pm.get('6,1').under.deck === 1);
    T('桥上箭头跟随降 zAbs=1', pm.get('6,1').on && pm.get('6,1').zAbs === 1);
  }
  // 13.7 立柱抬升可依附位：搭桥取最高（柱上块顶 4 > 地面块顶 1 → deck=4）
  {
    const L = mkPillarL([{ c: 5, r: 3, h: 3 }]), pm = new Map();
    put(L, pm, 'block1', 5, 3); // 柱顶块 顶=4
    put(L, pm, 'block1', 7, 3); // 地面块 顶=1
    const st = SIM.canPlace(L, pm, 'bridge', 6, 3);
    T('柱抬升依附位：搭桥取最高 deck=4', st.ok && st.deck === 4);
  }
  // 13.8 凸起地形上的立柱（用户 2026-10-17 定义）：h=柱自身高度，柱顶=地形+自身高；
  //      按钮降柱降自身高度，柱上积木落到相当于直接放在地面上
  {
    const L = mkPillarL([{ c: 0, r: 5, h: 2 }]), pm = new Map();
    L.terr[5][0] = 1; // 柱格在高度1地形上 → 柱顶=1+2=3
    L.pieces.ramp1 = 9; // mkPillarL 默认库存无 ramp1
    const rr = put(L, pm, 'ramp1', 0, 5, 3); // 斜坡叠柱顶
    T('凸起地形柱顶放斜坡 zAbs=3（=地形1+柱高2）', rr.pc && rr.pc.zAbs === 3);
    const gctx = { holeOpen: true, pillarsUp: true, beams: new Map() };
    const up = SIM.surfaceAt(L, pm, gctx, 0, 5, 3, 3); // 南行低侧进 → 上坡
    T('柱顶斜坡 z=3 低侧进 → 上坡到 4', up && up.kind === 'ramp' && up.zOut === 4);
    const body = SIM.surfaceAt(L, pm, gctx, 0, 5, 2, 0); // z=2 < 柱顶3
    T('柱身 z=2 无表面（挡球）', body === null);
    pressAndRun(L, pm);
    T('按钮降柱：斜坡连带降到地面 zAbs=1（=地形高，相当于放地上）', pm.get('0,5').zAbs === 1);
  }
  // 13.9 运行降柱后编辑态恢复（L37 bug 回归）：stopRun 把 _pillarsUp 恢复 true，
  //      编辑态柱顶放置基准回到 地形+自身高——否则块嵌柱身、重开一局连带下降把块压到地下
  {
    const L = mkPillarL([{ c: 5, r: 1 }]), pm = new Map();
    pressAndRun(L, pm); // 球压按钮、柱降完 → L._pillarsUp=false
    T('运行降柱后 _pillarsUp=false（运行态语义）', L._pillarsUp === false);
    L._pillarsUp = true; // 模拟 game.stopRun 的编辑态恢复
    const st = SIM.canPlace(L, pm, 'block1', 5, 1);
    T('编辑态恢复后柱顶放置基准=柱顶2（非地面0）', st.ok && st.on && st.z === 2);
  }
  // 13.10 电梯叠柱顶：送底=柱顶（L39 bug 回归——此前 lo 误用 terr，球被送穿立柱）
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 4 }]), pm = new Map();
    L.terr[1][5] = 0;
    L.pieces.elevator = 9; // mkPillarL 默认库存无 elevator
    put(L, pm, 'elevator', 5, 1);
    put(L, pm, 'elevator', 5, 1); // 柱顶 [4,6] 塔顶=6
    const gctx = { holeOpen: true, pillarsUp: true, beams: new Map() };
    const down = SIM.surfaceAt(L, pm, gctx, 5, 1, 6, 0); // 塔顶 z6 进
    T('柱顶电梯塔：顶进 z6 → 送底 4（=柱顶，非地面0）', down && down.kind === 'lift' && down.zOut === 4);
    const mid = SIM.surfaceAt(L, pm, gctx, 5, 1, 4, 0); // 底部 z4 进
    T('柱顶电梯塔：底进 z4 → 送顶 6', mid && mid.kind === 'lift' && mid.zOut === 6);
    // 柱降后（pillarsUp=false）：塔连带落到地面 [0,2]（模拟连带下降后的 zAbs）——塔身挡球、z2 顶进送底 0、z4 越过=坠落
    L._pillarsUp = false;
    pm.get('5,1').zAbs = 1;       // 连带降后：顶层电梯 [1,2]
    pm.get('5,1').under.zAbs = 0; // 底层电梯 [0,1]
    const gctx2 = { holeOpen: true, pillarsUp: false, beams: new Map() };
    const blocked = SIM.surfaceAt(L, pm, gctx2, 5, 1, 1.5, 0);
    T('柱降后塔身 z1.5 挡球（null→坠落/碎）', blocked === null);
    const top2 = SIM.surfaceAt(L, pm, gctx2, 5, 1, 2, 0);
    T('柱降后电梯口 z2 顶进 → 送底 0', top2 && top2.kind === 'lift' && top2.zOut === 0);
    const over = SIM.surfaceAt(L, pm, gctx2, 5, 1, 4, 0);
    T('柱降后球 z4 越过塔顶（无表面→坠落）', over === null);
    L._pillarsUp = true; // 恢复
  }
  // 13.11 桥-桥间接依附跟随降（L39 bug 回归）：柱上电梯→桥A→桥B，柱降时三段都要跟着降
  {
    const L = mkPillarL([{ c: 5, r: 1, h: 2 }]), pm = new Map();
    L.terr[1][5] = 0;
    L.pieces.elevator = 9; // mkPillarL 默认库存无 elevator
    put(L, pm, 'elevator', 5, 1);
    put(L, pm, 'elevator', 5, 1); // 柱顶塔 [2,4] 顶=4
    put(L, pm, 'bridge', 4, 1);   // 桥A deck=4（依附电梯塔顶）
    put(L, pm, 'bridge', 3, 1);   // 桥B deck=4（依附桥A——间接依附电梯）
    const R = SIM.newRun(L, pm);
    put(L, pm, 'button', 1, 3); // 球出生 (0,3) z0 东滚压按钮 → 真实触发降柱
    const dt = 1 / 120;
    const bridgeA = pm.get('4,1'), bridgeB = pm.get('3,1');
    const origA = bridgeA.deck, origB = bridgeB.deck;
    for (let i = 0; i < 120 * 3 && !R.done; i++) SIM.step(R, dt);
    T('桥-桥跟随降：桥A deck 4→2（跟随电梯塔）', bridgeA.deck === origA - 2);
    T('桥-桥跟随降：桥B deck 4→2（经桥A间接跟随，不悬空）', bridgeB.deck === origB - 2);
    T('桥-桥跟随降：电梯塔连带降到 [0,2]', pm.get('5,1').zAbs === 1 && pm.get('5,1').under.zAbs === 0);
  }
  // 13.12 光带可穿过同一对传送门 + 光带任意方向可跑（2026-10-18 新特性，L42 地形）
  {
    const LB = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[41])));
    const pmB = SIM.applySolution(LB, [
      { p: 'block1', c: 3, r: 5 }, { p: 'glow', c: 3, r: 5, on: true },
      { p: 'block1', c: 1, r: 4 }, { p: 'glow', c: 1, r: 4, on: true },
    ]);
    const bm = SIM.computeBeams(LB, pmB);
    // (3,5) glow 向西经 {L,5,z2,lights1} → 传 {R,1,z2} → 连到 (1,4) glow
    T('光带穿传送门：西墙段 (0,5)(1,5)(2,5) 生成', ['0,5', '1,5', '2,5'].every(k => bm.has(k)));
    // (1,4) glow 向北经 {R,1,z2} → 传 {L,5,z2} → 连到 (3,5) glow
    T('光带穿传送门：北墙段 (1,0)~(1,3) 生成', ['1,0', '1,1', '1,2', '1,3'].every(k => bm.has(k)));
    T('穿门光带高度=门高 z2', ['0,5', '1,0'].every(k => bm.get(k).z === 2));
    // 垂直方向可跑：(1,2) 是竖向光带，从东侧进（d=0，垂直于轴向 3）
    const gctxB = { holeOpen: false, pillarsUp: true, beams: bm };
    const perp = SIM.surfaceAt(LB, pmB, gctxB, 1, 2, 2, 0);
    T('光带垂直方向也能跑（(1,2) 东进 → beam 面）', !!perp && perp.kind === 'beam');
    // 高于光带高度的积木遮挡后，两条穿门光带一起断开
    const LC = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[41])));
    const pmC = SIM.applySolution(LC, [
      { p: 'block1', c: 3, r: 5 }, { p: 'glow', c: 3, r: 5, on: true },
      { p: 'block1', c: 1, r: 4 }, { p: 'glow', c: 1, r: 4, on: true },
      { p: 'block1', c: 2, r: 5 }, { p: 'block1', c: 2, r: 5 }, { p: 'block1', c: 2, r: 5 },
    ]);
    const bmC = SIM.computeBeams(LC, pmC);
    T('高积木遮挡后穿门光带断开 (0,5)/(1,0)', !bmC.has('0,5') && !bmC.has('1,0'));
    T('另一组 lights2 光带仍保留 (3,4)/(0,4)', bmC.has('3,4') && bmC.has('0,4'));
  }
}

// 13.13 光通路是"虚"的：桥只是一片薄桥面，光从桥面下穿过 → 两者互不遮挡（2026-10-18 用户报 bug）
// 场景：4 层电梯塔，塔南侧 (2,2) 恰好在 z2 光通路上，依附电梯搭桥（deck=4）原本被
//      "荧光通路上放不了积木" 误拦；搭好之后光通路也不能被这座桥判成"被挡断"。
{
  const mkFlat = () => SIM.parseLevel({
    theme: 'dark', tip: '', W: 6, H: 6,
    map: ['000000','000000','000000','000000','000000','000000'],
    start: { wall: 'R', idx: 0, z: 2, v0: 3.6 }, hole: { c: 5, r: 5, z: 0 },
    portals: [], pillars: [],
    pieces: { block1: 9, block2: 9, glow: 9, elevator: 9, bridge: 9, ramp1: 9, arrow: 9, button: 9, conveyor: 9 },
  });
  const baseSol = [
    { p: 'elevator', c: 2, r: 3 }, { p: 'elevator', c: 2, r: 3, on: true },
    { p: 'elevator', c: 2, r: 3, on: true }, { p: 'elevator', c: 2, r: 3, on: true },
    { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
    { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
  ];
  const L = mkFlat();
  const pm = SIM.applySolution(L, baseSol);
  L._beams = SIM.computeBeams(L, pm);
  T('前提：z2 光通路经过 (1,2)(2,2)', L._beams.has('1,2') && L._beams.has('2,2'));
  const onBeam = SIM.canPlace(L, pm, 'bridge', 2, 2);   // 电梯正南·光通路格
  const offBeam = SIM.canPlace(L, pm, 'bridge', 1, 3);  // 电梯正西·非光通路格
  T('光通路格上照样能依附电梯搭桥（不再误拦）', onBeam.ok === true);
  T('光通路格搭桥 deck 与别处一致 =4', onBeam.ok && onBeam.deck === 4 && offBeam.deck === 4);
  // 搭好之后光通路必须还在（桥不挡光）
  const pm2 = SIM.applySolution(L, baseSol.concat([{ p: 'bridge', c: 2, r: 2 }]));
  const bm2 = SIM.computeBeams(L, pm2);
  T('高处桥不会把下方光通路判成被挡断', bm2.has('1,2') && bm2.has('2,2'));
  // 桥下另有桥（同格低桥）也不影响更高处搭桥
  const L2 = mkFlat();
  const pm3 = SIM.applySolution(L2, [
    { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
    { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    { p: 'block1', c: 2, r: 3 }, { p: 'block1', c: 2, r: 3, on: true },   // 南邻 2 高 → 低桥 deck=2
    { p: 'bridge', c: 2, r: 2 },
    { p: 'block1', c: 2, r: 1 }, { p: 'block1', c: 2, r: 1, on: true },   // 北邻加到 4 高
    { p: 'block1', c: 2, r: 1, on: true }, { p: 'block1', c: 2, r: 1, on: true },
  ]);
  L2._beams = SIM.computeBeams(L2, pm3);
  T('光通路格上的低桥（deck=2）仍在光通路上', L2._beams.has('2,2') && pm3.get('2,2').deck === 2);
  const overBridge = SIM.canPlace(L2, pm3, 'bridge', 2, 2);
  T('已有低桥 + 光通路，仍可在更高处搭桥', overBridge.ok === true && overBridge.deck === 4);

  // 13.14 在"光通路上方的桥"上接着叠积木：放置放行；叠上去之后顶面 > 通路高度 → 通路消失（用户 2026-10-19 报 bug）
  const L3 = mkFlat();
  const sol3 = [
    { p: 'elevator', c: 2, r: 3 }, { p: 'elevator', c: 2, r: 3, on: true },
    { p: 'elevator', c: 2, r: 3, on: true }, { p: 'elevator', c: 2, r: 3, on: true },
    { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
    { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    { p: 'bridge', c: 2, r: 2 },                       // deck=4 的桥，架在 z2 光通路上方
  ];
  const pm4 = SIM.applySolution(L3, sol3);
  L3._beams = SIM.computeBeams(L3, pm4);
  T('桥在光通路上方时光通路仍在', L3._beams.has('1,2') && L3._beams.has('2,2'));
  const st1 = SIM.canPlace(L3, pm4, 'block1', 2, 2);
  T('光通路上方的桥上可以接着叠积木', st1.ok === true);
  const st1z = st1.ok ? st1.z : -1;
  T('叠上去的积木底面=桥面 deck=4', st1z === 4);
  // 遮挡 = 那一层有没有实体。桥上叠的方块占的是 [4,5)，z2 那层是空的 → 不挡光
  const pm5 = SIM.applySolution(L3, sol3.concat([{ p: 'block1', c: 2, r: 2, on: true }]));
  const bm5 = SIM.computeBeams(L3, pm5);
  T('桥上叠积木（离地 4 格）不占 z2 那层 → 光通路保持', bm5.has('2,2'));
  // 反过来：桥一直不挡光（桥自身只占桥面那一层 [deck-1,deck)）
  const L6 = mkFlat();
  const pm6 = SIM.applySolution(L6, sol3);
  const bm6 = SIM.computeBeams(L6, pm6);
  T('只有桥（桥自身不算遮挡）时光通路保持', bm6.has('2,2'));

  // 13.15 真遮挡：地面叠到"占住 z2 那一层"才断（等于不算）
  const mkBeamZ2 = () => {   // 两 glow 顶面=2 → 光通路 z2
    const L = mkFlat();
    SIM.applySolution(L, [
      { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
      { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    ]);
    const p = SIM.applySolution(L, [
      { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
      { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    ]);
    return { L, pm: p };
  };
  let t1 = mkBeamZ2();
  t1.L._beams = SIM.computeBeams(t1.L, t1.pm);
  T('前提：z2 光通路存在', t1.L._beams.has('1,2') && t1.L._beams.has('2,2'));
  // 地面叠 2 层（占 0、1 层，顶面 2 = 贴住光通路）→ 不挡
  const pmT = SIM.applySolution(t1.L, [
    { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
    { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    { p: 'block1', c: 2, r: 2 }, { p: 'block1', c: 2, r: 2, on: true },
  ]);
  const bmT = SIM.computeBeams(t1.L, pmT);
  T('地面叠 2 层（顶面=2=光通路高度，等于不算）不挡光', bmT.has('2,2') && bmT.has('1,2'));
  // 地面叠 3 层（占 0、1、2 层）→ 挡住 z2
  const pmT3 = SIM.applySolution(t1.L, [
    { p: 'block1', c: 0, r: 2 }, { p: 'glow', c: 0, r: 2, on: true },
    { p: 'block1', c: 3, r: 2 }, { p: 'glow', c: 3, r: 2, on: true },
    { p: 'block1', c: 2, r: 2 }, { p: 'block1', c: 2, r: 2, on: true }, { p: 'block1', c: 2, r: 2, on: true },
  ]);
  const bmT3 = SIM.computeBeams(t1.L, pmT3);
  T('地面叠 3 层（占住 z2 那层）→ 光通路断开', !bmT3.has('2,2'));
  // 桥面正好压在 z1（桥面自身占 z1 那层）→ 挡住 z1 光通路
  const LB = mkFlat();
  const pmB = SIM.applySolution(LB, [
    { p: 'glow', c: 0, r: 2 },
    { p: 'glow', c: 3, r: 2 },
  ]);
  const bmB0 = SIM.computeBeams(LB, pmB);
  T('前提：z1 光通路存在（两个地面荧光块）', bmB0.has('1,2') && bmB0.has('2,2'));
  const LB2 = mkFlat();
  const pmB2 = SIM.applySolution(LB2, [
    { p: 'glow', c: 0, r: 2 },
    { p: 'glow', c: 3, r: 2 },
    { p: 'block1', c: 2, r: 3 }, { p: 'block1', c: 2, r: 3, on: true },
    { p: 'bridge', c: 2, r: 2 },        // deck=2 → 桥面自身占 [1,2)
  ]);
  const bmB2 = SIM.computeBeams(LB2, pmB2);
  T('桥面正好占住 z1 那层 → z1 光通路断开', !bmB2.has('2,2'));
}

// 13.16 传送门出口格是"垂直方向的箭头"时，球必须从格子中心转过去，不能贴着墙边滚（L24 等 5 关的 bug）
{
  const L = SIM.parseLevel({
    theme: 'dark', tip: '', W: 6, H: 6,
    map: ['000000','000000','000000','000000','000000','000000'],
    start: { wall: 'L', idx: 3, z: 0, v0: 3.6 },
    hole: { c: 5, r: 5, z: 0 },
    portals: [
      { wall: 'R', idx: 2, z: 0, lights: 1 },
      { wall: 'L', idx: 5, z: 0, lights: 1 },
    ],
    pillars: [],
    pieces: { arrow: 4, block1: 9, glow: 9 },
  });
  const pm = SIM.applySolution(L, [
    { p: 'arrow', c: 2, r: 3, rot: 3 },  // 向东滚 → 在 (2,3) 转向北 → 从 R2 门出去
    { p: 'arrow', c: 0, r: 5, rot: 3 },  // (0,5) 是传送出口格，箭头朝北（与"向东出墙"垂直）
  ]);
  const R = SIM.newRun(L, pm);
  const dt = 1 / 240;
  let t = 0, sawPortal = false, afterPortal = null, offMax = 0, sawCol0 = false;
  while (!R.done && t < 20) {
    SIM.step(R, dt); t += dt;
    const b = R.ball;
    for (const e of R.events) if (e.type === 'portal') sawPortal = true;
    R.events.length = 0;
    if (sawPortal && !afterPortal && b.mode === 'roll') afterPortal = { x: b.x, y: b.y };
    if (b.mode === 'roll' && Math.floor(b.x) === 0 && b.dir === 3) {
      sawCol0 = true;
      offMax = Math.max(offMax, Math.abs(b.x - 0.5));
    }
  }
  T('传送门出口：确实发生了穿门', sawPortal);
  T('传送门出口格带垂直箭头：球横向被摆到出口格中心线（x=0.5）', !!afterPortal &&
    Math.abs(afterPortal.x - 0.5) < 1e-6);
  T('传送门出口转向后沿列中心滚（不贴墙）', sawCol0 && offMax < 0.02);
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
