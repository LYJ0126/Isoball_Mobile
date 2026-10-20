/* Isoball X 重制版 — 等距渲染引擎（四视角）
 * 坐标系：c 向东 r 向南 z 层高；等距 2:1（TW=72, TH=36, ZH=34）
 * 视角：0=SE默认(可见E+S面,墙L+R) 1=SW正视右墙(可见W+S,墙R) 2=NE正视左墙(可见E+N,墙L) 3=俯视(无墙无侧面)
 * 墙：西墙(L, c=0 平面, idx=r) / 北墙(R, r=0 平面, idx=c)
 * 每帧全量重绘：背景 → 背景墙(砖纹/拱门/灯) → 绘制队列(地形/洞/立柱/积木/球, 按 keyOf 排序) → 粒子/幽灵
 */
window.Render = (function () {
  'use strict';
  const TW = 72, TH = 36, ZH = 34;      // 格宽/格高/层高(屏幕像素, scale=1)
  const WALL_T = 0.3;                        // 墙顶厚
  // 墙高（格子数，整数保证砖缝均匀）：h0=max(地形最高, 墙洞z+1, 传送门z+1)，h=min(h0+1, 16)
  const wallHOf = (L) => {
    let h0 = L.maxT || 0;
    if (L.start) h0 = Math.max(h0, (L.start.z || 0) + 1);
    for (const p of L.portals || []) h0 = Math.max(h0, (p.z || 0) + 1);
    return Math.min(h0 + 1, 16);
  };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 0东 1南 2西 3北

  // ---------- 静态调色板（主题相关的在 THEMES/PINK/GOLD） ----------
  const C = {
    hole: '#0d0d0d',
    lampOff: '#2e3317', lampOffRim: '#565e2a',
    lampOn: '#ffd83d', lampGlow: 'rgba(255,216,61,.85)',
    glowBeam: '#54ff5a', glowGrid: '#aaffaa',
    metal: '#c9cdd4', metalDark: '#5a5f68',
    pillar: '#d8c8ce', pillarDark: '#9a8a92',
    ghost: 'rgba(150,255,140,.45)', ghostBad: 'rgba(255,90,80,.45)',
  };

  let cam = { s: 1, ox: 0, oy: 0 };
  let CUR_PM = null; // 当前已放积木 Map（供桥朝向推断）

  // ---------- 四视角 ----------
  // 0=SE(默认,东南相机) 1=SW(正视右墙R,相机西南) 2=NE(正视左墙L,相机东北) 3=Top(俯视)
  let view = 0;
  function setView(v) { view = ((v | 0) % 4 + 4) % 4; }
  function getView() { return view; }

  // ---------- 投影 ----------
  // scale=1 原始投影（fit 采样用）。四视角均为右手屏幕系：近处(朝相机)在下方。
  function raw(x, y, z) {
    if (view === 1) return { x: (x + y) * TW / 2, y: (y - x) * TH / 2 - z * ZH };
    if (view === 2) return { x: -(x + y) * TW / 2, y: (x - y) * TH / 2 - z * ZH };
    if (view === 3) return { x: x * TW / 2, y: y * TW / 2 }; // 俯视=纯平面图：z 不参与投影（无压扁椭圆/黑缝/错位）
    return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z * ZH };
  }
  function P(x, y, z) {
    const p = raw(x, y, z);
    p.x = p.x * cam.s + cam.ox;
    p.y = p.y * cam.s + cam.oy;
    return p;
  }

  // 画家序 key：越靠前(近处)越大
  function keyOf(c, r) {
    if (view === 1) return r - c;
    if (view === 2) return c - r;
    if (view === 3) return r * 64 + c;
    return c + r;
  }

  function fit(L, w, h) {
    // 采样包围盒（scale=1）：房间角点 + 墙延伸 + 高度顶（积木余量）
    let xMin = 1e9, xMax = -1e9, yMin = 1e9, yMax = -1e9;
    let maxT = 0;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) if (L.terr[r][c] > maxT) maxT = L.terr[r][c];
    const hz = view === 3 ? 0 : wallHOf(L) + 2.2; // 俯视投影与 z 无关，无需采样高度
    const xs = view === 3 ? [0, L.W] : [-WALL_T, 0, L.W];
    const ys = view === 3 ? [0, L.H] : [-WALL_T, 0, L.H];
    for (const x of xs) for (const y of ys) for (const z of [0, hz]) {
      const p = raw(x, y, z);
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    const bw = xMax - xMin, bh = yMax - yMin;
    const s = Math.min(w / bw, h / bh) * 0.98;
    cam.s = s;
    cam.ox = (w - bw * s) / 2 - xMin * s;
    cam.oy = (h - bh * s) / 2 - yMin * s;
  }

  // ---------- 主题（对照原版：每关一套房间/积木配色） ----------
  const THEMES = {
    olive: { // 黄绿房间+粉色积木（IB3 经典）
      wallL: '#a3c437', wallR: '#93b52f', wallLine: '#6d8c1d', wallTop: '#c6e05a',
      floor: '#b5d94b', floorLine: '#83a52c', floorSE: '#7d9e27', floorSW: '#6a891f',
      bgTop: '#101408', bgBot: '#1c2410', holeRim: '#3a3f22',
      ballHi: '#7d90b8', ballMid: '#2c3a66', ballLo: '#101730', ballRim: '#000',
    },
    orange: { // 橙房间+粉积木
      wallL: '#d8952f', wallR: '#c78628', wallLine: '#96601a', wallTop: '#f0b855',
      floor: '#e8a83a', floorLine: '#b07d20', floorSE: '#a06d18', floorSW: '#8a5c12',
      bgTop: '#1a1004', bgBot: '#2a1c08', holeRim: '#5a3d12',
      ballHi: '#8ab0d8', ballMid: '#2c4a7a', ballLo: '#102040', ballRim: '#000',
    },
    red: { // 红房间+青积木
      wallL: '#b03028', wallR: '#a02820', wallLine: '#701812', wallTop: '#d85048',
      floor: '#c04038', floorLine: '#8a2018', floorSE: '#7a1c14', floorSW: '#661610',
      bgTop: '#160604', bgBot: '#260c08', holeRim: '#521810',
      ballHi: '#9adfd0', ballMid: '#2c7a6a', ballLo: '#0f3028', ballRim: '#000',
    },
    dark: { // 黑房间+黄积木
      wallL: '#3a3d42', wallR: '#33363b', wallLine: '#212327', wallTop: '#55585e',
      floor: '#42454b', floorLine: '#2a2c30', floorSE: '#282a2e', floorSW: '#222428',
      bgTop: '#08090b', bgBot: '#101215', holeRim: '#565a60',
      ballHi: '#9a9a9a', ballMid: '#3a3a3a', ballLo: '#101010', ballRim: '#000',
    },
    green: { // 绿房间+粉积木（IBX）
      wallL: '#6aa832', wallR: '#5f9a2c', wallLine: '#42701c', wallTop: '#8fce4a',
      floor: '#79b83a', floorLine: '#548624', floorSE: '#4c7a1e', floorSW: '#406816',
      bgTop: '#0c1404', bgBot: '#16220a', holeRim: '#365418',
      ballHi: '#8a8a8a', ballMid: '#2e2e2e', ballLo: '#0e0e0e', ballRim: '#000',
    },
  };
  // 积木粉色（可被主题覆盖：dark 主题用黄色积木）
  const PINK = {
    top: '#f4abc0', se: '#d6849c', sw: '#e293aa', line: '#a85a74',
    dark: '#c4708a', light: '#fbc6d4', deep: '#7d3a50',
  };
  const GOLD = {
    top: '#f0d060', se: '#cfa63e', sw: '#e0bc52', line: '#96771e',
    dark: '#b8933a', light: '#f8e8a0', deep: '#6a5212',
  };
  let TK = {}; // 当前主题 (房间色)
  let PK = PINK; // 当前积木色

  function setTheme(name) {
    TK = THEMES[name] || THEMES.olive;
    PK = name === 'dark' ? GOLD : PINK;
  }
  setTheme('olive');

  // ---------- 基元 ----------
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  // 顶面菱形（格 c,r 在高度 z；wh=边宽，默认 1=整格）
  function topFace(ctx, c, r, z, fill, stroke, lw, wh) {
    const w = wh || 1;
    poly(ctx, [P(c, r, z), P(c + w, r, z), P(c + w, r + w, z), P(c, r + w, z)], fill, stroke, lw);
  }

  // 东南侧面（E-S 边, 各角可不同高）
  function sideSE(ctx, c, r, zE, zS, z0, fill, stroke) {
    poly(ctx, [P(c + 1, r, zE), P(c + 1, r + 1, zS), P(c + 1, r + 1, z0), P(c + 1, r, z0)], fill, stroke);
  }
  // 西南侧面（W-S 边）
  function sideSW(ctx, c, r, zW, zS, z0, fill, stroke) {
    poly(ctx, [P(c, r + 1, zW), P(c + 1, r + 1, zS), P(c + 1, r + 1, z0), P(c, r + 1, z0)], fill, stroke);
  }
  // 西侧面（x=c 平面，视角1可见）
  function sideW(ctx, c, r, zW, zS, z0, fill, stroke) {
    poly(ctx, [P(c, r, zW), P(c, r + 1, zS), P(c, r + 1, z0), P(c, r, z0)], fill, stroke);
  }
  // 北侧面（y=r 平面，视角2可见）
  function sideN(ctx, c, r, zW, zE, z0, fill, stroke) {
    poly(ctx, [P(c, r, zW), P(c + 1, r, zE), P(c + 1, r, z0), P(c, r, z0)], fill, stroke);
  }

  // 立方体（带罗纹）——按视角画可见的两条侧面
  function box(ctx, c, r, z0, h, top, se, sw, line, ribs) {
    const z1 = z0 + h;
    if (view !== 3) {
      if (view === 0 || view === 2) sideSE(ctx, c, r, z1, z1, z0, se, line);
      if (view === 0 || view === 1) sideSW(ctx, c, r, z1, z1, z0, sw, line);
      if (view === 1) sideW(ctx, c, r, z1, z1, z0, sw, line);
      if (view === 2) sideN(ctx, c, r, z1, z1, z0, se, line);
    }
    topFace(ctx, c, r, z1, top, line, 1.2);
    if (ribs) { // 顶面横向罗纹（垂直于 c 轴的细线）
      ctx.strokeStyle = line; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.5;
      for (let i = 1; i <= ribs; i++) {
        const t = i / (ribs + 1);
        const a = P(c, r + t, z1), b = P(c + 1, r + t, z1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 凸包（Andrew 单调链）——坡的剪影用：任何角度都是无锯齿的干净凸楔形
  function convexHull(pts) {
    if (pts.length < 3) return pts.slice();
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [];
    for (const pt of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
    const up = [];
    for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop(); up.push(pt); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  // 窄方柱（中心 cx,cy，边宽 w）——立柱等需要"格中心摆放"的方块用
  function slimBox(ctx, cx, cy, w, z0, z1, top, se, sw, line) {
    const x0 = cx - w / 2, y0 = cy - w / 2, x1 = cx + w / 2, y1 = cy + w / 2;
    if (view !== 3) {
      if (view === 0 || view === 2) poly(ctx, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], se, line);
      if (view === 0 || view === 1) poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], sw, line);
      if (view === 1) poly(ctx, [P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0)], sw, line);
      if (view === 2) poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x0, y0, z0)], se, line);
    }
    poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, line, 1.2);
  }

  // 圆柱（立柱/腿）
  function cylinder(ctx, x, y, z0, z1, rad, fillTop, fillBody, stroke) {
    const c0 = P(x, y, z0), c1 = P(x, y, z1);
    const rx = rad * TW / 2 * cam.s, ry = (view === 3 ? rad * TW / 2 : rad * TH / 2) * cam.s;
    const hh = (z1 - z0) * ZH * cam.s;
    ctx.beginPath();
    ctx.moveTo(c0.x - rx, c0.y);
    ctx.lineTo(c1.x - rx, c1.y);
    ctx.arc(c1.x, c1.y, rx, Math.PI, 0, true);
    ctx.lineTo(c0.x + rx, c0.y);
    ctx.ellipse(c0.x, c0.y, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
    const g = ctx.createLinearGradient(c0.x - rx, 0, c0.x + rx, 0);
    g.addColorStop(0, fillBody); g.addColorStop(.55, fillTop); g.addColorStop(1, fillBody);
    ctx.fillStyle = g; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    // 顶面椭圆
    ctx.beginPath();
    ctx.ellipse(c1.x, c1.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fillTop; ctx.fill();
    if (stroke) ctx.stroke();
    void hh;
  }

  // ---------- 墙 ----------
  // 西墙参数化点: (u=r方向 0..H, v=高度) → 屏幕
  function pW(u, v) { return P(-0.001, u, v); }
  function pN(u, v) { return P(u, -0.001, v); }

  function drawWallFace(ctx, L, isWest, run) {
    const len = isWest ? L.H : L.W;
    const Pp = isWest ? pW : pN;
    const base = isWest ? TK.wallL : TK.wallR;
    const WH = wallHOf(L);
    // 整面
    const wpts = [Pp(0, 0), Pp(len, 0), Pp(len, WH), Pp(0, WH)];
    poly(ctx, wpts, base);
    // 砖缝
    ctx.strokeStyle = TK.wallLine; ctx.lineWidth = 1; ctx.globalAlpha = .55;
    for (let v = 1; v < WH; v++) {
      const a = Pp(0, v), b = Pp(len, v);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let u = 0; u <= len; u++) {
      const a = Pp(u, 0), b = Pp(u, WH);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 墙顶亮沿
    poly(ctx, [Pp(0, WH), Pp(len, WH), Pp(len, WH + 0.06), Pp(0, WH + 0.06)], TK.wallTop);
  }

  // 墙上拱门洞（isWest, u0=idx, z0=层高）。portal: 传送门(带灯), run 供灯状态
  function drawArch(ctx, L, isWest, idx, z0, lights, lit) {
    const Pp = isWest ? pW : pN;
    const u0 = idx + 0.09, u1 = idx + 0.91;
    const v0 = z0 + 0.02, v1 = z0 + 1.0, vTop = z0 + 1.32;
    // 拱形路径：左下→右下→右上→半圆弧→左上
    const pts = [Pp(u0, v0), Pp(u1, v0), Pp(u1, v1)];
    for (let a = 0; a <= 12; a++) {
      const th = Math.PI - (a / 12) * Math.PI; // 右→左 上半圆
      const u = (u0 + u1) / 2 + Math.cos(th) * (u1 - u0) / 2;
      const v = v1 + Math.sin(th) * (vTop - v1);
      pts.push(Pp(u, v));
    }
    pts.push(Pp(u0, v1));
    // 洞内渐变（黑洞）
    const cA = Pp(idx + 0.5, v0), cB = Pp(idx + 0.5, vTop);
    const g = ctx.createLinearGradient(cA.x, cA.y, cB.x, cB.y);
    g.addColorStop(0, '#060606'); g.addColorStop(1, '#1d1d16');
    poly(ctx, pts, g, TK.holeRim, 1.5);
    if (lights > 0) {
      // 门框亮边
      poly(ctx, pts, null, isWest ? '#c9d86a' : '#b8c85e', 2.5);
      // 灯（小圆点，紧贴拱顶一排）
      for (let i = 0; i < lights; i++) {
        const t = lights === 1 ? .5 : i / (lights - 1);
        const u = u0 + (u1 - u0) * (0.26 + 0.48 * t);
        const v = z0 + 1.40;
        const cp = Pp(u, v);
        const rx = 3.1 * cam.s, ry = 3.1 * cam.s;
        if (lit) {
          ctx.shadowColor = C.lampGlow; ctx.shadowBlur = 10 * cam.s;
          ctx.beginPath(); ctx.ellipse(cp.x, cp.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = C.lampOn; ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath(); ctx.ellipse(cp.x, cp.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = C.lampOff; ctx.fill();
          ctx.strokeStyle = C.lampOffRim; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
    }
  }

  function drawWalls(ctx, L, run) {
    if (view === 3) return; // 俯视：不画墙
    // 只画"背景墙"：view0 双墙都在深处；view1(SW) 北墙R在深处；view2(NE) 西墙L在深处
    const drawWest = (view === 0 || view === 2);
    const drawNorth = (view === 0 || view === 1);
    if (drawWest) drawWallFace(ctx, L, true, run);
    if (drawNorth) drawWallFace(ctx, L, false, run);
    // 墙顶厚面板（只画保留墙的）
    if (drawWest) poly(ctx, [P(-WALL_T, 0, wallHOf(L) + .06), P(0, 0, wallHOf(L) + .06), P(0, L.H, wallHOf(L) + .06), P(-WALL_T, L.H, wallHOf(L) + .06)], TK.wallTop, TK.wallLine, 1);
    if (drawNorth) poly(ctx, [P(0, -WALL_T, wallHOf(L) + .06), P(L.W, -WALL_T, wallHOf(L) + .06), P(L.W, 0, wallHOf(L) + .06), P(0, 0, wallHOf(L) + .06)], TK.wallTop, TK.wallLine, 1);
    // 洞：出生洞 + 传送门（只画可见墙上的）
    const used = run ? run.ctx.portalsUsed : null;
    const s = L.start;
    if ((s.wall === 'L' && drawWest) || (s.wall === 'R' && drawNorth)) {
      drawArch(ctx, L, s.wall === 'L', s.idx, s.z, 0, false);
    }
    for (let i = 0; i < L.portals.length; i++) {
      const pt = L.portals[i];
      if ((pt.wall === 'L' && !drawWest) || (pt.wall === 'R' && !drawNorth)) continue;
      // 找到该传送门所属的"对"（按灯数配对；与 sim.crossEdge 同一套包含关系）
      const pair = L.pairs.find(pr => pr.includes(pt));
      const lit = !!(used && pair && used.has(pair[0].wall + pair[0].idx + '-' + pair[1].wall + pair[1].idx));
      drawArch(ctx, L, pt.wall === 'L', pt.idx, pt.z, pt.lights, lit);
    }
  }

  // ---------- 地形 / 积木绘制队列 ----------
  // fade: 需要淡化(半透明)的格子 key 集合 "c,r"（被遮挡处放积木时，前方遮挡物半透明）
  function buildQueue(L, pm, run, fx, fade) {
    CUR_PM = pm;
    const q = [];
    const item = (key, draw) => q.push({ key, draw });
    // 该格被遮挡淡化时，包一层半透明
    const fadeWrap = (c, r, fn) => (fade && fade.has(c + ',' + r))
      ? ((ctx) => { ctx.globalAlpha = .38; fn(ctx); ctx.globalAlpha = 1; })
      : fn;
    const holeOpen = run ? run.ctx.holeOpen : (L.portals.length === 0);

    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const t = L.terr[r][c];
      const sum = keyOf(c, r); // 画家序 key 基准（随视角）
      if (t >= 0) {
        item(sum * 10, fadeWrap(c, r, (ctx) => {
          // 柱体: 0 → t（侧面按视角）
          const eN = (c + 1 < L.W) ? L.terr[r][c + 1] : -1;
          const sN = (r + 1 < L.H) ? L.terr[r + 1][c] : -1;
          const wN = (c > 0) ? L.terr[r][c - 1] : -1;
          const nN = (r > 0) ? L.terr[r - 1][c] : -1;
          if (view !== 3) {
            if ((view === 0 || view === 2) && eN < t) sideSE(ctx, c, r, t, t, Math.max(eN, 0), TK.floorSE, TK.wallLine);
            if ((view === 0 || view === 1) && sN < t) sideSW(ctx, c, r, t, t, Math.max(sN, 0), TK.floorSW, TK.wallLine);
            if (view === 1 && wN < t) sideW(ctx, c, r, t, t, Math.max(wN, 0), TK.floorSW, TK.wallLine);
            if (view === 2 && nN < t) sideN(ctx, c, r, t, t, Math.max(nN, 0), TK.floorSE, TK.wallLine);
          }
          topFace(ctx, c, r, t, TK.floor, TK.floorLine, 1);
        }));
        // 洞
        if (L.hole.c === c && L.hole.r === r) {
          item(sum * 10 + 1, fadeWrap(c, r, (ctx) => {
            const cc = P(c + .5, r + .5, t);
            const rx = .44 * TW / 2 * cam.s, ry = (view === 3 ? rx : .44 * TH / 2 * cam.s); // 俯视=正圆，等距=椭圆
            if (holeOpen) {
              ctx.beginPath(); ctx.ellipse(cc.x, cc.y, rx, ry, 0, 0, Math.PI * 2);
              const g = ctx.createRadialGradient(cc.x, cc.y, 1, cc.x, cc.y, rx);
              g.addColorStop(0, '#000'); g.addColorStop(1, C.hole);
              ctx.fillStyle = g; ctx.fill();
              ctx.strokeStyle = TK.holeRim; ctx.lineWidth = 1.4; ctx.stroke();
            } else { // 关闭：圆环 + 中心横杠
              ctx.beginPath(); ctx.ellipse(cc.x, cc.y, rx, ry, 0, 0, Math.PI * 2);
              ctx.fillStyle = '#181810'; ctx.fill();
              ctx.strokeStyle = C.metal; ctx.lineWidth = 2.2 * cam.s; ctx.stroke();
              ctx.beginPath(); ctx.ellipse(cc.x, cc.y, rx * .62, ry * .62, 0, 0, Math.PI * 2);
              ctx.strokeStyle = C.metalDark; ctx.lineWidth = 1.1 * cam.s; ctx.stroke();
              // 中心横杠（锁销）
              ctx.strokeStyle = C.metal; ctx.lineWidth = 2.6 * cam.s; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(cc.x - rx * .58, cc.y); ctx.lineTo(cc.x + rx * .58, cc.y); ctx.stroke();
              ctx.lineCap = 'butt';
            }
          }));
        }
      }
      // 场景立柱（整格方柱：h=立柱自身高度，从地形 t 起画 h 格，柱顶=terr+h 与物理一致；
      // 按钮触发后 0.3s 降自身高度到与底面齐平，降完不画）
      for (const pl of L.pillars) {
        if (pl.c === c && pl.r === r && t >= 0) {
          const ph = pl.h === undefined ? 2 : pl.h;
          const fall = run ? (run.ctx.pillarFall !== undefined ? run.ctx.pillarFall : -1) : -1;
          const hDyn = fall >= 0 ? ph * (1 - Math.min(fall, 1)) : ph;
          if (hDyn > 0.02) {
            item(sum * 10 + 2, fadeWrap(c, r, (ctx) => {
              box(ctx, c, r, t, hDyn, C.pillar, '#c9b3bc', C.pillarDark, '#8d7a83', 0);
            }));
          }
        }
      }
      // 玩家积木（叠放：沿 under 链从底到顶逐层画，支持电梯多层塔）
      // layer：底层 -1，顶层 chain.length-1（单件=0），保证画家序自底向上、顶层画停机板
      const pc = pm.get(c + ',' + r);
      if (pc) {
        const chain = [];
        let p2 = pc;
        while (p2) { chain.unshift(p2); p2 = p2.under; }
        chain.forEach((unit, i) => {
          const layer = i === chain.length - 1 ? chain.length - 1 : i - 1;
          drawPiece((k, fn) => item(k, fadeWrap(c, r, fn)), L, c, r, t, unit, run, layer);
        });
      }
    }
    // 荧光光束（光通路）
    // 光通路是"无厚度"的薄片：只有一张顶面，没有侧壁也没有厚度。
    // 顶面严格落在荧光块顶面高度 b.z 上（只 +0.004 抬一点点，避免与同高的地形/积木顶面 z-fighting），
    // 且格边界与荧光块严格对齐 —— 与荧光块顶面共面、无缝贴接。
    const beams = run ? run.ctx.beams : (L._beams || new Map());
    beams.forEach((b, key) => {
      const [c, r] = key.split(',').map(Number);
      q.push({
        key: keyOf(c, r) * 10 + 8,
        draw: (ctx) => {
          const zs = b.z + 0.004; // 与荧光块顶面等高（无厚度）
          const half = .5; // 光通路宽度=1格（与荧光块同宽）
          const ew = b.axis % 2 === 0; // 沿 c 轴 / 沿 r 轴
          // 单张顶面
          const p1 = ew ? P(c, r + .5 - half, zs) : P(c + .5 - half, r, zs);
          const p2 = ew ? P(c + 1, r + .5 - half, zs) : P(c + .5 + half, r, zs);
          const p3 = ew ? P(c + 1, r + .5 + half, zs) : P(c + .5 + half, r + 1, zs);
          const p4 = ew ? P(c, r + .5 + half, zs) : P(c + .5 - half, r + 1, zs);
          ctx.shadowColor = C.glowBeam; ctx.shadowBlur = 12 * cam.s;
          poly(ctx, [p1, p2, p3, p4], 'rgba(90,255,100,.42)', C.glowBeam, 1);
          ctx.shadowBlur = 0;
        },
      });
    });
    return q;
  }

  // 电梯侧面拱门装饰（kind: 'E'|'S'|'W'|'N'）——四面都有门，任意方向可进出
  function liftDoor(ctx, kind, c, r, t) {
    const z0 = t + .05, z1 = t + .7, zT = t + .92;
    const pt = (u, z) => kind === 'E' ? P(c + 1, r + u, z)
      : kind === 'S' ? P(c + u, r + 1, z)
      : kind === 'W' ? P(c, r + u, z)
      : P(c + u, r, z);
    const u0 = .2, u1 = .8;
    const pts = [pt(u0, z0), pt(u1, z0), pt(u1, z1)];
    for (let a = 0; a <= 8; a++) {
      const th = Math.PI - (a / 8) * Math.PI;
      const u = (u0 + u1) / 2 + Math.cos(th) * (u1 - u0) / 2;
      pts.push(pt(u, z1 + Math.sin(th) * (zT - z1)));
    }
    pts.push(pt(u0, z1));
    poly(ctx, pts, 'rgba(18,16,20,.85)', PK.deep, 1.1);
  }

  // 单个积木（含贴面装饰）。layer: 叠放积木 +1
  function drawPiece(item, L, c, r, tz, pc, run, layer) {
    const sum = keyOf(c, r) * 10 + 3 + layer;
    const t = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : tz) : tz;
    switch (pc.type) {
      case 'block1':
        item(sum, (ctx) => box(ctx, c, r, t, 1, PK.top, PK.se, PK.sw, PK.line, 0));
        break;
      case 'block2':
        item(sum, (ctx) => box(ctx, c, r, t, 2, PK.top, PK.se, PK.sw, PK.line, 0));
        break;
      case 'ramp1': case 'ramp2': {
        const h = pc.type === 'ramp1' ? 1 : 2;
        item(sum, (ctx) => {
          // 四角高度：高侧 rot 的两个角为 t+h
          const cornerZ = (cx, cy) => {
            if (pc.rot % 2 === 0) return (cx === (pc.rot === 0 ? 1 : 0)) ? t + h : t;
            return (cy === (pc.rot === 1 ? 1 : 0)) ? t + h : t;
          };
          const n = P(c, r, cornerZ(0, 0)), e = P(c + 1, r, cornerZ(1, 0));
          const s = P(c + 1, r + 1, cornerZ(1, 1)), w = P(c, r + 1, cornerZ(0, 1));
          // 高侧邻格的结构顶面（=t+h 时视为"贴合"，省略高侧背面裙——
          // 否则背面竖面会从方块轮廓边露出一截深粉条，视觉上像没贴合）
          const nbTop = (nc, nr) => {
            if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H || !L.terr[nr]) return -99;
            const nb = CUR_PM ? CUR_PM.get(nc + ',' + nr) : null;
            return nb ? SIMTOP(L, nb, nc, nr, L.terr[nr][nc]) : L.terr[nr][nc];
          };
          const flushE = pc.rot === 0 && nbTop(c + 1, r) === t + h;
          const flushS = pc.rot === 1 && nbTop(c, r + 1) === t + h;
          const flushW = pc.rot === 2 && nbTop(c - 1, r) === t + h;
          const flushN = pc.rot === 3 && nbTop(c, r - 1) === t + h;
          // 俯视：纯平面图画法——整格浅色（低侧）+ 高侧深色三角指示坡向
          if (view === 3) {
            const HI = [
              [[1, 0], [1, 1], [0, .5]],   // rot0 东高
              [[0, 1], [1, 1], [.5, 0]],   // rot1 南高
              [[0, 0], [0, 1], [1, .5]],   // rot2 西高
              [[0, 0], [1, 0], [.5, 1]],   // rot3 北高
            ][pc.rot];
            topFace(ctx, c, r, t, PK.light, PK.line, 1);
            poly(ctx, [P(c + HI[0][0], r + HI[0][1], t), P(c + HI[1][0], r + HI[1][1], t), P(c + HI[2][0], r + HI[2][1], t)], PK.top, PK.line, 1);
            return;
          }
          // 地面四角（贴地棱与地砖边重合）
          const n0 = P(c, r, t), e0 = P(c + 1, r, t), s0 = P(c + 1, r + 1, t), w0 = P(c, r + 1, t);
          // 斜面可见性：斜面四边形投影绕向与地面一致=正对相机（画斜面）；
          // 反转=背对相机（斜面被挡住）——不画斜面，改画"背面长方形（高侧立面）+
          // 侧面三角形"的组合（用户手绘稿：就像好朝向转了一下，顶边∥底边∥地砖边）
          const baseSign = (e0.x - n0.x) * (s0.y - e0.y) - (e0.y - n0.y) * (s0.x - e0.x);
          const faceSign = (e.x - n.x) * (s.y - e.y) - (e.y - n.y) * (s.x - e.x);
          if (faceSign * baseSign < 0) {
            // 高侧边两端（格坐标）：rot0 东=e-s、rot1 南=s-w、rot2 西=w-n、rot3 北=n-e
            let wa, wb, la, lb;
            if (pc.rot === 0) { wa = [c + 1, r]; wb = [c + 1, r + 1]; la = [c, r]; lb = [c, r + 1]; }
            else if (pc.rot === 1) { wa = [c + 1, r + 1]; wb = [c, r + 1]; la = [c, r]; lb = [c + 1, r]; }
            else if (pc.rot === 2) { wa = [c, r + 1]; wb = [c, r]; la = [c + 1, r]; lb = [c + 1, r + 1]; }
            else { wa = [c, r]; wb = [c + 1, r]; la = [c + 1, r + 1]; lb = [c, r + 1]; }
            const W1 = P(wa[0], wa[1], t), W2 = P(wb[0], wb[1], t);
            const W1h = P(wa[0], wa[1], t + h), W2h = P(wb[0], wb[1], t + h);
            // 侧面三角：高侧边与低侧边中屏幕更近（y 更大）的端点相连
            const hNear = (W1h.y > W2h.y) ? { p: W1h, g: W1 } : { p: W2h, g: W2 };
            const L1 = P(la[0], la[1], t), L2 = P(lb[0], lb[1], t);
            const lNear = (L1.y > L2.y) ? L1 : L2;
            const wallCol = (pc.rot % 2 === 0) ? PK.se : PK.sw;  // rot0/rot3 立面朝东/北；rot1/rot2 朝南/西
            const triCol = (pc.rot % 2 === 0) ? PK.sw : PK.se;
            poly(ctx, [hNear.p, lNear, hNear.g], triCol, null, 0);  // 侧面三角形
            poly(ctx, [W1, W2, W2h, W1h], wallCol, PK.line, 1);     // 背面长方形（高侧立面）
            return;
          }
          // 斜面正对相机：楔形直连画法（对照原版 Flash）：
          //  - 斜面 = 高侧边直连低侧边：顶边（高侧边）与底边（低侧边，与地砖边重合）严格平行
          //  - 立面/侧面三角直接拼在斜面边缘（共享边，无缝无锯齿）
          const slope = pc.type === 'ramp2' ? PK.top : PK.light;
          if ((view === 0 || view === 2) && !flushE) poly(ctx, [e, s, s0, e0], PK.se, null, 0);
          if ((view === 0 || view === 1) && !flushS) poly(ctx, [w, s, s0, w0], PK.sw, null, 0);
          if (view === 1 && !flushW) poly(ctx, [n, w, w0, n0], PK.sw, null, 0);
          if (view === 2 && !flushN) poly(ctx, [n, e, e0, n0], PK.se, null, 0);
          poly(ctx, [n, e, s, w], slope, PK.line, 1);
        });
        break;
      }
      case 'arrow': {
        // 居中窄板（边宽 .86）+ 粗箭头浮雕（都居中于格心）
        item(sum + .5, (ctx) => {
          const zz = t + 0.02;
          topFace(ctx, c + .07, r + .07, zz, PK.se, PK.line, 1.2, .86);
          topFace(ctx, c + .12, r + .12, zz + .015, PK.top, null, 0, .76);
          const cx = c + .5, cy = r + .5;
          const d = DIRS[pc.rot], pp = DIRS[(pc.rot + 1) % 4];
          const shape = [[-.30, -.15], [.02, -.15], [.02, -.31], [.37, 0], [.02, .31], [.02, .15], [-.30, .15]];
          const pts2 = shape.map(([u, v]) => P(cx + d[0] * u + pp[0] * v, cy + d[1] * u + pp[1] * v, zz + .03));
          poly(ctx, pts2, PK.deep, PK.dark, 1);
        });
        break;
      }
      case 'bridge': {
        item(sum, (ctx) => {
          // 桥面高度：pc.deck（canPlace 算出）；图标/幽灵无 deck 时从邻接支撑推断，兜底 1
          let deck = pc.deck;
          if (deck === undefined) {
            deck = 1;
            for (let d2 = 0; d2 < 4; d2++) {
              const nc = c + DIRS[d2][0], nr = r + DIRS[d2][1];
              if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H || !L.terr[nr]) continue;
              const nb = CUR_PM ? CUR_PM.get(nc + ',' + nr) : null;
              if (nb) {
                const top2 = SIMTOP(L, nb, nc, nr, L.terr[nr][nc]);
                if (top2 > 0 && (nb.type === 'block1' || nb.type === 'block2' || nb.type === 'glow' || nb.type === 'conveyor' || nb.type === 'elevator' || nb.type === 'bridge')) { deck = top2; break; }
              }
            }
          }
          const tg = L.terr[r] && L.terr[r][c] >= 0 ? L.terr[r][c] : 0;
          // 朝向：看哪侧邻居是同高度支点
          let along = 0; // 0=沿c(东西) 1=沿r(南北)
          for (let d2 = 0; d2 < 4; d2++) {
            const nc = c + DIRS[d2][0], nr = r + DIRS[d2][1];
            if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H || !L.terr[nr]) continue;
            const nb = CUR_PM ? CUR_PM.get(nc + ',' + nr) : null;
            if (nb && SIMTOP(L, nb, nc, nr, L.terr[nr][nc]) === deck) { along = d2 % 2; break; }
          }
          // 四角小脚：悬空装饰（从甲板下垂一小段，不落地——对照原版：桥整体依附于支撑积木）
          if (deck - tg > 0.34) {
            ctx.globalAlpha = .92;
            for (const [ox, oy] of [[.18, .18], [.82, .18], [.82, .82], [.18, .82]]) {
              cylinder(ctx, c + ox, r + oy, deck - .8, deck - .3, .05, PK.sw, PK.dark);
            }
            ctx.globalAlpha = 1;
          }
          // 甲板（厚 .3：底面=deck-.3，与 sim 桥下净空判定一致）——纯色顶面无板条纹
          box(ctx, c, r, deck - .3, .3, PK.top, PK.se, PK.sw, PK.line, 0);
        });
        break;
      }
      case 'elevator': {
        // 每单元高 1（叠 N 层=多层塔，各单元由调用链逐层画）。
        // 四面都有门（拱门装饰）：球从任何方向进入电梯都能被垂直运送。
        // 运行中：塔身 X-ray 半透明 + 金属圆板跟随球 + 基座格高亮（参考原版 IBX）
        item(sum, (ctx) => {
          const lifting = !!(run && run.ball.mode === 'lift' &&
            Math.floor(run.ball.x) === c && Math.floor(run.ball.y) === r);
          // 塔身（本单元 1 格高）
          if (lifting) ctx.globalAlpha = .42;
          box(ctx, c, r, t, 1, PK.top, PK.se, PK.sw, PK.line, 0);
          if (lifting) ctx.globalAlpha = 1;
          // 四面门（可见两条侧面上画拱门；俯视不画）
          if (view !== 3 && !lifting) {
            if (view === 0 || view === 2) liftDoor(ctx, 'E', c, r, t);
            if (view === 0 || view === 1) liftDoor(ctx, 'S', c, r, t);
            if (view === 1) liftDoor(ctx, 'W', c, r, t);
            if (view === 2) liftDoor(ctx, 'N', c, r, t);
          }
          // 底部单元（under 不是电梯=塔底，可贴地也可垫在方块/桥面上）：运行中画基座高亮圈
          if (lifting && !(pc.under && pc.under.type === 'elevator')) {
            const hz = t + .035;
            poly(ctx, [P(c + .07, r + .07, hz), P(c + .93, r + .07, hz), P(c + .93, r + .93, hz), P(c + .07, r + .93, hz)],
              'rgba(255,145,165,.30)', '#ff9db0', 1.6);
          }
          // 顶部单元：顶面金属停机板（待机位）
          if (layer !== -1) {
            const cc = P(c + .5, r + .5, t + 1.008);
            const rx = .28 * TW / 2 * cam.s, ry = (view === 3 ? rx : .28 * TH / 2 * cam.s);
            ctx.beginPath(); ctx.ellipse(cc.x, cc.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = C.metal; ctx.fill();
            ctx.strokeStyle = PK.deep; ctx.lineWidth = 1.3; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(cc.x, cc.y, rx * .56, ry * .56, 0, 0, Math.PI * 2);
            ctx.fillStyle = C.metalDark; ctx.fill();
          }
          // 运行中：金属圆板跟随球升降（画在塔身之后、球之前）
          if (lifting) {
            const pp = P(c + .5, r + .5, run.ball.z);
            const rx = .36 * TW / 2 * cam.s, ry = (view === 3 ? rx : .36 * TH / 2 * cam.s);
            ctx.beginPath(); ctx.ellipse(pp.x, pp.y + 3 * cam.s, rx, ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = C.metalDark; ctx.fill();
            ctx.beginPath(); ctx.ellipse(pp.x, pp.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = C.metal; ctx.fill();
            ctx.strokeStyle = '#f2f4f8'; ctx.lineWidth = 1.1; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(pp.x, pp.y, rx * .5, ry * .5, 0, 0, Math.PI * 2);
            ctx.strokeStyle = C.metalDark; ctx.lineWidth = 1; ctx.stroke();
          }
        });
        break;
      }
      case 'conveyor': {
        item(sum, (ctx) => {
          // 机体：高度1（滚面=顶面 z=t+1，与物理一致，球不再悬空）
          box(ctx, c, r, t, .84, PK.top, PK.se, PK.sw, PK.line, 0);
          // 顶面深色带面
          topFace(ctx, c + .04, r + .04, t + .86, '#22252b', PK.line, 1);
          const d = DIRS[pc.rot], pp = DIRS[(pc.rot + 1) % 4];
          const zz = t + .93;
          // 独立滚筒排（垂直于传送方向），端面深色
          for (let i = 0; i < 4; i++) {
            const off = -.31 + i * (0.62 / 3);
            const cx = c + .5 + d[0] * off, cy = r + .5 + d[1] * off;
            const pa = P(cx - pp[0] * .40, cy - pp[1] * .40, zz);
            const pb = P(cx + pp[0] * .40, cy + pp[1] * .40, zz);
            ctx.strokeStyle = C.metal; ctx.lineWidth = 5.5 * cam.s; ctx.lineCap = 'butt';
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
            ctx.strokeStyle = C.metalDark; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
            for (const pe of [pa, pb]) {
              ctx.beginPath(); ctx.ellipse(pe.x, pe.y, 2.6 * cam.s, 2.2 * cam.s, 0, 0, Math.PI * 2);
              ctx.fillStyle = C.metalDark; ctx.fill();
            }
          }
          // 方向小箭头（深色，画在滚筒上方）
          const zz2 = t + 1.06;
          const tip = P(c + .5 + d[0] * .26, r + .5 + d[1] * .26, zz2);
          const tail = P(c + .5 - d[0] * .14, r + .5 - d[1] * .14, zz2);
          ctx.strokeStyle = PK.deep; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
          const h1 = P(c + .5 + d[0] * .14 + pp[0] * .11, r + .5 + d[1] * .14 + pp[1] * .11, zz2);
          const h2 = P(c + .5 + d[0] * .14 - pp[0] * .11, r + .5 + d[1] * .14 - pp[1] * .11, zz2);
          ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
          ctx.lineCap = 'butt';
        });
        break;
      }
      case 'button':
        item(sum + .4, (ctx) => {
          const zz = t + .02;
          // 底座方板（居中，边宽 .58；蘑菇头同在格心）
          topFace(ctx, c + .21, r + .21, zz, PK.se, PK.line, 1, .58);
          const cp = P(c + .5, r + .5, zz + .02);
          const rx = .27 * TW / 2 * cam.s, ry = (view === 3 ? rx : .27 * TH / 2 * cam.s); // 俯视=正圆
          const pressed = run ? !run.ctx.pillarsUp : false;
          // 橙色蘑菇头
          ctx.beginPath(); ctx.ellipse(cp.x, cp.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#e89a3c'; ctx.fill(); ctx.strokeStyle = '#8a5212'; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(cp.x, cp.y, rx * .58, ry * .58, 0, 0, Math.PI * 2);
          ctx.fillStyle = pressed ? '#b06418' : '#ffc06a'; ctx.fill(); ctx.stroke();
        });
        break;
      case 'glow':
        item(sum + .6, (ctx) => {
          // 高度1实体方块，整体发光（叠放时 t=底面高度）
          ctx.shadowColor = C.glowBeam; ctx.shadowBlur = 13 * cam.s;
          box(ctx, c, r, t, 1, 'rgba(214,255,214,.95)', 'rgba(120,240,130,.88)', 'rgba(88,210,100,.88)', C.glowBeam, 0);
          ctx.shadowBlur = 0;
          // 顶面纯色无网格纹（顶缘亮边保留）
          const gz = t + 1.002;
          // 顶缘亮边
          ctx.strokeStyle = '#eaffea'; ctx.lineWidth = 1.4; ctx.globalAlpha = .8;
          poly(ctx, [P(c + .06, r + .06, gz), P(c + .94, r + .06, gz), P(c + .94, r + .94, gz), P(c + .06, r + .94, gz)], null, C.glowGrid, 1.2);
          ctx.globalAlpha = 1;
        });
        break;
    }
  }

  // ---------- 球 ----------
  function drawBall(ctx, ball, scale, alpha) {
    let bz = ball.z, sc = scale || 1;
    if (ball.mode === 'dropin') { // 进洞动画：缩小 + 下沉
      const k = Math.min(1, (ball.t || 0) / 0.45);
      bz = ball.z - k * .85; sc *= 1 - .75 * k;
    }
    drawBallAt(ctx, ball.x, ball.y, bz, sc, alpha);
  }
  function drawBallAt(ctx, x, y, z, scale, alpha) {
    const sc = scale || 1;
    const rad = .34 * TW / 2 * cam.s * sc;
    const p = P(x, y, z + .35 * sc);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    // 影子（俯视=正圆）
    const sh = P(x, y, z);
    ctx.beginPath(); ctx.ellipse(sh.x, sh.y, rad * .9, view === 3 ? rad * .9 : rad * .42, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    // 球体
    const g = ctx.createRadialGradient(p.x - rad * .4, p.y - rad * .5, rad * .15, p.x, p.y, rad);
    g.addColorStop(0, TK.ballHi); g.addColorStop(.35, TK.ballMid); g.addColorStop(1, TK.ballLo);
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = TK.ballRim; ctx.lineWidth = .8; ctx.stroke();
    // 高光点
    ctx.beginPath(); ctx.arc(p.x - rad * .38, p.y - rad * .45, rad * .18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }

  // ---------- 幽灵预览 ----------
  // base: 叠放时的底面高度（ghost 画在被叠物上方，而不是沉到地面）
  function drawGhost(ctx, L, type, c, r, rot, ok, hz, deck, base) {
    if (c < 0 || r < 0 || c >= L.W || r >= L.H) return;
    const t = L.terr[r] ? L.terr[r][c] : -1;
    const fake = { type, rot: rot || 0 };
    if (base !== undefined && base !== null) { fake.on = true; fake.zAbs = base; }
    if (type === 'bridge' && deck !== undefined) fake.deck = deck;
    ctx.save();
    ctx.globalAlpha = .55;
    drawPiece((k, fn) => fn(ctx), L, c, r, t, fake, null, 0);
    ctx.restore();
    ctx.globalAlpha = .8;
    const hz0 = hz !== undefined ? hz : ((t >= 0 ? t : 0) + .02);
    topFace(ctx, c, r, hz0 + .02, ok ? C.ghost : C.ghostBad);
    ctx.globalAlpha = 1;
  }

  // ---------- 命中检测 ----------
  // 返回 {c, r, pc?} pc=命中格的顶层积木。
  // 精确多边形法：按画家序从最靠前到最靠后逐面测试（地形顶面菱形、积木顶面/侧面四边形），
  // 点中"被前方积木遮挡格露出的边角"时不再被前方格抢走。
  function pip(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function hitCell(L, pm, mx, my) {
    // 俯视：直接网格逆映射（快路径；z 偏移仅 6px/层，忽略）
    if (view === 3) {
      const a = TW / 2 * cam.s;
      const c = Math.floor((mx - cam.ox) / a), r = Math.floor((my - cam.oy) / a);
      // 缺口格（terr<0）也可命中——桥要能搭在缺口上方（放置合法性由 canPlace 判定）
      if (c >= 0 && r >= 0 && c < L.W && r < L.H && L.terr[r])
        return { c, r, pc: pm.get(c + ',' + r) || null };
      return null;
    }
    const faces = [];
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const t = L.terr[r][c];
      const K = keyOf(c, r) * 10;
      // 地形顶面（缺口格没有地砖，但用 0 高度投影一个"口沿面"，让桥能点到缺口上）
      const tz = Math.max(t, 0);
      if (L.terr[r])
        faces.push({
          key: K, cd: { c, r, pc: null },
          pts: [P(c, r, tz), P(c + 1, r, tz), P(c + 1, r + 1, tz), P(c, r + 1, tz)],
        });
      // 积木各面（沿 under 链，key 与渲染层一致）
      const top = pm.get(c + ',' + r);
      if (!top) continue;
      const chain = [];
      let p2 = top;
      while (p2) { chain.unshift(p2); p2 = p2.under; }
      chain.forEach((unit, i) => {
        const key = K + 3 + (i - 1);
        const z0 = unit.on ? (unit.zAbs !== undefined ? unit.zAbs : t) : t;
        // unit=命中的具体层：去除模式按它移除（点方块去方块、点桥去桥），pc 仍是顶层（放置/旋转用）
        const cd = { c, r, pc: top, unit };
        const quad = (zA, zB, zC, zD) => [P(c, r, zA), P(c + 1, r, zB), P(c + 1, r + 1, zC), P(c, r + 1, zD)];
        // 可见侧面（按视角）
        const sides = (zt) => {
          const arr = [];
          if (view === 0 || view === 2) arr.push([P(c + 1, r, zt), P(c + 1, r + 1, zt), P(c + 1, r + 1, z0), P(c + 1, r, z0)]);
          if (view === 0 || view === 1) arr.push([P(c, r + 1, zt), P(c + 1, r + 1, zt), P(c + 1, r + 1, z0), P(c, r + 1, z0)]);
          if (view === 1) arr.push([P(c, r, zt), P(c, r + 1, zt), P(c, r + 1, z0), P(c, r, z0)]);
          if (view === 2) arr.push([P(c, r, zt), P(c + 1, r, zt), P(c + 1, r, z0), P(c, r, z0)]);
          return arr;
        };
        switch (unit.type) {
          case 'block1': case 'conveyor': case 'glow': case 'elevator': {
            const z1 = z0 + 1;
            faces.push({ key, cd, pts: quad(z1, z1, z1, z1) });
            for (const q2 of sides(z1)) faces.push({ key, cd, pts: q2 });
            break;
          }
          case 'block2': {
            const z1 = z0 + 2;
            faces.push({ key, cd, pts: quad(z1, z1, z1, z1) });
            for (const q2 of sides(z1)) faces.push({ key, cd, pts: q2 });
            break;
          }
          case 'ramp1': case 'ramp2': {
            const h = unit.type === 'ramp1' ? 1 : 2;
            const cz = (cx, cy) => {
              if (unit.rot % 2 === 0) return (cx === (unit.rot === 0 ? 1 : 0)) ? z0 + h : z0;
              return (cy === (unit.rot === 1 ? 1 : 0)) ? z0 + h : z0;
            };
            faces.push({ key, cd, pts: quad(cz(0, 0), cz(1, 0), cz(1, 1), cz(0, 1)) }); // 斜面
            if (view === 0 || view === 2) faces.push({ key, cd, pts: [P(c + 1, r, cz(1, 0)), P(c + 1, r + 1, cz(1, 1)), P(c + 1, r + 1, z0), P(c + 1, r, z0)] });
            if (view === 0 || view === 1) faces.push({ key, cd, pts: [P(c, r + 1, cz(0, 1)), P(c + 1, r + 1, cz(1, 1)), P(c + 1, r + 1, z0), P(c, r + 1, z0)] });
            if (view === 1) faces.push({ key, cd, pts: [P(c, r, cz(0, 0)), P(c, r + 1, cz(0, 1)), P(c, r + 1, z0), P(c, r, z0)] });
            if (view === 2) faces.push({ key, cd, pts: [P(c, r, cz(0, 0)), P(c + 1, r, cz(1, 0)), P(c + 1, r, z0), P(c, r, z0)] });
            break;
          }
          case 'bridge': {
            const dk = unit.deck !== undefined ? unit.deck : 1;
            faces.push({ key, cd, pts: quad(dk, dk, dk, dk) });
            for (const q2 of sides(dk - .3)) faces.push({ key, cd, pts: q2 });
            break;
          }
          default: { // arrow / button 贴面
            faces.push({ key, cd, pts: quad(z0 + .02, z0 + .02, z0 + .02, z0 + .02) });
          }
        }
      });
    }
    faces.sort((a, b) => b.key - a.key);
    for (const f of faces) {
      if (pip(mx, my, f.pts)) return f.cd;
    }
    // 兜底：view0 菱形近似 / view1·2 矩形近似（容忍略出格的点按）
    let best = null;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (!L.terr[r]) continue; // 缺口格也参与（桥可搭在缺口上方）
      const cc = P(c + .5, r + .5, Math.max(L.terr[r][c], 0));
      const dx = Math.abs(mx - cc.x), dy = Math.abs(my - cc.y);
      const inR = view === 0
        ? (dx / (TW / 2 * cam.s) + dy / (TH / 2 * cam.s) <= 1.02)
        : (dx <= TW / 2 * cam.s && dy <= TH / 2 * cam.s);
      if (inR) {
        const k = keyOf(c, r);
        if (!best || k > best._k) best = Object.assign({ _k: k }, { c, r, pc: pm.get(c + ',' + r) || null });
      }
    }
    return best;
  }
  // 命中检测用的"结构顶面"（与 sim.structureTop 同步：含叠层与桥 deck）
  function SIMTOP(L, pc, c, r, t) {
    const b = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : t) : t;
    switch (pc.type) {
      case 'block1': case 'conveyor': case 'glow': case 'elevator': return b + 1;
      case 'block2': return b + 2;
      case 'ramp1': return b + 1;
      case 'ramp2': return b + 2;
      case 'bridge': return pc.deck !== undefined ? pc.deck : 1;
      default: return b;
    }
  }

  // ---------- HUD 积木图标（画在任意 ctx, size 见边） ----------
  function drawPieceIcon(ctx, type, size, rot) {
    const saveS = cam.s, saveOx = cam.ox, saveOy = cam.oy, saveV = view;
    view = 0; // 图标恒用默认视角
    cam.s = size / 96;
    cam.ox = size / 2;
    // 按积木自身高度垂直居中（否则高积木会画出画布）
    const zc = { block1: .5, ramp1: .5, conveyor: .5, glow: .5, bridge: .5, block2: 1, ramp2: 1, elevator: .5 }[type] || 0;
    cam.oy = size / 2 + zc * ZH * cam.s;
    const fakeL = { terr: [[0]], W: 1, H: 1 };
    const item = (k, fn) => fn(ctx);
    const pc = { type, rot: rot || 0 };
    try {
      drawPiece(item, fakeL, -0.5, -0.5, 0, pc, null, 0);
    } catch (e) { void e; }
    cam.s = saveS; cam.ox = saveOx; cam.oy = saveOy; view = saveV;
  }

  // ---------- 主绘制 ----------
  function drawAll(ctx, L, pm, run, opts) {
    opts = opts || {};
    const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, TK.bgTop); bg.addColorStop(1, TK.bgBot);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // 墙
    drawWalls(ctx, L, run);
    // 编辑态不再画待命球：点开始后球才从墙洞滚出
    // 队列（fade=遮挡淡化集合）
    const q = buildQueue(L, pm, run, opts.fx, opts.fade);
    // 球（碎裂后隐藏；停摆/卡住复位时淡出。电梯运行中塔身半透明，球保持可见）
    if (run && !run.ball.hidden) {
      q.push({
        key: keyOf(run.ball.x, run.ball.y) * 10 + 5,
        draw: (c2) => drawBall(c2, run.ball, opts.ballScale || 1, opts.ballAlpha),
      });
    }
    q.sort((a, b) => a.key - b.key);
    for (const it of q) it.draw(ctx);
    // 幽灵
    if (opts.ghost) drawGhost(ctx, L, opts.ghost.type, opts.ghost.c, opts.ghost.r, opts.ghost.rot, opts.ghost.ok, opts.ghost.hz, opts.ghost.deck, opts.ghost.base);
    // 无效放置红面（点击/拖拽松手后 0.5s 内）：位置下面的地面/积木面显示红色
    if (opts.badCell) {
      ctx.globalAlpha = opts.badCell.alpha !== undefined ? opts.badCell.alpha : .65;
      topFace(ctx, opts.badCell.c, opts.badCell.r, (opts.badCell.hz || 0) + .02, '#ff4437');
      ctx.globalAlpha = 1;
    }
  }

  function getBallColors() { return { hi: TK.ballHi, mid: TK.ballMid, lo: TK.ballLo }; }

  return {
    TW, TH, ZH, C, P, fit, cam,
    drawAll, drawPieceIcon, hitCell, topFace,
    setTheme, getBallColors, setView, getView, keyOf,
    computeBeamsSafe: null,
  };
})();
