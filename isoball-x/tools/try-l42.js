const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
const sol = [
  { p:'block1', c:0, r:0 },
  { p:'conveyor', c:0, r:0, on:true, rot:1 },
  { p:'block1', c:0, r:1 },
  { p:'conveyor', c:0, r:1, on:true, rot:1 },
  { p:'block1', c:0, r:2 },
  { p:'glow', c:0, r:2, on:true },
  { p:'button', c:0, r:2, on:true },
  { p:'block1', c:0, r:5 },
  { p:'glow', c:0, r:5, on:true },
  { p:'arrow', c:0, r:5, on:true, rot:2 },
  { p:'block1', c:1, r:4 },
  { p:'glow', c:1, r:4, on:true },
  { p:'arrow', c:1, r:4, on:true, rot:2 },
  { p:'glow', c:3, r:0 },
  { p:'ramp1', c:3, r:0, on:true, rot:3 },
  { p:'glow', c:3, r:3, on:true },
  { p:'arrow', c:3, r:3, on:true, rot:0 },
  { p:'glow', c:5, r:3 },
  { p:'arrow', c:5, r:3, on:true, rot:1 },
  { p:'ramp1', c:5, r:4, rot:3 },
];
const L = SIM.parseLevel(JSON.parse(JSON.stringify(LEVELS[41])));
let pm;
try { pm = SIM.applySolution(L, sol); } catch(e) { console.log('APPLY FAIL:', e.message); process.exit(1); }
L._beams = SIM.computeBeams(L, pm);
console.log('初始光通路:', [...L._beams.keys()].map(k=>k+'(z'+L._beams.get(k).z+')').join(' '));
const R = SIM.newRun(L, pm);
const dt=1/120; let t=0; let lastZ = R.ball.z, lastCell='';
const path=[];
while(!R.done && t<40){ SIM.step(R,dt); t+=dt;
  const b=R.ball; const cell = Math.floor(b.x)+','+Math.floor(b.y);
  if(cell!==lastCell || Math.abs(b.z-lastZ)>0.05){
    path.push(`t=${t.toFixed(2)} ${cell} z=${b.z.toFixed(2)} d=${b.dir} st=${b.status}`);
    if(R.events.length){ path[path.length-1]+='  EVT:'+R.events.map(e=>e.type+(e.reason?':'+e.reason:'')).join('|'); R.events.length=0; }
    lastCell=cell; lastZ=b.z;
  }
}
console.log(path.join('\n'));
console.log('FINAL:', R.result, ' t='+t.toFixed(2));
