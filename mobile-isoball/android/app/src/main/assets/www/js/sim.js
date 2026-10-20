/* Isoball X 重制版 — 核心模拟（浏览器/Node 共用）
 * 坐标系：c 向东(0..W-1)，r 向南(0..H-1)，z 单位=积木高度
 * 方向 DIRS[dc,dr]：0=东 1=南 2=西 3=北
 * 能量模型：v2(=速度平方) 平地每格 -FRI，下坡 +2*G/格高，上坡 -2*G/格高，
 *           传送带 +BOOST，v2<=STALL 判定停摆
 */
(function () {
  'use strict';
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const FRI = 1.2;      // 平地摩擦（v2/格）——地面与积木都有可感知的阻力
  const G = 1.0;        // 重力：v2 变化 = 2*G*Δz
  const BOOST = 4.5;    // 传送带加速
  const BELT_MIN = 2.0; // 传送带上最低 v2
  const STALL = 0.06;   // 停摆阈值
  const V2_0 = 3.6 * 3.6;
  const PILLAR_TOP = 3.5;

  // ---------- 关卡解析 ----------
  function parseLevel(lvl) {
    const H = lvl.map.length, W = lvl.map[0].length;
    const terr = [];
    for (let r = 0; r < H; r++) {
      const row = [];
      for (let c = 0; c < W; c++) {
        const ch = lvl.map[r][c];
        row.push(ch === '.' ? -1 : parseInt(ch, 10));
      }
      terr.push(row);
    }
    const L = {
      name: lvl.name, tip: lvl.tip || '', W, H, terr,
      maxT: Math.max(0, ...terr.flat()),     // 最高地势（渲染墙高用）
      start: lvl.start,                       // {wall:'L'|'R', idx, z, v0}
      hole: lvl.hole || { c: -9, r: -9, z: -99 }, // {c,r,z}；无洞关（原稿未给洞）用图外占位，永不可达
      portals: (lvl.portals || []).slice(),   // [{wall, idx, z, lights}]
      pillars: (lvl.pillars || []).map(p => ({ c: p.c, r: p.r, h: p.h === undefined ? 2 : p.h })), // [{c,r,h}] h=高度（默认 2，兼容旧关）
      pieces: Object.assign({}, lvl.pieces),  // 库存
    };
    L.pillarSet = new Set(L.pillars.map(p => p.c + ',' + p.r));
    L.pillarH = new Map(L.pillars.map(p => [p.c + ',' + p.r, p.h]));
    // 传送门配对（按灯数）
    L.pairs = [];
    const byLights = {};
    for (const p of L.portals) (byLights[p.lights] = byLights[p.lights] || []).push(p);
    for (const k in byLights) {
      const arr = byLights[k];
      if (arr.length >= 2) L.pairs.push([arr[0], arr[1]]);
    }
    return L;
  }

  // ---------- 放置状态 ----------
  // pieces Map key "c,r" -> {type, rot, on}  on=叠在方块顶
  function pieceTopZ(L, p, c, r, base) {
    const t = base !== undefined ? base : L.terr[r][c];
    switch (p.type) {
      case 'block1': return t + 1;
      case 'block2': return t + 2;
      case 'conveyor': return t + 1;
      case 'ramp1': return t + 1;
      case 'ramp2': return t + 2;
      case 'elevator': return t + 1; // 电梯每单元高 1（可叠放成多层）
      case 'glow': return t + 1;     // 荧光方块=高度1实体方块
      case 'bridge': return 1;       // 桥面高度实际由 pc.deck 决定（canPlace 内算出）
      default: return t; // arrow/button 不增高（on 时=方块顶）
    }
  }
  function pieceZ(L, p, c, r) {
    if (p.on) return L.terr[r][c] + (p.type === undefined ? 0 : 0) + (p.baseTop || 0);
    return pieceTopZ(L, p, c, r);
  }

  // 某格玩家积木的"顶面"高度（供邻接判断等）
  // zAbs 语义统一为"底面高度"：贴面积木表面=zAbs；增高积木顶面=zAbs+自身高度
  function structureTop(L, pc, c, r) {
    const t = L.terr[r][c];
    if (!pc) return t >= 0 ? t : -99;
    if (pc.on) {
      const base = pc.zAbs !== undefined ? pc.zAbs : t;
      switch (pc.type) {
        case 'block1': case 'conveyor': case 'glow': case 'elevator': return base + 1; // 电梯单元高1，叠N层顶=顶单元底+1
        case 'block2': return base + 2;
        case 'ramp1': return base + 1;
        case 'ramp2': return base + 2;
        case 'bridge': return pc.deck !== undefined ? pc.deck : 1;
        default: return base; // arrow/button 贴面
      }
    }
    switch (pc.type) {
      case 'block1': case 'conveyor': case 'glow': case 'elevator': return t + 1;
      case 'block2': return t + 2;
      case 'ramp1': return t + 1;
      case 'ramp2': return t + 2;
      case 'bridge': return pc.deck !== undefined ? pc.deck : 1;
      default: return t >= 0 ? t : -99;
    }
  }

  // 桥的依附支撑：邻格必须是可依附积木（高度1/2方块、荧光方块、传送带、电梯、已搭好的桥），
  // 斜坡/箭头/按钮/地形不能依附。搭建时依附高度=邻居可依附积木的最高顶面（尽量往高搭）。
  const SUPPORTS = new Set(['block1', 'block2', 'glow', 'conveyor', 'elevator', 'bridge']);
  // 从链顶往下找第一个"可依附"积木——方块上叠着斜坡/箭头/按钮等不可依附件时透过它们
  // 认到底座（桥依附的是方块顶面，与上面叠了什么无关）
  function topSupportOf(npc) {
    let p = npc;
    while (p && !SUPPORTS.has(p.type)) p = p.under;
    return p;
  }
  // 单块积木自身的顶面高度（不含上面叠的东西）——桥依附的是"这块积木的顶面"，
  // 与它上面后来叠了什么无关（搭桥后再放更高积木/斜坡不塌桥）
  function unitTopOf(L, pc, nc, nr) {
    if (pc.type === 'bridge') return pc.deck !== undefined ? pc.deck : 1;
    const base = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : L.terr[nr][nc]) : L.terr[nr][nc];
    return base + (pc.type === 'block2' || pc.type === 'ramp2' ? 2 : 1);
  }
  // 邻格 (nc,nr) 对桥格 (c,r) 的所有可依附点高度：
  //  - 链中每块可依附积木（方块/荧光/传送带/电梯/已有桥）各自的顶面——任意方向
  //  - 高度1/2斜坡的背面顶——仅当桥格在斜坡高侧（背面朝向=rot）
  function attachTops(L, pm, nc, nr, c, r) {
    const tops = [];
    let p = pm.get(nc + ',' + nr);
    while (p) {
      if (p.type === 'ramp1' || p.type === 'ramp2') {
        const di = DIRS.findIndex(d => nc + d[0] === c && nr + d[1] === r);
        if (di === p.rot) tops.push(unitTopOf(L, p, nc, nr));
      } else if (SUPPORTS.has(p.type)) {
        tops.push(unitTopOf(L, p, nc, nr));
      }
      p = p.under;
    }
    return tops;
  }
  function bridgeSupport(L, pm, c, r) {
    let deck = null;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
      for (const t of attachTops(L, pm, nc, nr, c, r)) {
        if (deck === null || t > deck) deck = t;
      }
    }
    return deck;
  }
  // 桥是否仍被支撑（级联检查）：任一邻居存在高度恰为 deck 的可依附点。
  // 用"存在点"而非"最高点"判断——搭桥后再在旁边放更高积木/叠斜坡不应弄塌已有桥。
  function bridgeSupportAt(L, pm, c, r, deck) {
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
      if (attachTops(L, pm, nc, nr, c, r).indexOf(deck) >= 0) return true;
    }
    return false;
  }

  // 桥的"锚定"判定：deck 高度处是否（直接或经由其他不悬空的桥）连到真实积木。
  // 桥依附已有桥=间接依附那座桥底下的支撑——两座悬空桥互相依赖不算支撑（会循环假支撑）。
  // 多个支撑取并集：只要有一条链连通到非桥积木，桥就不塌。斜坡背面也算真实锚点。
  // 注意：依附看的是"那块积木自身的顶面"（unitTopOf）——底座上后来叠了更高的积木/斜坡
  // 不改变原依附点高度（搭桥后再放更高积木不塌桥）。
  function bridgeAnchored(L, pm, c, r, deck, visited) {
    visited = visited || new Set();
    if (visited.has(c + ',' + r)) return false;
    visited.add(c + ',' + r);
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
      let p = pm.get(nc + ',' + nr);
      while (p) {
        if (p.type === 'bridge') {
          if ((p.deck !== undefined ? p.deck : 1) === deck) {
            if (bridgeAnchored(L, pm, nc, nr, deck, visited)) return true;
          }
        } else if (p.type === 'ramp1' || p.type === 'ramp2') {
          const di = DIRS.findIndex(d => nc + d[0] === c && nr + d[1] === r);
          if (di === p.rot && unitTopOf(L, p, nc, nr) === deck) return true; // 斜坡背面=真实锚
        } else if (SUPPORTS.has(p.type)) {
          if (unitTopOf(L, p, nc, nr) === deck) return true; // 真实锚：与上面叠了什么无关
        }
        p = p.under;
      }
    }
    return false;
  }

  // ---------- 立柱连带下降（按钮触发时一次性计算，0.3s 动画内逐帧插值） ----------
  // 规则（用户定义）：立柱=可被按钮降下的凸起地形；柱上积木跟着柱一起降（相对位置不变）；
  // 桥"不能悬空、能不动就不动"——只有当它 deck 高度的所有依附支撑都在下降时才跟着降，
  // 只要还有一个不降的支撑（如地面上的积木）就原地不动；依附两个及以上立柱上的积木时，
  // 各柱同降、桥与各积木保持相对位置（各柱高度/地形一致时严格保持；不一致时桥跟随
  // "降得最浅"的支撑，保证新 deck 恰落在某支撑新顶面上，不悬空不穿透）。
  // 桥上方叠放的积木随桥一起降；桥下方被跨过的积木不动。
  function computePillarDescent(L, pm) {
    if (!L.pillars || !L.pillars.length) return null;
    const members = [];
    const fdByPc = new Map(); // pc -> 下降量（供桥支撑判定：该支撑是否在下降/降多少）
    // 种子：每根立柱格叠放链的非桥积木全部跟着柱降（桥一律走支撑判定，哪怕它在柱格链上）
    for (const pl of L.pillars) {
      const key = pl.c + ',' + pl.r;
      // 下降量 = 立柱自身高度 h（柱顶从 terr+h 降到 terr，柱上积木落到相当于直接放地面上）
      const fd = (pl.h === undefined ? 2 : pl.h);
      if (fd <= 0) continue;
      for (let pc = pm.get(key); pc; pc = pc.under) {
        if (pc.type === 'bridge') continue;
        fdByPc.set(pc, fd);
        members.push({ pc, prop: 'zAbs', orig: pc.zAbs !== undefined ? pc.zAbs : L.terr[pl.r][pl.c], fd });
      }
    }
    // 不动点：桥的 deck 高度依附支撑全部在下降 → 桥跟着降（fd=最浅下降支撑的 fd）
    const doneBridge = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
        for (let pc = pm.get(c + ',' + r); pc; pc = pc.under) {
          if (pc.type !== 'bridge' || doneBridge.has(pc)) continue;
          const deck = pc.deck !== undefined ? pc.deck : 1;
          let hasStatic = false;
          const fds = [];
          for (const [dc, dr] of DIRS) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
          for (let np = pm.get(nc + ',' + nr); np; np = np.under) {
            // 与 attachTops 相同的依附点规则：SUPPORTS 顶面（任意方向）/ 斜坡背面顶 / 桥-桥搭接（顶面=deck）
            let top = null;
            if (np.type === 'ramp1' || np.type === 'ramp2') {
              const di = DIRS.findIndex(d => nc + d[0] === c && nr + d[1] === r);
              if (di === np.rot) top = unitTopOf(L, np, nc, nr);
            } else if (np.type === 'bridge') {
              top = np.deck !== undefined ? np.deck : 1; // 桥依附于桥：本质是间接依附于桥下锚定的实体
            } else if (SUPPORTS.has(np.type)) {
              top = unitTopOf(L, np, nc, nr);
            }
            if (top !== deck) continue;
            if (fdByPc.has(np)) fds.push(fdByPc.get(np));
            else if (np.type === 'bridge') { /* 邻桥尚未判定：不算 static，留待下轮迭代跟随 */ }
            else hasStatic = true; // 有一个不降的支撑 → 桥原地不动
          }
            if (hasStatic) break;
          }
          if (!hasStatic && fds.length > 0) {
            doneBridge.add(pc);
            const fd = Math.min.apply(null, fds);
            fdByPc.set(pc, fd);
            members.push({ pc, prop: 'deck', orig: deck, fd });
            // 桥上方叠放物（非桥）跟随桥一起降；再上面的桥仍走支撑判定
            for (let up = pm.get(c + ',' + r); up && up !== pc; up = up.under) {
              if (up.type === 'bridge') continue;
              fdByPc.set(up, fd);
              members.push({ pc: up, prop: 'zAbs', orig: up.zAbs !== undefined ? up.zAbs : L.terr[r][c], fd });
            }
            changed = true;
          }
        }
      }
    }
    return members.length ? { members } : null;
  }
  // 恢复盘面到下降前（运行结束/新开一局时调用——运行与编辑态共享盘面）
  function restorePillarDescent(L) {
    const d = L && L._pillarDescent;
    if (!d) return;
    for (const m of d.members) m.pc[m.prop] = m.orig;
    L._pillarDescent = null;
  }

  function canPlace(L, pm, type, c, r, st) {
    st = st || {};
    if (c < 0 || r < 0 || c >= L.W || r >= L.H) return no(st, '出界了');
    if ((L.pieces[type] | 0) <= 0) return no(st, '没有这种积木了');
    const key = c + ',' + r;
    // 立柱=凸起地形：h=立柱自身高度（柱顶=地形+自身高），升起时可放积木（基准=柱顶 terr+h），降下后基准=地面 t
    if (L.pillarSet.has(key)) {
      const up = L._pillarsUp !== false;
      const base = up ? L.terr[r][c] + ((L.pillarH && L.pillarH.get(key)) || 2) : L.terr[r][c];
      const r2 = placeableAt(L, pm, type, c, r, base, st);
      // 柱格积木一律挂 zAbs=基准（柱顶/降下后地面）：否则非叠放块无位置信息，物理会按 terr 沉底
      // z 同步=基准（叠放底面语义统一：st.z 必须等于积木底面，game.place/applySolution 都读 st.z）
      if (r2.ok && !r2.on && type !== 'bridge') { r2.on = true; r2.zAbs = base; r2.z = base; }
      return r2;
    }
    if (L.hole.c === c && L.hole.r === r) return no(st, '洞里不能放');
    return placeableAt(L, pm, type, c, r, L.terr[r][c], st);
  }
  // 通用放置判定（t=该格"地形基准高度"：普通格=terr；立柱格=升起柱顶 h / 降下后 terr）
  function placeableAt(L, pm, type, c, r, t, st) {
    st = st || {};
    const key = c + ',' + r;
    const ex = pm.get(key);
    // 注意：荧光通路是"虚"的，**不参与放置判定**——可以在通路上、上方随便放积木（含在通路上方的桥上接着叠）。
    // 放置之后通路的存亡由 computeBeams 的遮挡判定负责：叠放积木顶面高度 > 通路高度（严格大于，等于不算）
    // 才会把通路挡断；桥是悬空的（只有桥面自身，底下是空的），永远不算遮挡。
    if (ex) {
      // 叠放规则：
      //  - 桥可以从已有积木/桥的上方跨过：依附高度（旁边支撑的最高顶面）必须高于该格结构顶面
      //  - 电梯只叠在电梯上（可叠成多层高塔，每层高 1）
      //  - 其他积木可叠在 高度1/2方块、荧光方块、已搭好的桥面 顶上（每格一层）
      //  - 桥不能叠桥（同高）；其他积木不能叠在电梯上
      //  - 积木顶面高度上限 15
      if (type === 'bridge') {
        const deck = bridgeSupport(L, pm, c, r);
        if (deck === null) return no(st, '桥要依附在方块类积木或已搭好的桥旁边');
        if (deck <= structureTop(L, ex, c, r)) return no(st, '这一格已有积木，不比桥面矮，桥搭不上去');
        if (deck > 15) return no(st, "超过搭建高度上限了");
        if (!bridgeAnchored(L, pm, c, r, deck)) return no(st, '依附的支撑悬在空中，桥搭上去也会塌');
        return { ok: true, z: deck, deck, under: ex }; // under=被跨过的积木（放置时挂链保住）
      }
      if (type === 'elevator') {
        // 电梯可叠在可作底座的积木顶（方块/荧光/桥面）或电梯上——与普通积木的叠放底座一致
        const exBase = (ex.type === 'block1' || ex.type === 'block2' || ex.type === 'glow' || ex.type === 'bridge' || ex.type === 'elevator');
        if (!exBase) return no(st, '电梯只能叠放在方块、荧光方块、桥面或电梯上');
        if (structureTop(L, ex, c, r) + 1 > 15) return no(st, "超过搭建高度上限了");
        return { ok: true, on: true, z: structureTop(L, ex, c, r) };
      }
      if (ex.type === 'elevator') return no(st, '这一格已经被占了');
      // 荧光方块上可叠放任何非桥积木（与普通方块叠放逻辑一致）；
      // 荧光块上方叠积木不影响已形成的通路（光束高度=荧光块顶面，不受叠层影响）。
      // 桥不能叠放在任何积木上（最前面已拦截）。
      // 多层叠放允许：只要顶面是可作底座的积木（方块/荧光/桥面）就能继续往上叠（上限 15）
      const exBase = (ex.type === 'block1' || ex.type === 'block2' || ex.type === 'glow' || ex.type === 'bridge');
      if (!exBase) return no(st, '这一格已经被占了');
      const zTop = structureTop(L, ex, c, r) + (type === 'arrow' || type === 'button' ? 0 : (type === 'block2' || type === 'ramp2' ? 2 : 1));
      if (zTop > 15) return no(st, "超过搭建高度上限了");
      return { ok: true, on: true, z: structureTop(L, ex, c, r) };
    }
    if (type === 'bridge') {
      const deck = bridgeSupport(L, pm, c, r);
      if (deck === null) return no(st, '桥要依附在方块类积木或已搭好的桥旁边');
      // 支撑链必须最终连到真实积木：若最高依附只是悬空桥链，放上去也会塌，直接拒绝
      if (!bridgeAnchored(L, pm, c, r, deck)) return no(st, '依附的支撑悬在空中，桥搭上去也会塌');
      if (t >= 0 && deck <= t) return no(st, '这里地势比桥面还高');
      if (t < 0 && deck <= 0) return no(st, '桥不能悬空'); // 缺口上方：只要依附高度>0 就能架桥
      if (deck > 15) return no(st, "超过搭建高度上限了");
      return { ok: true, z: deck, deck };
    }
    if (t < 0) return no(st, '悬空放不了');
    if (type === 'button') return { ok: true, z: t };
    if (pieceTopZ(L, { type }, c, r, t) > 15) return no(st, "超过搭建高度上限了");
    return { ok: true, z: pieceTopZ(L, { type }, c, r, t) };
  }
  function no(st, msg) { st.msg = msg; return { ok: false, msg }; }

  // ---------- 表面查询 ----------
  // 返回该格在高度 z、行进方向 d 下可通行的表面信息，null=坠落
  // surface: {kind, z, exit(dir 变换后), zOut, ramp?, belt?, turn?}
  function surfaceAt(L, pm, glowCtx, c, r, z, d) {
    if (c < 0 || r < 0 || c >= L.W || r >= L.H) return null;
    const key = c + ',' + r;
    const t = L.terr[r][c];
    const pc = pm.get(key);
    // 目标洞
    if (L.hole.c === c && L.hole.r === r) {
      if (glowCtx.holeOpen) { if (z === L.hole.z) return { kind: 'hole', z, exit: d, zOut: z }; }
      else { if (z === L.hole.z) return { kind: 'flat', z, exit: d, zOut: z }; }
      return null; // 高于洞口 → 坠入/坠落
    }
    // 立柱：凸起地形——柱顶=地形+自身高 h；升起时柱顶可滚（z===top 且柱顶无积木），柱身挡球（跨界判撞）；下降中经过=碎；降完=普通地面
    if (L.pillarSet.has(key)) {
      if (glowCtx.pillarFall !== undefined && glowCtx.pillarFall >= 0 && glowCtx.pillarFall < 1) return null; // 下降中：一律无表面（跨界判碎）
      if (glowCtx.pillarsUp) {
        const top = t + ((L.pillarH && L.pillarH.get(key)) || 2);
        if (z < top) return null; // 柱身（跨界判碎）；柱格上空的积木链走下方扫描
        if (z === top && !pm.get(key)) return { kind: 'flat', z, exit: d, zOut: z }; // 柱顶平滚（无积木时）
        // z>top 或柱顶有积木：柱格上空/积木链 → 走下方链扫描（坠落/块顶判定）
      }
      // pillarsUp=false：降完 → 普通地面（走下方 t 逻辑）
    }
    // 玩家积木：从链顶往下扫描整条叠放链——
    //  ① 某段积木在球的高度提供表面（顶面/桥面/斜坡进出/箭头…）→ 返回该表面；
    //  ② 某段积木占据球体空间（球高约 1，略小于 1）→ 挡死（坠落/撞碎）；
    //  ③ 桥下通行：桥自身高 1，桥面比球底高 ≥2 即可从桥下通过（缺口上方同样成立）。
    // 只看链顶是错的——桥上叠了斜坡等积木时，桥会被"遮住"，球从桥下经过就会误判。
    for (let pc = pm.get(key); pc; pc = pc.under) {
      const base = structureTop(L, pc, c, r);
      // 该段积木的实体跨度 [pLo, pHi]（用于判断是否占据球体空间）
      let pLo = base, pHi = base;
      if (pc.type === 'block2' || pc.type === 'ramp2') pLo = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : t) : base - 2;
      else if (pc.type === 'ramp1') pLo = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : t) : base - 1;
      else if (pc.type === 'block1' || pc.type === 'conveyor' || pc.type === 'glow') pLo = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : t) : t;
      else if (pc.type === 'bridge') pLo = (pc.deck !== undefined ? pc.deck : 1) - 1;
      switch (pc.type) {
        case 'block1': case 'block2': case 'conveyor': case 'glow': {
          if (z === base) {
            if (pc.type === 'conveyor') return { kind: 'belt', z, exit: d, zOut: z, bd: pc.rot };
            return { kind: 'flat', z, exit: d, zOut: z };
          }
          break;
        }
        case 'bridge': {
          if (z === base) return { kind: 'flat', z, exit: d, zOut: z };
          // 桥下通行：不在此处提前返回——桥板不挡球由下方 occupy 检查自然处理
          // （桥面比球底高 ≥2 时 occupy 不触发），继续扫描链的下层积木/地面找真正的表面
          // （楼梯关：桥下还有被埋的箭头/斜坡/方块，提前返回会错过它们）
          break;
        }
        case 'ramp1': case 'ramp2': {
          const lo = pc.on ? (pc.zAbs !== undefined ? pc.zAbs : t) : (t >= 0 ? t : base - (pc.type === 'ramp2' ? 2 : 1));
          const hi = base, dd = hi - lo;
          const high = pc.rot, low = (pc.rot + 2) % 4;
          const entry = (d + 2) % 4; // 从哪条边进入
          if (entry === low && z === lo) return { kind: 'ramp', z, exit: high, zOut: hi, dz: +dd };
          if (entry === high && z === hi) return { kind: 'ramp', z, exit: low, zOut: lo, dz: -dd };
          break;
        }
        case 'elevator': {
          // 电梯塔（可多层叠放，塔底可垫方块/荧光/桥面/立柱顶）：四面都有门，与朝向无关。
          // 从塔顶高度滚入 → 送到底；从底部/中间任何一级滚入 → 一律送到顶（用户规则：默认向上）。
          // 只垂直运送不改变球方向（exit=d）；非整数高度（坠落中撞塔身）=碎
          // 塔底 lo = under 链中第一个非电梯积木（底座）的顶面；
          // 无底座时：柱格=柱顶（terr+自身高，电梯直接叠在柱顶），否则=地形高度
          let lo = L.terr[r][c];
          let hasBase = false;
          for (let u = pc.under; u; u = u.under) {
            if (u.type === 'elevator') continue;
            lo = structureTop(L, u, c, r);
            hasBase = true;
            break;
          }
          if (!hasBase && L.pillarSet.has(key) && glowCtx.pillarsUp !== false) {
            lo = t + ((L.pillarH && L.pillarH.get(key)) || 2); // 电梯直接叠柱顶且柱升起：塔底=柱顶（此前误用 terr，送底会穿进立柱）
          } // 柱已降（pillarsUp=false）：塔连带落到地面，lo=terr=0，塔身 [0,顶] 照常挡球
          const hi = base;
          if (hi > lo) {
            if (z === hi) return { kind: 'lift', z, exit: d, zOut: lo };
            if (Number.isInteger(z) && z >= lo && z < hi) return { kind: 'lift', z, exit: d, zOut: hi };
          }
          pLo = lo;
          break;
        }
        case 'arrow': {
          const az = pc.on ? pc.zAbs : t;
          if (z === az) return { kind: 'turn', z, exit: pc.rot, zOut: z };
          pLo = az; pHi = az;
          break;
        }
        case 'button': {
          const bz = pc.on ? pc.zAbs : t;
          if (z === bz) return { kind: 'button', z, exit: d, zOut: z };
          pLo = bz; pHi = bz;
          break;
        }
      }
      // 实体占据球体空间（球体 [z, z+1)，实际略小于 1）→ 挡死
      if (pLo < z + 1 && pHi > z) return null;
    }
    if (t >= 0) {
      if (z === t) return { kind: 'floor', z, exit: d, zOut: z };
    }
    // 荧光光束
    const beam = glowCtx.beams.get(key);
    // 荧光通路是"路"：球在通路上任意方向都能走（不只沿两端连线方向，垂直方向也可）
    if (beam && beam.z === z) return { kind: 'beam', z, exit: d, zOut: z };
    return null;
  }

  // 计算荧光光束（在 pieces 变化后调用）
  // 同一行或同一列、等高的两块荧光方块之间架起光桥（4 个方向都查）
  // 荧光块上叠放任何积木都不影响它作为光束源（透过叠层找荧光块）；
  // 通路上有超过光束高度的物体（严格大于，等于=恰好贴着不算）才挡断光束
  function glowUnder(pc) {
    let p = pc;
    while (p) {
      if (p.type === 'glow') return p;
      p = p.under;
    }
    return null;
  }
  // ---------- 挡光判定：只看"光通路那一层到底有没有实体" ----------
  // 球在高度 z 滚，球体占据 [z, z+1] 这一层空间；光束也在 z 这一层。
  // 所以遮挡就是"某块实体把 z 这一层占住了"，和它顶面多高无关——
  // 高处的积木（比如搭在光通路上方的桥上、离地 6 格）顶面再高，z 这一层也是空的，不挡光。
  // 各积木占据的高度区间：
  //   叠放积木： [底面 base, base + 自身高)     ← block1/glow/conveyor/ramp1 高 1，block2/ramp2 高 2
  //   箭头/按钮：高度 0（贴面薄片），不占任何层 → 永不挡光
  //   桥：       悬空桥面，只占桥面自身那一层 [deck-1, deck)，桥面以下全是空的
  function unitBaseOf(L, p, c, r) {
    return p.on ? (p.zAbs !== undefined ? p.zAbs : L.terr[r][c]) : L.terr[r][c];
  }
  function unitHOf(p) {
    if (p.type === 'arrow' || p.type === 'button') return 0;
    if (p.type === 'block2' || p.type === 'ramp2') return 2;
    return 1;
  }
  function solidAtZ(L, pc, c, r, z) {
    for (let p = pc; p; p = p.under) {
      if (p.type === 'bridge') {
        const deck = p.deck !== undefined ? p.deck : 1;
        if (z >= deck - 1 && z < deck) return true; // 桥面自身那一层
        continue;                                   // 桥面上下都是空的
      }
      const base = unitBaseOf(L, p, c, r), h = unitHOf(p);
      if (h > 0 && z >= base && z < base + h) return true;
    }
    return false;
  }
  function computeBeams(L, pm) {
    const beams = new Map();
    const glows = [];
    for (const [key, pc] of pm) {
      const gpc = glowUnder(pc);
      if (!gpc) continue;
      const [c, r] = key.split(',').map(Number);
      glows.push({ c, r, z: structureTop(L, gpc, c, r) });
    }
    // 沿 (fromC,fromR) 的 d 方向扫一格一格（不含起点）：
    // end='glow' 撞到等高荧光块（连通）；'block' 被挡；'exit' 扫出网格（可能命中传送门）
    function scan(fromC, fromR, d, z) {
      const [dc, dr] = DIRS[d];
      let c = fromC + dc, r = fromR + dr;
      const cells = [];
      while (c >= 0 && r >= 0 && c < L.W && r < L.H) {
        const key = c + ',' + r;
        const t = L.terr[r][c];
        const pc = pm.get(key);
        if (L.pillarSet.has(key) && glowCtxStaticUp) {
          const ph = (L.pillarH && L.pillarH.get(key)) || 2;
          if (t + ph > z) return { cells, end: 'block' }; // 升起立柱高 h：超过光束高度才挡（等于=贴着不算）
        }
        if (pc) {
          const gpc = glowUnder(pc);
          if (gpc) {
            // 撞到荧光块：等高才算连通，否则视为遮挡
            return { cells, end: structureTop(L, gpc, c, r) === z ? 'glow' : 'block' };
          }
          // 遮挡=光通路那一层（z）被实体占住；高处积木顶面再高也不挡（判定见 solidAtZ）
          if (solidAtZ(L, pc, c, r, z)) return { cells, end: 'block' };
        }
        if (t > z) return { cells, end: 'block' };            // 地势挡光
        cells.push(key);
        c += dc; r += dr;
      }
      // 出界：只有西墙(L)/北墙(R)有传送门（与 crossEdge 的墙体命名一致）
      const wall = c < 0 ? 'L' : (r < 0 ? 'R' : null);
      if (wall) return { cells, end: 'exit', wall, idx: wall === 'L' ? r : c };
      return { cells, end: 'block' };
    }
    // 某面墙 idx 处、光束高度正好等高的传送门
    function portalAt(wall, idx, z) {
      return L.portals.find(p => p.wall === wall && p.idx === idx && p.z === z) || null;
    }
    // 从门的内侧起点沿"向内"方向扫，看是否连着等高荧光块
    //   L 墙（西）：门在列 -1 外侧，向内=东；R 墙（北）：门在行 -1 外侧，向内=南
    function portalSeesGlow(p) {
      const d = p.wall === 'L' ? 0 : 1;
      const c0 = p.wall === 'L' ? -1 : p.idx;
      const r0 = p.wall === 'L' ? p.idx : -1;
      return scan(c0, r0, d, p.z).end === 'glow';
    }
    for (const g of glows) {
      for (let d = 0; d < 4; d++) { // 东/南/西/北 全方向
        const res = scan(g.c, g.r, d, g.z);
        if (res.end === 'glow') {
          for (const key of res.cells) beams.set(key, { z: g.z, axis: d });
          continue;
        }
        if (res.end !== 'exit') continue;
        // 光带扫到墙边且正好命中同高传送门 → 尝试穿门：
        // 要求该门有同灯数的配对门，且配对门内侧也连着等高荧光块
        const p = portalAt(res.wall, res.idx, g.z);
        if (!p) continue;
        const pair = (L.pairs || []).find(pr => pr.includes(p));
        if (!pair) continue;
        const other = pair[0] === p ? pair[1] : pair[0];
        if (!portalSeesGlow(other)) continue;
        for (const key of res.cells) beams.set(key, { z: g.z, axis: d });
      }
    }
    return beams;
  }
  let glowCtxStaticUp = true; // computeBeams 阶段立柱视为升起（挡光）

  // ---------- 运行时 ----------
  function newRun(L, pm) {
    restorePillarDescent(L); // 上一局按钮降下的积木恢复原位（运行与编辑态共享盘面）
    // 重算光束：restore 恢复了原始位置，但 L._beams 可能还是上一局柱降后的旧值
    L._beams = computeBeams(L, pm);
    const holeOpen = L.portals.length === 0; // 无传送门则直接开
    const ctx = {
      holeOpen,
      pillarsUp: L.pillars.length > 0,
      pillarFall: -1, // 立柱下降动画进度：-1=未触发；0~1=下降中；>=1=降完（pillarsUp 同步置 false）
      portalsUsed: new Set(),
      // 光束与编辑态共享同一份（L._beams）：滚动中放置/去除积木即时重算并生效
      beams: L._beams || computeBeams(L, pm),
    };
    L._pillarsUp = true; // 运行态立柱升起（canPlace 基准=柱顶）；按钮降完动画后置 false
    const s = L.start;
    const [dc, dr] = s.wall === 'L' ? DIRS[0] : DIRS[1];
    const ball = {
      x: s.wall === 'L' ? 0.02 : s.idx + 0.5,
      y: s.wall === 'L' ? s.idx + 0.5 : 0.02,
      z: s.z, dir: s.wall === 'L' ? 0 : 1,
      v2: (s.v0 || 3.6) * (s.v0 || 3.6),
      mode: 'roll', t: 0, vz: 0,
      ramp: null, turn: undefined, holeCell: false,
    };
    const R = { L, pm, ctx, ball, events: [], done: false, result: null, time: 0 };
    // 出生格必须有支撑面（传送带/按钮/箭头效果立即生效）
    const sc = Math.floor(ball.x), sr = Math.floor(ball.y);
    const spawnSurf = surfaceAt(L, pm, ctx, sc, sr, ball.z, ball.dir);
    if (!spawnSurf) startFall(R, sc, sr);
    else applySurface(R, spawnSurf, sc, sr, ball.dir, true);
    return R;
  }

  // 跨界处理：从 格(c,r) 以方向 d 越界到邻格。调用前球已位于 (c,r) 的 d 侧边缘。
  function crossEdge(R, c, r, d) {
    const { L, pm, ctx, ball } = R;
    const [dc, dr] = DIRS[d];
    const nc = c + dc, nr = r + dr;
    const ev = R.events;
    // 撞墙 / 传送门
    if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) {
      const wall = nc < 0 ? 'L' : (nr < 0 ? 'R' : null);
      if (wall) {
        const idx = wall === 'L' ? r : c;
        const pi = L.portals.findIndex(p => p.wall === wall && p.idx === idx && p.z === ball.z);
        if (pi >= 0) {
          const p = L.portals[pi];
          const pair = L.pairs.find(pr => pr.includes(p));
          const other = pair[0] === p ? pair[1] : pair[0];
          ctx.portalsUsed.add(pair[0].wall + pair[0].idx + '-' + pair[1].wall + pair[1].idx);
          if (ctx.portalsUsed.size >= L.pairs.length && !ctx.holeOpen) {
            ctx.holeOpen = true; ev.push({ type: 'holeopen' });
          }
          ev.push({ type: 'portal' });
          ball.x = other.wall === 'L' ? 0.001 : other.idx + 0.5;
          ball.y = other.wall === 'L' ? other.idx + 0.5 : 0.001;
          ball.z = other.z;
          ball.dir = other.wall === 'L' ? 0 : 1;
          // 出口格必须有承接面
          const ec = Math.floor(ball.x), er = Math.floor(ball.y);
          const surf = surfaceAt(L, pm, ctx, ec, er, ball.z, ball.dir);
          if (!surf) { startFall(R, ec, er); return; }
          applySurface(R, surf, ec, er, ball.dir, true);
          return;
        }
      }
      ev.push({ type: 'shatter', reason: 'wall' });
      R.done = true; R.result = 'shatter';
      return;
    }
    // 立柱：下降中经过=碎；升起时撞柱身（球低于柱顶=地形+自身高）=碎；球与柱顶平齐=柱顶平滚（surfaceAt flat）
    if (L.pillarSet.has(nc + ',' + nr)) {
      const falling = ctx.pillarFall >= 0 && ctx.pillarFall < 1;
      const top = L.terr[nr][nc] + ((L.pillarH && L.pillarH.get(nc + ',' + nr)) || 2);
      if (falling || (ctx.pillarsUp && ball.z < top - 1e-6)) {
        ev.push({ type: 'shatter', reason: 'pillar' });
        R.done = true; R.result = 'shatter';
        return;
      }
      // 球 z===柱顶：合法（柱顶平接，surfaceAt flat）；球 z>柱顶：柱格上空（surfaceAt 坠落）
    }
    // 洞：平齐且开 → 滚向洞心；盖板/坠落交给 surfaceAt
    const holeHere = L.hole.c === nc && L.hole.r === nr;
    if (holeHere && ctx.holeOpen && ball.z === L.hole.z) {
      ball.holeCell = true;
      return;
    }
    const surf = surfaceAt(L, pm, ctx, nc, nr, ball.z, d);
    if (!surf) { startFall(R, nc, nr); return; }
    applySurface(R, surf, nc, nr, d, false);
  }

  function startFall(R, nc, nr) {
    const { ball } = R;
    ball.mode = 'fall'; ball.t = 0; ball.vz = 0;
    ball.fx = nc; ball.fy = nr; // 坠落目标格
  }

  function applySurface(R, surf, nc, nr, d, fromPortal) {
    const { L, ball, ctx, events: ev } = R;
    ball.beltStuck = false; // 离开传送带即解除卡住状态
    switch (surf.kind) {
      case 'turn': {
        if (!fromPortal) { ball.turn = surf.exit; } // 到格中心时转向
        else {
          // 从传送门/出生点出来时，转向是立刻生效的（球就在出口墙边）。
          // 此时必须先把球摆到出口格中心再转，否则它会沿着墙那条边一直滚下去
          // （L24：从 L5 门传到 L3 门，出口格箭头朝北 → 球贴着 c=0 的西墙滚到洞）。
          ball.x = nc + 0.5; ball.y = nr + 0.5;
          ball.dir = surf.exit;
        }
        break;
      }
      case 'ramp': {
        ball.ramp = { c: nc, r: nr, zFrom: surf.z, zTo: surf.zOut, d };
        ball.dir = d;
        break;
      }
      case 'lift': {
        // 传送门直接落进电梯格：先把球摆到格中心，升降动画期间才在电梯板上（而不是贴墙）
        if (fromPortal) { ball.x = nc + 0.5; ball.y = nr + 0.5; }
        ball.mode = 'lift'; ball.t = 0;
        ball.lift = { c: nc, r: nr, zFrom: surf.z, zTo: surf.zOut, exit: surf.exit, enter: d };
        ev.push({ type: 'lift' });
        break;
      }
      case 'belt': {
        if (d === surf.bd) { // 滚动方向与传送带方向一致 → 推一把
          ball.v2 = Math.max(ball.v2 + BOOST, BELT_MIN);
          ev.push({ type: 'belt' });
        } else { // 方向不符 → 球被卡在传送带上，动能快速耗尽后复位
          ball.beltStuck = true;
          ev.push({ type: 'stuck' });
        }
        ball.dir = d;
        break;
      }
      case 'button': {
        if (ctx.pillarsUp && ctx.pillarFall < 0) {
          ctx.pillarFall = 0;
          // 计算连带下降簇：柱上积木 + 被牵连的桥（deck 支撑全降才跟着降）+ 桥上叠放物
          ctx.descent = computePillarDescent(L, R.pm);
          L._pillarDescent = ctx.descent; // 供运行结束/新开一局恢复盘面
          ev.push({ type: 'button' });
        } // pillarsUp 保持 true 直到降完
        ball.dir = d;
        break;
      }
      case 'hole': {
        // 球直接落到开着的洞格表面（传送门出口=洞格等路径）：滚向洞心后掉入。
        // 之前缺这个 case 走 default，球会在开着的洞上滚过去（L11 bug）
        ball.holeCell = true;
        ball.dir = d;
        break;
      }
      default: ball.dir = d;
    }
  }

  // 单步推进 dt 秒
  function step(R, dt) {
    if (R.done) return;
    const { L, pm, ctx, ball, events: ev } = R;
    R.time += dt;
    // 立柱下降动画推进（0.3 秒降 h 格）：柱上积木/被牵连的桥逐帧同步下移（相对位置不变）；
    // 降完 → pillarsUp=false（柱格变普通地面，柱上积木落在降后位置）
    if (ctx.pillarFall >= 0 && ctx.pillarFall < 1) {
      ctx.pillarFall = Math.min(1, ctx.pillarFall + dt / 0.3);
      if (ctx.descent) {
        const f = Math.min(ctx.pillarFall, 1);
        for (const m of ctx.descent.members) m.pc[m.prop] = m.orig - m.fd * f;
      }
      if (ctx.pillarFall >= 1) {
        ctx.pillarFall = 1; ctx.pillarsUp = false; L._pillarsUp = false;
        // 动态光桥：柱降完成后重算光束（荧光块位置已更新到新高度）
        glowCtxStaticUp = false; // 柱已降，不再挡光
        ctx.beams = computeBeams(L, pm);
        L._beams = ctx.beams;
        glowCtxStaticUp = true; // 恢复（编辑态柱仍视为升起）
      }
    }
    const c = Math.floor(ball.x), r = Math.floor(ball.y);
    const inB = c >= 0 && r >= 0 && c < L.W && r < L.H;

    if (ball.mode === 'dropin') {
      ball.t += dt;
      if (ball.t >= 0.45) { R.done = true; R.result = 'win'; ev.push({ type: 'win' }); }
      return;
    }
    if (ball.mode === 'fall') {
      ball.vz += 26 * dt;
      ball.z -= ball.vz * dt;
      const speed = Math.sqrt(Math.max(0, ball.v2));
      const [dc, dr] = DIRS[ball.dir];
      ball.x += dc * speed * dt; ball.y += dr * speed * dt;
      const fc = Math.floor(ball.x), fr = Math.floor(ball.y);
      // 坠入开的洞：落进洞杯 → 进洞得分
      if (ctx.holeOpen && fc === L.hole.c && fr === L.hole.r && ball.z <= L.hole.z) {
        ball.x = L.hole.c + 0.5; ball.y = L.hole.r + 0.5;
        ball.z = L.hole.z;
        ball.mode = 'dropin'; ball.t = 0; ball.vz = 0;
        return;
      }
      if (fr < 0 || fr >= L.H || fc < 0 || fc >= L.W) {
        if (ball.z < -4) { ev.push({ type: 'shatter', reason: 'void' }); R.done = true; R.result = 'shatter'; }
        return;
      }
      const t = L.terr[fr][fc];
      const key = fc + ',' + fr;
      const pc = pm.get(key);
      const top = pc ? structureTop(L, pc, fc, fr) : t;
      if (t >= 0 && ball.z <= t || (pc && ball.z <= top)) {
        ev.push({ type: 'shatter', reason: 'ground' }); R.done = true; R.result = 'shatter'; return;
      }
      if (ball.z < -4) {
        ev.push({ type: 'shatter', reason: 'void' }); R.done = true; R.result = 'shatter'; return;
      }
      return;
    }
    if (ball.mode === 'lift') {
      ball.t += dt;
      const lf = ball.lift;
      const k = Math.min(1, ball.t / 0.9);
      // 平滑升降（easeInOutQuad）：金属板带着球缓起缓停
      const ez = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ball.z = lf.zFrom + (lf.zTo - lf.zFrom) * ez;
      if (ball.t >= 0.9) {
        ball.z = lf.zTo;
        // 电梯不消耗动能（原版特例）：速度保持
        const [dc, dr] = DIRS[lf.exit];
        ball.x = lf.c + 0.5 + dc * 0.5; ball.y = lf.r + 0.5 + dr * 0.5;
        ball.mode = 'roll'; ball.ramp = null;
        crossEdge(R, lf.c, lf.r, lf.exit);
        if (R.done || ball.mode !== 'roll') return;
        if (ball.dir === 0) ball.x += 1e-6; else if (ball.dir === 1) ball.y += 1e-6;
        else if (ball.dir === 2) ball.x -= 1e-6; else ball.y -= 1e-6;
      }
      return;
    }
    // roll：事件距离法（边缘穿越 / 中心转向 / 洞心坠落）
    while (true) {
      if (ball.v2 <= STALL && !(ball.ramp && (ball.ramp.zTo - ball.ramp.zFrom) < 0)) {
        ev.push({ type: 'stall' }); R.done = true; R.result = 'stall'; return;
      }
      if (ball.v2 < 0.05) ball.v2 = 0.05;
      const speed = Math.sqrt(ball.v2);
      let dist = speed * dt;
      // 斜坡 z 随进度插值
      if (ball.ramp) {
        const rp = ball.ramp;
        ball.z = rp.zFrom + (rp.zTo - rp.zFrom) * clamp01(axisProgress(ball, rp));
      }
      let guard = 0;
      while (dist > 1e-9 && !R.done && guard++ < 64) {
        const c2 = Math.floor(ball.x), r2 = Math.floor(ball.y);
        const [dc, dr] = DIRS[ball.dir];
        // 到当前格边缘的距离
        let toEdge;
        if (ball.dir === 0) toEdge = (c2 + 1) - ball.x;
        else if (ball.dir === 1) toEdge = (r2 + 1) - ball.y;
        else if (ball.dir === 2) toEdge = ball.x - c2;
        else toEdge = ball.y - r2;
        // 到格中心的距离（转向/进洞事件）
        let toCenter = Infinity;
        if (ball.turn !== undefined || ball.holeCell) {
          toCenter = (c2 + 0.5 - ball.x) * dc + (r2 + 0.5 - ball.y) * dr;
          if (toCenter < 1e-9) toCenter = 1e-9;
        }
        const stepd = Math.min(dist, toEdge, toCenter);
        // 能量：摩擦 + 重力（被传送带卡住时摩擦×8，动能快速耗尽）
        let dzRate = 0;
        if (ball.ramp) dzRate = ball.ramp.zTo - ball.ramp.zFrom;
        ball.v2 += (-2 * G * dzRate - FRI * (ball.beltStuck ? 8 : 1)) * stepd;
        if (ball.v2 <= STALL && !(ball.ramp && dzRate < 0)) {
          ev.push({ type: 'stall' }); R.done = true; R.result = 'stall'; return;
        }
        if (ball.v2 < 0.05) ball.v2 = 0.05;
        ball.x += dc * stepd; ball.y += dr * stepd;
        dist -= stepd;
        if (ball.ramp) {
          const rp = ball.ramp;
          ball.z = rp.zFrom + (rp.zTo - rp.zFrom) * clamp01(axisProgress(ball, rp));
        }
        const atCenter = toCenter <= stepd + 1e-9;
        const atEdge = toEdge <= stepd + 1e-9;
        if (atCenter && toCenter <= toEdge + 1e-9) {
          const cx = c2 + 0.5, cy = r2 + 0.5;
          ball.x = cx; ball.y = cy;
          if (ball.turn !== undefined) {
            ball.dir = ball.turn; ball.turn = undefined;
            ev.push({ type: 'turn' });
            continue; // 新方向上重新计算
          }
          if (ball.holeCell) {
            ball.mode = 'dropin'; ball.t = 0; ball.holeCell = false;
            return;
          }
        }
        if (atEdge) {
          if (ball.ramp) { ball.z = ball.ramp.zTo; ball.ramp = null; }
          if (ball.dir === 0) ball.x = c2 + 1; else if (ball.dir === 1) ball.y = r2 + 1;
          else if (ball.dir === 2) ball.x = c2; else ball.y = r2;
          crossEdge(R, c2, r2, ball.dir);
          if (R.done || ball.mode !== 'roll') return;
          // 轻推进新格，避免 floor 归属回旧格
          if (ball.dir === 0) ball.x += 1e-6; else if (ball.dir === 1) ball.y += 1e-6;
          else if (ball.dir === 2) ball.x -= 1e-6; else ball.y -= 1e-6;
          continue;
        }
      }
      if (R.done || ball.mode !== 'roll') return;
      if (guard >= 64) return; // 安全阀
      break; // 本帧距离耗尽
    }
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function axisProgress(ball, rp) {
    // 沿斜坡轴的进度 0..1
    if (rp.d === 0) return ball.x - rp.c;
    if (rp.d === 1) return ball.y - rp.r;
    if (rp.d === 2) return (rp.c + 1) - ball.x;
    return (rp.r + 1) - ball.y;
  }

  // 完整模拟（验证器用）
  function simulate(L, pm, maxTime) {
    const R = newRun(L, pm);
    const dt = 1 / 120;
    const lim = (maxTime || 60) / dt;
    let i = 0;
    while (!R.done && i < lim) { step(R, dt); i++; }
    if (!R.done) { R.done = true; R.result = 'timeout'; }
    return R;
  }

  // 供验证器：应用 solution
  function applySolution(L, sol) {
    const pm = new Map();
    const counts = Object.assign({}, L.pieces);
    for (const s of sol || []) {
      const st = canPlace(L, pm, s.p, s.c, s.r);
      if (!st.ok) throw new Error(`[${L.name}] 无法放 ${s.p}@(${s.c},${s.r}): ${st.msg}`);
      // 显式 on 标记校验：手写 sol 的叠放声明必须与盘面推导一致（保证 sol 保真，供提示功能还原）
      if (s.on !== undefined && !!s.on !== !!st.on) {
        throw new Error(`[${L.name}] ${s.p}@(${s.c},${s.r}) on:${s.on} 与盘面不符（应为 ${st.on ? 'on:true' : '不写 on'}）`);
      }
      const pc = { type: s.p, rot: s.rot || 0 };
      if (s.p === 'bridge' && st.deck !== undefined) pc.deck = st.deck; // 桥面高度=依附积木顶面
      if (st.on) {
        pc.on = true; pc.zAbs = st.z;
        // 保留被叠的底座（渲染/收回时用）
        pc.under = pm.get(s.c + ',' + s.r);
      } else if (st.under) {
        pc.under = st.under; // 桥从已有积木上方跨过：挂链保住下方积木（楼梯双层结构必需）
      }
      pm.set(s.c + ',' + s.r, pc);
      counts[s.p]--;
    }
    return pm;
  }

  const API = {
    DIRS, FRI, G, BOOST, STALL, V2_0, PILLAR_TOP,
    parseLevel, canPlace, pieceTopZ, structureTop, computeBeams, bridgeSupport, bridgeSupportAt, bridgeAnchored,
    newRun, step, simulate, applySolution, surfaceAt, restorePillarDescent,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else globalThis.ISOSIM = API;
})();
