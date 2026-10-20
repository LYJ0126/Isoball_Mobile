const SIM = require('../www/js/sim.js');
function mk(pieces) {
  return SIM.parseLevel({ theme:'dark', tip:'', W:6, H:6,
    map:['000000','000000','000000','000000','000000','000000'],
    start:{wall:'R',idx:0,z:2,v0:3.6}, hole:{c:5,r:5,z:0},
    portals:[], pillars:[],
    pieces: Object.assign({block1:9,block2:9,glow:9,elevator:9,bridge:9,ramp1:9,arrow:9,button:9,conveyor:9}, pieces||{}) });
}
const base = [
  {p:'elevator',c:2,r:3},{p:'elevator',c:2,r:3,on:true},{p:'elevator',c:2,r:3,on:true},{p:'elevator',c:2,r:3,on:true},
  {p:'block1',c:0,r:2},{p:'glow',c:0,r:2,on:true},
  {p:'block1',c:3,r:2},{p:'glow',c:3,r:2,on:true},
];
let L = mk(), pm = SIM.applySolution(L, base);
console.log('电梯塔 structureTop =', SIM.structureTop(L, pm.get('2,3'), 2, 3));
L._beams = SIM.computeBeams(L, pm);
console.log('光通路格 =', [...L._beams.keys()].map(k=>k+'(z'+L._beams.get(k).z+')').join(' '));

for (const [c,r,note] of [[2,2,'电梯正南·在光通路上'],[1,3,'电梯正西·不在光通路上'],[3,3,'电梯正东·不在光通路上']]) {
  const st = SIM.canPlace(L, pm, 'bridge', c, r);
  console.log(`(${c},${r}) ${note} -> ok=${st.ok}${st.ok?' deck='+st.deck:' why='+st.why}`);
}

// ---- 搭桥后光通路不应被桥挡断 ----
L._beams = SIM.computeBeams(L, pm);
console.log('\n[搭桥前] 光通路 =', [...L._beams.keys()].join(' '));
const pm2 = SIM.applySolution(L, base.concat([{p:'bridge',c:2,r:2}]));
L._beams = SIM.computeBeams(L, pm2);
console.log('[搭桥后] 光通路 =', [...L._beams.keys()].join(' ') || '(空)');
console.log('桥 deck =', pm2.get('2,2').deck);

// ---- 桥下已有桥 + 光通路，仍能在更高处搭桥 ----
const L2 = mk(); 
const base2 = [
  {p:'block1',c:0,r:2},{p:'glow',c:0,r:2,on:true},
  {p:'block1',c:3,r:2},{p:'glow',c:3,r:2,on:true},
  {p:'block1',c:2,r:4},{p:'block1',c:2,r:4,on:true},          // 塔底 2 高
  {p:'bridge',c:2,r:2},                                        // 低桥 deck=2
];
const pm3 = SIM.applySolution(L2, base2);
L2._beams = SIM.computeBeams(L2, pm3);
console.log('\n低桥 deck =', pm3.get('2,2').deck, ' 光通路 =', [...L2._beams.keys()].join(' '));
