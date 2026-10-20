// 光通路格上搭桥的回归验证（L43 报 bug）：
//  A) 电梯塔从 2 层到 8 层，依附塔顶在"光通路格"上搭桥都应放行，deck = 塔顶
//  B) 搭好之后光通路不能消失
//  C) 球在桥下的光通路上仍能滚动（四个方向都要有 surface）
const SIM = require('../www/js/sim.js');
const mk = () => SIM.parseLevel({
  theme:'dark', tip:'', W:6, H:6,
  map:['000000','000000','000000','000000','000000','000000'],
  start:{wall:'R',idx:0,z:2,v0:3.6}, hole:{c:5,r:5,z:0}, portals:[], pillars:[],
  pieces:{block1:9,block2:9,glow:9,elevator:9,bridge:9,ramp1:9,arrow:9,button:9,conveyor:9},
});
let pass = 0, fail = 0;
const T = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

for (let h = 2; h <= 8; h++) {
  const tower = [];
  for (let i = 0; i < h; i++) tower.push({ p:'elevator', c:2, r:3, on: i ? true : undefined });
  const glows = [
    {p:'block1',c:0,r:2},{p:'glow',c:0,r:2,on:true},
    {p:'block1',c:3,r:2},{p:'glow',c:3,r:2,on:true},
  ];
  const L = mk();
  const pm0 = SIM.applySolution(L, tower.concat(glows));
  L._beams = SIM.computeBeams(L, pm0);
  const beamOK = L._beams.has('2,2');
  const st = SIM.canPlace(L, pm0, 'bridge', 2, 2);   // 电梯正南，正好在光通路上
  T(`塔高 ${h}：光通路格上依附塔顶搭桥放行（deck=${st.ok ? st.deck : '拒绝'}，应=${h}）`,
    st.ok === true && st.deck === h);
  // 搭好之后
  const pm1 = SIM.applySolution(L, tower.concat(glows, [{ p:'bridge', c:2, r:2 }]));
  const bm = SIM.computeBeams(L, pm1);
  // 桥面自身占 [deck-1, deck) 这一层：只有 deck-1 == z2（即塔高 3）时桥面正压住光通路那一层，
  // 这时光通路才该断；桥在光通路下方（塔高 2）或上方（塔高 >=4）都不挡光
  const deckBlocks = (h - 1) === 2;
  T(`塔高 ${h}：搭桥后光通路${deckBlocks ? '应被桥面自身挡住（deck-1=z2）' : '仍在'}`,
    beamOK && (deckBlocks ? !bm.has('2,2') : (bm.has('1,2') && bm.has('2,2'))));
  // 球在桥下光通路上（deck 与 z2 间距 >=2 时才能过）
  const gctx = { holeOpen:true, pillarsUp:false, beams:bm };
  const s = SIM.surfaceAt(L, pm1, gctx, 2, 2, 2, 0);
  // 净空 = deck - 光束高度
  //   0 ：桥面与光通路重合，球踩在桥面上滚 —— 能过
  //   1 ：桥面正好压在球顶（桥下通行要求 deck >= 球底+2）—— 过不去
  //  >=2 ：标准桥下通行 —— 能过
  const clearance = h - 2;
  const wantPass = clearance !== 1;
  T(`塔高 ${h}：桥下通行判定符合规则（净空 ${clearance}，期望${wantPass ? '可过' : '过不去'}）`,
    wantPass ? (!!s && (s.kind === 'beam' || s.kind === 'flat')) : !s);
}
// deck 与光束等高（塔高=2）时桥面与光通路重合，球照样能过
{
  const L = mk();
  const tower = [{p:'elevator',c:2,r:3},{p:'elevator',c:2,r:3,on:true}];
  const glows = [
    {p:'block1',c:0,r:2},{p:'glow',c:0,r:2,on:true},
    {p:'block1',c:3,r:2},{p:'glow',c:3,r:2,on:true},
  ];
  const pm = SIM.applySolution(L, tower.concat(glows, [{ p:'bridge', c:2, r:2 }]));
  L._beams = SIM.computeBeams(L, pm);
  const s = SIM.surfaceAt(L, pm, { holeOpen:true, pillarsUp:false, beams:L._beams }, 2, 2, 2, 0);
  T('桥面与光束等高时球照样能过（deck==z）', !!s);
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
