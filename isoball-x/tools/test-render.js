// Node 端渲染链路测试：stub 2D context 记录调用，验证墙面/地形/积木坐标
global.window = { addEventListener() {} };
global.document = {
  getElementById() { return null; },
  createElement() { return { getContext() { return null; }, style: {}, appendChild() {} }; },
};
require('../www/js/render.js');
const Render = global.window.Render;
const SIM = require('../www/js/sim.js');
const LEVELS = require('../www/js/levels.js');
console.log('Render api:', Object.keys(Render || {}).join(','));

// stub context：只记录 path 点
function makeCtx() {
  const calls = [];
  let cur = null;
  const pt = (x, y) => { if (cur) cur.pts.push([x | 0, y | 0]); };
  return {
    calls,
    canvas: { clientWidth: 532, clientHeight: 300 },
    beginPath() { cur = { op: 'path', pts: [], fill: null, stroke: null }; calls.push(cur); },
    moveTo(x, y) { pt(x, y); },
    lineTo(x, y) { pt(x, y); },
    closePath() {},
    arc() {}, ellipse() {},
    fill() { if (cur) cur.fill = this.fillStyle; },
    stroke() { if (cur) cur.stroke = this.strokeStyle; },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h, fill: this.fillStyle }); },
    set fillStyle(v) { this._fs = v; }, get fillStyle() { return this._fs; },
    set strokeStyle(v) { this._ss = v; }, get strokeStyle() { return this._ss; },
    set globalAlpha(v) { this._ga = v; }, get globalAlpha() { return this._ga; },
    set lineWidth(v) { this._lw = v; }, get lineWidth() { return this._lw; },
    set lineCap(v) {}, set font(v) {}, set textAlign(v) {},
    set shadowColor(v) {}, set shadowBlur(v) {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, translate() {}, rotate() {},
    getImageData() { return { data: [0, 0, 0] }; },
  };
}

const src = LEVELS[0];
const L = SIM.parseLevel(JSON.parse(JSON.stringify(src)));
Render.fit(L, 532, 300);
console.log('cam:', JSON.stringify(Render.cam));

const ctx = makeCtx();
Render.drawAll(ctx, L, new Map(), null, {});
// 找墙 path（fill 为墙面色的）
const walls = ctx.calls.filter(c => c.fill === '#a3c437' || c.fill === '#93b52f');
console.log('wall paths:', walls.length);
walls.forEach(w => console.log(' ', w.fill, JSON.stringify(w.pts)));
// 地板
const floors = ctx.calls.filter(c => c.fill === '#b5d94b');
console.log('floor tiles:', floors.length, 'first:', JSON.stringify(floors[0] && floors[0].pts));
