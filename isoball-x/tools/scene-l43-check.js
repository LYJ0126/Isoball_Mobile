const SIM = require('../www/js/sim.js');
const L = SIM.parseLevel({
  theme:'dark', tip:'', W:6, H:6,
  map:['000000','000000','000000','000000','000000','000000'],
  start:{wall:'R',idx:0,z:2,v0:3.6}, hole:{c:5,r:5,z:0}, portals:[], pillars:[],
  pieces:{block1:9,block2:9,glow:9,elevator:9,bridge:9,ramp1:9,ramp2:9,arrow:9,button:9,conveyor:9},
});
// 用户在 L43 的场景：电梯塔 5 层 + 塔顶搭桥（deck=5）+ 桥上再叠一个大斜坡 ramp2
const sol = [
  {p:'elevator',c:1,r:2},{p:'elevator',c:1,r:2,on:true},{p:'elevator',c:1,r:2,on:true},
  {p:'elevator',c:1,r:2,on:true},{p:'elevator',c:1,r:2,on:true},
  {p:'glow',c:0,r:0},{p:'glow',c:0,r:4},                 // z1 光通路，经过 (0,1)(0,2)(0,3)
  {p:'bridge',c:0,r:2},                                  // 桥上：依附塔顶 deck=5
  {p:'ramp2',c:0,r:2,on:true,rot:0},                     // 桥上叠 ramp2（占 5、6 层）
];
const pm = SIM.applySolution(L, sol);
L._beams = SIM.computeBeams(L, pm);
console.log('光通路格 =', [...L._beams.keys()].join(' ') || '(空)');
let chain = []; for (let q = pm.get('0,2'); q; q = q.under) chain.push(q);
console.log('(0,2) 叠放链 =', chain.map(q => q.type + '@' + (q.deck !== undefined ? 'deck' + q.deck : 'z' + q.zAbs)).join(' → '));
const br = chain.find(q => q.type === 'bridge');
console.log('桥 deck =', br && br.deck, '（桥面自身占 [' + ((br && br.deck) - 1) + ',' + (br && br.deck) + ') 这一层，光通路在 z1）');
console.log('ramp2 顶 =', pm.get('0,2').zAbs + 2);
console.log(L._beams.has('0,2') ? '✓ 高处桥梁+斜坡不挡地面光通路（符合"真遮挡"语义）' : '✗ 仍被误判为遮挡');
