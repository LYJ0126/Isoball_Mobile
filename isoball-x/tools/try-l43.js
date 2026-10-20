const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
const sol = [
  // (1,2) 电梯塔：block2 + 4 层 = 顶 6
  { p:'block2', c:1, r:2 }, { p:'elevator', c:1, r:2, on:true }, { p:'elevator', c:1, r:2, on:true },
  { p:'elevator', c:1, r:2, on:true }, { p:'elevator', c:1, r:2, on:true },
  // (5,0) 电梯塔：block2 + 6 层 = 顶 8
  { p:'block2', c:5, r:0 }, { p:'elevator', c:5, r:0, on:true }, { p:'elevator', c:5, r:0, on:true },
  { p:'elevator', c:5, r:0, on:true }, { p:'elevator', c:5, r:0, on:true },
  { p:'elevator', c:5, r:0, on:true }, { p:'elevator', c:5, r:0, on:true },
  // (0,2) 桥 deck=6（依附 (1,2) 塔顶）+ 桥上 ramp2 rot2（hi=8 → 接 L2@z8）
  { p:'bridge', c:0, r:2 }, { p:'ramp2', c:0, r:2, on:true, rot:2 },
  // (0,0) block1 + glow(顶2) + ramp2 rot3（hi=4 → 接出生 z4）
  { p:'block1', c:0, r:0 }, { p:'glow', c:0, r:0, on:true }, { p:'ramp2', c:0, r:0, on:true, rot:3 },
  // (0,4) block1 + glow(顶2) + 箭头西
  { p:'block1', c:0, r:4 }, { p:'glow', c:0, r:4, on:true }, { p:'arrow', c:0, r:4, on:true, rot:2 },
  // (0,5) 立柱 + glow + ramp1 rot2（降柱后 lo1→hi2 → 接 L5@z2）
  { p:'glow', c:0, r:5, on:true }, { p:'ramp1', c:0, r:5, on:true, rot:2 },
  // (1,3) block1 + ramp1 rot2（lo1→hi2，向西接 z2 光桥）
  { p:'block1', c:1, r:3 }, { p:'ramp1', c:1, r:3, on:true, rot:2 },
  // (2,2) block1 + glow(顶2) + 按钮
  { p:'block1', c:2, r:2 }, { p:'glow', c:2, r:2, on:true }, { p:'button', c:2, r:2, on:true },
  // (2,3) 传送带向西（地面，顶1）
  { p:'conveyor', c:2, r:3, rot:2 },
  // (3,3) 地面 glow(顶1) + 箭头西
  { p:'glow', c:3, r:3 }, { p:'arrow', c:3, r:3, on:true, rot:2 },
  // (3,5) 地面 glow(顶1) + 箭头北
  { p:'glow', c:3, r:5 }, { p:'arrow', c:3, r:5, on:true, rot:3 },
  // (5,1) block1 + 传送带向北（顶2）
  { p:'block1', c:5, r:1 }, { p:'conveyor', c:5, r:1, on:true, rot:3 },
  // (5,2) block1 + glow(顶2) + 箭头北
  { p:'block1', c:5, r:2 }, { p:'glow', c:5, r:2, on:true }, { p:'arrow', c:5, r:2, on:true, rot:3 },
];
const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[42])));
let pm;
try { pm = SIM.applySolution(L, sol); } catch (e) { console.log('APPLY FAIL:', e.message); process.exit(1); }
L._beams = SIM.computeBeams(L, pm);
console.log('编辑态光通路:', [...L._beams.keys()].map(k=>k+'(z'+L._beams.get(k).z+')').join(' ') || '(空)');
const R = SIM.newRun(L, pm);
const dt = 1/120; let t = 0, lastCell = '', lastZ = R.ball.z, lastBeams = ''; const out = [];
while (!R.done && t < 30) {
  SIM.step(R, dt); t += dt;
  const b = R.ball, cell = Math.floor(b.x) + ',' + Math.floor(b.y);
  const nb = [...R.ctx.beams.keys()].sort().join(' ');
  if (cell !== lastCell || Math.abs(b.z - lastZ) > 0.12 || R.events.length || nb !== lastBeams) {
    let line = `t=${t.toFixed(2)} ${cell} z=${b.z.toFixed(2)} d=${b.dir}`;
    if (R.events.length) { line += '  EVT:' + R.events.map(e=>e.type+(e.reason?':'+e.reason:'')).join('|'); R.events.length = 0; }
    if (nb !== lastBeams) { line += '  ⟐光通路:' + (nb || '(空)'); lastBeams = nb; }
    out.push(line); lastCell = cell; lastZ = b.z;
  }
}
console.log(out.join('\n'));
console.log('FINAL:', R.result, ' t=' + t.toFixed(2), ' pos=', R.ball.x.toFixed(2), R.ball.y.toFixed(2), 'z=', R.ball.z.toFixed(2));
