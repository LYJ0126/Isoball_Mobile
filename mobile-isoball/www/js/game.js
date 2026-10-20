/* Isoball X 重制版 — 游戏主控
 * 编辑态：托盘选积木 → 点格放置；点已放积木 → 旋转/收回浮钮；ERASE 模式直接收回
 * 运行态：START → rAF 驱动 sim；win=CLEAR 覆盖层 / shatter·stall=自动回编辑态
 */
(function () {
  'use strict';
  const SIM = window.ISOSIM;
  const $ = (id) => document.getElementById(id);

  // ---------- 状态 ----------
  const S = {
    li: 0, L: null,        // 当前关（L 为 parse 后副本）
    inv: {},               // 剩余库存
    pm: new Map(),         // 已放置积木
    sel: null,             // 托盘选中 {p}
    erase: false,
    mode: 'edit',          // edit | run | over
    run: null,
    parts: [],             // 碎片粒子
    float: null,           // 浮钮 {c,r,key,pc}
    ghostBadT: 0,
    ghostBadCell: null,    // 无效放置红面位置 {c,r}（点击/松手后红一下）
    stallT: 0, overT: 0,
    drag: null,            // 托盘拖拽 {type,id,sx,sy,moved,toggle}
    dragCell: null,        // 拖拽悬停格
    saves: [],             // 三存档 [{cleared}×3]
    saveIdx: 0,            // 当前存档
    help: false,           // 提示（通关攻略）模式：盘面=本关 sol，只读，左下角按钮=退出
    helpBackup: null,      // 点提示时的盘面快照：退出攻略要还原成这个（换关即作废）
  };

  // ---------- 三存档系统 ----------
  // 存档只记录通关数 cleared（0..TOTAL）。可玩关 = 关卡序号 ≤ cleared。
  const SAVES_KEY = 'isoballx_saves_v1';
  const CUR_KEY = 'isoballx_cur_v1';
  const BAK_KEY = 'isoballx_saves_v1_bak'; // 双写备份：主档被误清/损坏时自动从备份恢复
  const TOTAL = () => (typeof LEVELS !== "undefined" ? LEVELS : window.LEVELS).length;

  function loadSaves() {
    let arr = null;
    try { arr = JSON.parse(localStorage.getItem(SAVES_KEY) || 'null'); } catch (e) { void e; }
    if (!Array.isArray(arr) || arr.length !== 3) {
      // 主存档缺失/损坏：尝试从双写备份恢复（防止误清导致从头再来）
      try { arr = JSON.parse(localStorage.getItem(BAK_KEY) || 'null'); } catch (e) { void e; }
    }
    if (!Array.isArray(arr) || arr.length !== 3) {
      // 迁移旧版单存档进度（isoballx_unlocked）→ 存档一
      let cleared0 = 0;
      try { cleared0 = Math.max(0, (parseInt(localStorage.getItem('isoballx_unlocked') || '1', 10) || 1) - 1); } catch (e) { void e; }
      arr = [{ cleared: cleared0 }, { cleared: 0 }, { cleared: 0 }];
    }
    S.saves = arr.map(sv => ({ cleared: Math.max(0, Math.min(sv.cleared | 0, TOTAL())) }));
    let cur = 0;
    try { cur = parseInt(localStorage.getItem(CUR_KEY) || '0', 10) | 0; } catch (e) { void e; }
    S.saveIdx = Math.max(0, Math.min(cur, 2));
  }
  function persistSaves() {
    try {
      const json = JSON.stringify(S.saves);
      localStorage.setItem(SAVES_KEY, json);
      localStorage.setItem(BAK_KEY, json); // 双写备份
      localStorage.setItem(CUR_KEY, String(S.saveIdx));
    } catch (e) { void e; }
  }

  const cv = $('cv');
  const ctx2d = cv.getContext('2d');
  let baseFit = { s: 1, ox: 0, oy: 0 }; // 初始适配视野（缩放/平移的基准）

  function resetView() {
    if (!S.L) return;
    const st = $('stage');
    Render.fit(S.L, st.clientWidth, st.clientHeight);
    baseFit = { s: Render.cam.s, ox: Render.cam.ox, oy: Render.cam.oy };
  }
  function zoomAt(f, mx, my) {
    const st = $('stage');
    if (mx === undefined) { mx = st.clientWidth / 2; my = st.clientHeight / 2; }
    const ns = Math.min(baseFit.s * 3.2, Math.max(baseFit.s * .55, Render.cam.s * f));
    const k = ns / Render.cam.s;
    Render.cam.s = ns;
    Render.cam.ox = mx - (mx - Render.cam.ox) * k;
    Render.cam.oy = my - (my - Render.cam.oy) * k;
  }

  function resize() {
    const st = $('stage');
    const dpr = window.devicePixelRatio || 1;
    cv.width = st.clientWidth * dpr;
    cv.height = st.clientHeight * dpr;
    cv.style.width = st.clientWidth + 'px';
    cv.style.height = st.clientHeight + 'px';
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.L) resetView();
    buildTrayIcons();
  }
  window.addEventListener('resize', resize);

  // ---------- 关卡加载 ----------
  function loadLevel(i) {
    S.li = i;
    const src = (typeof LEVELS!=="undefined"?LEVELS:window.LEVELS)[i];
    Render.setTheme(src.theme || 'olive'); // 每关主题（房间/积木配色）
    const L = SIM.parseLevel(JSON.parse(JSON.stringify(src, (k, v) => v)));
    // parseLevel 内部已做副本保护（terr 解析），这里再隔离 pieces
    S.L = L;
    S.inv = Object.assign({}, src.pieces);
    L.pieces = S.inv; // canPlace 直接读 L.pieces
    S.pm = new Map();
    S.sel = null; S.erase = false; S.mode = 'edit';
    S.run = null; S.parts = []; S.float = null;
    S.stallT = 0; S.overT = 0;
    S.help = false; // 进关卡一律回到正常游玩态（上一关的攻略界面随之作废）
    S.helpBackup = null; // 上一关记下的"进入提示前的摆法"也一并清掉
    $('helpOv').style.display = 'none';
    $('lvname').textContent = `第 ${i + 1} 关`;
    // 状态机：进入关卡=初始状态 → 按钮恢复"开始"
    $('startBtn').textContent = '开始';
    syncHelpUI();
    $('clearOv').style.display = 'none';
    $('lobbyOv').style.display = 'none'; // 任何入口（大厅/选关/测试钩子）进关都收起大厅
    showTip(src.tip);
    Render.setView(0); // 每次进关（选关/下一关/左右箭头）视角一律复位为默认视角
    resetView(); // 适配视野并记录基准（缩放/平移可复原）
    L._beams = SIM.computeBeams(L, S.pm);
    buildTray();
    persistSaves(); // 记住当前存档与进度
  }

  // ---------- 托盘 ----------
  const PIECE_NAMES = {
    ramp1: '小斜坡', block1: '小方块', arrow: '箭头', ramp2: '大斜坡', block2: '大方块',
    bridge: '桥', elevator: '电梯', conveyor: '传送带', button: '按钮', glow: '荧光块',
  };
  const PIECE_ORDER = ['ramp1', 'block1', 'arrow', 'ramp2', 'block2', 'bridge', 'elevator', 'conveyor', 'button', 'glow'];

  function buildTray() {
    const kinds = PIECE_ORDER.filter(k => (S.inv[k] | 0) > 0 || S.pm && [...S.pm.values()].some(p => p.type === k));
    // 若某积木全用完且场上没有 → 仍显示（灰色 0）
    const all = PIECE_ORDER.filter(k => srcPieces()[k]);
    const row1 = $('tray1'), row2 = $('tray2');
    row1.innerHTML = ''; row2.innerHTML = '';
    const half = Math.ceil(all.length / 2);
    all.forEach((k, i) => {
      const cell = document.createElement('div');
      cell.className = 'tcell';
      cell.dataset.p = k;
      const icon = document.createElement('canvas');
      icon.className = 'ticon';
      icon.width = 88; icon.height = 88;
      cell.appendChild(icon);
      const badge = document.createElement('div');
      badge.className = 'tbadge';
      cell.appendChild(badge);
      (i < half ? row1 : row2).appendChild(cell);
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        AudioFX.unlock();
        if (S.mode === 'over') return; // 编辑/滚动中都可选积木（滚动中放置=原版行为）
        if (S.help) { AudioFX.play('error'); return; } // 攻略界面只读：不能拿积木
        if ((S.inv[k] | 0) <= 0) { AudioFX.play('error'); return; }
        S.erase = false; $('eraseBtn').classList.remove('on');
        // 按下即进入拖拽：跟随手指出半透明 ghost，松手放置；未移动则视为点按选中/取消
        const wasSel = S.sel === k;
        S.sel = k;
        S.float = null;
        S.dragCell = null;
        S.drag = { type: k, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, toggle: wasSel };
        AudioFX.play('pick');
        refreshTray();
      });
    });
    buildTrayIcons();
    refreshTray();
  }
  function srcPieces() { return (typeof LEVELS!=="undefined"?LEVELS:window.LEVELS)[S.li].pieces; }

  // ---------- 托盘拖拽放置（半透明积木跟随手指，松手放置） ----------
  document.addEventListener('pointermove', (e) => {
    if (!S.drag || e.pointerId !== S.drag.id) return;
    if (!S.drag.moved && Math.hypot(e.clientX - S.drag.sx, e.clientY - S.drag.sy) > 8) S.drag.moved = true;
    if (S.drag.moved && (S.mode === 'edit' || S.mode === 'run')) {
      const rect = cv.getBoundingClientRect();
      const hit = Render.hitCell(S.L, S.pm, e.clientX - rect.left, e.clientY - rect.top);
      S.dragCell = hit ? { c: hit.c, r: hit.r } : null;
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (!S.drag || e.pointerId !== S.drag.id) return;
    const d = S.drag;
    S.drag = null;
    if (d.moved) {
      // 松手：落到当前格子（无效位置播错误音）；放置成功即弹出确认浮钮（旋转/勾/叉）
      if (S.dragCell && (S.mode === 'edit' || S.mode === 'run')) {
        // 先把坐标存下来：place() 里"这种积木刚好用完了"会把 S.dragCell 置空，
        // 之后再读 S.dragCell.c 会抛异常 → 浮钮（旋转/勾/叉）出不来（真机拖最后一块时踩到）
        const dc = S.dragCell.c, dr = S.dragCell.r;
        if (place(d.type, dc, dr)) S.float = { c: dc, r: dr, key: dc + ',' + dr };
      }
      S.sel = null;
      S.dragCell = null;
    } else if (d.toggle) {
      S.sel = null; // 点按已选中的 → 取消选中
    }
    refreshTray();
  });
  document.addEventListener('pointercancel', (e) => {
    if (S.drag && e.pointerId === S.drag.id) { S.drag = null; S.dragCell = null; refreshTray(); }
  });

  function buildTrayIcons() {
    document.querySelectorAll('.tcell').forEach((cell) => {
      const icon = cell.querySelector('.ticon');
      const ic = icon.getContext('2d');
      ic.clearRect(0, 0, 88, 88);
      Render.drawPieceIcon(ic, cell.dataset.p, 88, 2);
    });
  }

  function refreshTray() {
    document.querySelectorAll('.tcell').forEach((cell) => {
      const k = cell.dataset.p;
      const n = S.inv[k] | 0;
      cell.querySelector('.tbadge').textContent = n;
      cell.classList.toggle('out', n <= 0);
      cell.classList.toggle('sel', S.sel === k && !S.erase);
    });
  }

  // ---------- 提示条 ----------
  let tipTimer = null;
  function showTip(txt) {
    const el = $('tip');
    if (!txt) { el.classList.remove('show'); return; } // 无提示的关卡：完全不显示 tip 条
    el.textContent = txt;
    el.classList.add('show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => el.classList.remove('show'), 12000);
  }

  // ---------- 放置 / 收回 / 旋转 ----------
  function place(type, c, r, silent) {
    const st = SIM.canPlace(S.L, S.pm, type, c, r);
    if (!st.ok) {
      if (!silent) { AudioFX.play('error'); S.ghostBadT = .5; S.ghostBadCell = { c, r }; }
      return false;
    }
    const pc = { type, rot: 0 };
    if (type === 'bridge' && st.deck !== undefined) pc.deck = st.deck; // 桥面高度=依附积木顶面
    if (st.on) {
      pc.on = true; pc.zAbs = st.z; pc.under = S.pm.get(c + ',' + r); // 叠放：记住底座
    } else if (st.under) {
      pc.under = st.under; // 桥从已有积木上方跨过：挂链保住下方积木（收回桥时恢复）
    }
    S.pm.set(c + ',' + r, pc);
    S.inv[type]--;
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    // 这种积木用完了：托盘变灰 + 自动取消选中（光标回到未选任何积木的状态，
    // 地图上不再显示该积木的半透明预览）
    if ((S.inv[type] | 0) <= 0 && S.sel === type) {
      S.sel = null;
      S.dragCell = null;
      S.hoverCell = null;
    }
    AudioFX.play('place');
    refreshTray();
    return true;
  }

  // ---------- 提示（通关攻略） ----------
  // 把本关 sol 原样摆到盘面上：清空 → 库存复原 → 逐件放回（含 rot）。静音静刷新，批量摆放不吵不闪。
  function applySolBoard() {
    const src = (typeof LEVELS!=='undefined'?LEVELS:window.LEVELS)[S.li];
    const sol = src.sol || [];
    SIM.restorePillarDescent(S.L);   // 上一局按钮降下的积木/桥先归位
    S.L._pillarsUp = true;
    S.pm = new Map();
    S.inv = Object.assign({}, src.pieces);
    S.L.pieces = S.inv;              // canPlace 直接读 L.pieces（必须同一对象）
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    S.sel = null; S.float = null; S.drag = null; S.dragCell = null;
    S.erase = false; $('eraseBtn').classList.remove('on');
    for (const s of sol) {
      place(s.p, s.c, s.r, true);
      if (s.rot !== undefined) {
        const pc = S.pm.get(s.c + ',' + s.r);
        if (pc) pc.rot = s.rot;
      }
    }
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    refreshTray();
  }
  // 攻略模式的 UI 同步：左下角按钮文案、帮助按钮禁用
  // 攻略模式的 UI 同步：左下角按钮文案、帮助按钮/清屏按钮禁用（只读界面，能看不能改）
  function syncHelpUI() {
    const eb = $('eraseBtn'), hb = $('helpBtn'), cb = $('clearBtn');
    eb.textContent = S.help ? '退出并继续本关' : '去除';
    eb.classList.toggle('helpmode', S.help);
    if (!S.help) eb.classList.remove('on');
    hb.disabled = !!S.help;
    cb.disabled = !!S.help;
  }
  function enterHelp() {
    const src = (typeof LEVELS!=='undefined'?LEVELS:window.LEVELS)[S.li];
    if (!(src.sol || []).length) { showTip('这一关暂时没有提示'); return; }
    if (S.mode === 'run') stopRun();     // 运行中点提示 → 先中止
    S.help = true;
    S.mode = 'edit';
    S.overT = 0;
    applySolBoard();
    $('startBtn').textContent = '开始';
    syncHelpUI();
    $('tip').classList.remove('show');   // 收起提示条，别挡住攻略
    AudioFX.play('clear');
  }
  // 盘面快照 / 还原：退出攻略时要把玩家原来的摆法原样放回去（含库存）。
  // 直接克隆结构而不用 canPlace 重放——桥的 deck 取决于放置时的邻居高度，重放顺序一变就可能搭出不同高度。
  function snapshotBoard() {
    const cells = [];
    for (const [key, pc] of S.pm) {
      const chain = [];
      for (let q = pc; q; q = q.under) {
        const u = { type: q.type, rot: q.rot };
        if (q.on !== undefined) u.on = q.on;
        if (q.zAbs !== undefined) u.zAbs = q.zAbs;
        if (q.deck !== undefined) u.deck = q.deck;
        chain.unshift(u);
      }
      cells.push({ key, chain });
    }
    return { cells, inv: Object.assign({}, S.inv) };
  }
  function restoreBoard(snap) {
    if (!snap) { return false; }
    const pm = new Map();
    for (const c of snap.cells) {
      let head = null;
      for (const u of c.chain) {          // 底 → 顶
        const pc = { type: u.type, rot: u.rot };
        if (u.on !== undefined) pc.on = u.on;
        if (u.zAbs !== undefined) pc.zAbs = u.zAbs;
        if (u.deck !== undefined) pc.deck = u.deck;
        if (head) pc.under = head;
        head = pc;
      }
      pm.set(c.key, head);
    }
    S.pm = pm;
    S.inv = Object.assign({}, snap.inv);
    S.L.pieces = S.inv;
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    S.sel = null; S.float = null; S.drag = null; S.dragCell = null;
    S.erase = false; $('eraseBtn').classList.remove('on');
    refreshTray();
    return true;
  }
  function exitHelp() {
    if (!S.help) return;
    if (S.mode === 'run') stopRun();     // 跑球中退出：先复位再还原盘面
    S.help = false;
    restoreBoard(S.helpBackup);          // 还原玩家进提示前的摆法
    S.helpBackup = null;
    syncHelpUI();
    AudioFX.play('clear');
  }

  // 从格子的 under 链中摘除指定层：其上非桥叠放件一并收回（底座没了），桥独立保留并重接
  function detachUnit(key, unit) {
    const chain = [];
    let q = S.pm.get(key);
    while (q) { chain.unshift(q); q = q.under; } // 底 → 顶
    const idx = chain.indexOf(unit);
    if (idx < 0) return;
    const above = chain.slice(idx + 1);
    const keep = chain.slice(0, idx).concat(above.filter(u => u.type === 'bridge'));
    for (const u of above) {
      if (u.type !== 'bridge') S.inv[u.type]++; // 非桥叠放件随底座一起收回
    }
    if (keep.length === 0) {
      S.pm.delete(key);
    } else {
      for (let j = 0; j < keep.length; j++) keep[j].under = j > 0 ? keep[j - 1] : null;
      S.pm.set(key, keep[keep.length - 1]);
    }
  }

  // 失去依附的桥级联收回（移除支撑积木后调用；桥塌可能连锁）
  function cascadeBridges() {
    let removed = true;
    while (removed) {
      removed = false;
      // 收集所有链节点（顶层 + under 链中间的桥也要判定，否则摘底座后中层桥漏塌）
      const all = [];
      for (const [k, top] of [...S.pm]) {
        const arr = [];
        let q = top;
        while (q) { arr.unshift(q); q = q.under; }
        for (const u of arr) all.push([k, u]);
      }
      for (const [k, p] of all) {
        if (p.type !== 'bridge') continue;
        const [c, r] = k.split(',').map(Number);
        // 桥面高度处已没有任何"锚定"支撑（直接或经桥链连到真实积木）→ 塌。
        // 旁边后来放了更高的积木不影响：只要仍有顶面==桥面的锚定支撑就保留
        const dk = p.deck !== undefined ? p.deck : 1;
        if (!SIM.bridgeAnchored(S.L, S.pm, c, r, dk)) {
          detachUnit(k, p); // 塌桥摘除：被它跨过的积木恢复、上方桥独立重接（下一轮按支撑判定）
          S.inv.bridge++;
          removed = true;
        }
      }
    }
  }

  // 从链中摘除"被点击的具体那一层"积木（而非整格顶层）：
  //  - 点方块面 → 只去方块，跨在上方的桥保留（桥是依附悬空，不是叠放）
  //  - 点桥面 → 去桥，被它跨过的积木恢复回该格顶层
  function removeUnit(key, unit) {
    detachUnit(key, unit);
    S.inv[unit.type]++;
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    AudioFX.play('erase');
    S.float = null;
    cascadeBridges(); // 支撑可能变化：全场桥塌检查
    refreshTray();
  }

  function rotatePiece(key) {
    const pc = S.pm.get(key);
    if (!pc) return;
    if (pc.type === 'block1' || pc.type === 'block2' || pc.type === 'glow' || pc.type === 'bridge') { AudioFX.play('error'); return; }
    if (pc.type === 'elevator') { AudioFX.play('error'); showTip('电梯四面都有门，无需旋转'); return; } // 四面门：无朝向
    const [c, r] = key.split(',').map(Number);
    const oldRot = pc.rot;
    pc.rot = (pc.rot + 1) % 4;
    // 校验旋转后仍合法（桥的邻接等）。库存不参与：临时借 1 个额度；
    // 自身从链中摘出、底座（under）升为顶层再校验——直接删整格会把桥一起带走，
    // 缺口格上叠在桥面的斜坡就会被误判"悬空"而拒绝旋转
    const under = pc.under;
    if (under) S.pm.set(key, under); else S.pm.delete(key);
    S.L.pieces[pc.type] = (S.L.pieces[pc.type] | 0) + 1;
    const st2 = SIM.canPlace(S.L, S.pm, pc.type, c, r);
    S.L.pieces[pc.type] = (S.L.pieces[pc.type] | 0) - 1;
    S.pm.set(key, pc);
    if (!st2.ok) {
      pc.rot = oldRot;
      AudioFX.play('error'); return;
    }
    cascadeBridges(); // 斜坡转走可能让只依附其背面的桥悬空：连带塌桥回收
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    refreshTray();
    AudioFX.play('rotate');
  }

  // ---------- 点击命中 ----------
  function onTap(mx, my) {
    if (S.help) return; // 攻略界面只读：不改动盘面（平移/双击复原视角仍可用）
    if (!S.L || (S.mode !== 'edit' && S.mode !== 'run')) return; // 滚动中也能放/删积木（球未碎未停）
    const hit = Render.hitCell(S.L, S.pm, mx, my);
    if (S.float) { S.float = null; }
    if (!hit) { return; }
    const key = hit.c + ',' + hit.r;
    const pc = S.pm.get(key);
    const topPc = hit.pc || pc;

    if (S.erase) {
      const unit = hit.unit || topPc; // 命中的具体层：点方块去方块、点桥去桥
      if (unit) removeUnit(key, unit);
      else AudioFX.play('error');
      return;
    }
    if (S.sel) {
      // 选中积木时点地图 = 尝试放置。能放就放（弹出确认浮钮）；
      // 放不了的位置：红色提示 + 半透明积木消失 + 取消选中，绝不弹转向/叉/勾
      const stc = SIM.canPlace(S.L, S.pm, S.sel, hit.c, hit.r);
      if (stc.ok) {
        if (place(S.sel, hit.c, hit.r)) S.float = { c: hit.c, r: hit.r, key }; // 放置成功 → 确认浮钮
        return;
      }
      AudioFX.play('error');
      S.ghostBadT = .5; // 位置无效：红一下
      S.ghostBadCell = { c: hit.c, r: hit.r };
      S.sel = null;
      S.dragCell = null;
      S.hoverCell = null;
      refreshTray();
      return;
    }
    if (topPc) {
      S.float = { c: hit.c, r: hit.r, key };
      AudioFX.play('clear');
    }
  }

  // ---------- 运行 ----------
  function startRun() {
    if (S.mode === 'run') { // 运行中再点 = 复位：球回墙洞，柱/门复位；攻略模式下积木还原成 sol 摆法
      stopRun();
      if (S.help) applySolBoard();
      return;
    }
    if (S.mode !== 'edit') return;
    S.mode = 'run';
    S.sel = null; S.float = null; S.parts = []; S.stallT = 0;
    refreshTray();
    $('startBtn').textContent = '复位';
    AudioFX.play('start');
    S.run = SIM.newRun(S.L, S.pm);
  }
  function stopRun() {
    S.mode = 'edit';
    S.run = null; S.parts = [];
    SIM.restorePillarDescent(S.L); // 按钮降下的积木/桥恢复原位（运行与编辑态共享盘面）
    S.L._pillarsUp = true; // 编辑态立柱恒视为升起：柱的升降只发生在运行态。
    // 若不恢复，降柱后编辑态放置基准=地面（块 zAbs 嵌进柱身），重开一局柱升起而连带下降会把块压到地下（L37 bug）
    $('startBtn').textContent = '开始';
  }

  // 通关处理：正常模式记进度+弹通关层；攻略模式不记进度、不弹层，动画播完自动回到攻略初始态
  function handleWin() {
    S.mode = 'over';
    if (S.help) {
      // 球回归墙洞、立柱/传送门复位、积木仍是 sol 的初始摆法
      AudioFX.play('win');
      setTimeout(() => {
        if (!S.help) return;
        stopRun();
        applySolBoard();
        $('startBtn').textContent = '开始';
      }, 1000);
      return;
    }
    // 通过原未通过的关 → 当前存档通关数 +1（只记当前存档）
    const sv = S.saves[S.saveIdx];
    if (sv && S.li + 1 > sv.cleared) {
      sv.cleared = S.li + 1;
      persistSaves();
    }
    AudioFX.play('win');
    showBanner(); // LEVEL X COMPLETE!
    setTimeout(() => showClear(), 1500);
  }

  // ---------- 粒子（球色弧片） ----------
  function spawnShatter(x, y, z) {
    const cols = Render.getBallColors();
    for (let i = 0; i < 16; i++) {
      const a0 = Math.random() * 6;
      S.parts.push({
        x, y, z: z + .3,
        vx: (Math.random() - .5) * 3.2, vy: (Math.random() - .5) * 3.2, vz: Math.random() * 4.5 + 1,
        rot: Math.random() * 6, vr: (Math.random() - .5) * 10,
        a0, a1: a0 + .5 + Math.random() * .7,
        col: [cols.hi, cols.mid, cols.lo][i % 3],
        life: 1,
      });
    }
  }
  function stepParts(dt) {
    for (const p of S.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= 14 * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt; p.life -= dt * .8;
    }
    S.parts = S.parts.filter(p => p.life > 0);
  }
  function drawParts() {
    for (const p of S.parts) {
      const pt = Render.P(p.x, p.y, p.z);
      const s = 9 * Render.cam.s;
      ctx2d.save();
      ctx2d.translate(pt.x, pt.y);
      ctx2d.rotate(p.rot);
      ctx2d.globalAlpha = Math.max(0, p.life);
      // 球色弧片弹开
      ctx2d.beginPath();
      ctx2d.arc(0, 0, s, p.a0, p.a1);
      ctx2d.arc(0, 0, s * .55, p.a1, p.a0, true);
      ctx2d.closePath();
      ctx2d.fillStyle = p.col; ctx2d.fill();
      ctx2d.strokeStyle = 'rgba(0,0,0,.45)'; ctx2d.lineWidth = 1; ctx2d.stroke();
      ctx2d.restore();
    }
    ctx2d.globalAlpha = 1;
  }

  // ---------- 主循环 ----------
  let lastT = 0;
  function frame(t) {
    const dt = Math.min(.033, (t - lastT) / 1000 || .016);
    lastT = t;
    // 兜底保护网：主循环里任何一帧异常都不冒泡（手机上曾出现"报错多了遮挡按键"）、
    // 不中断渲染循环，只静默记入 localStorage（?errs=1 可查看），游戏继续运行
    try {
      if (S.mode === 'run' && S.run && !S.run.done) {
      SIM.step(S.run, dt);
      for (const ev of S.run.events) {
        if (ev.type === 'portal') AudioFX.play('portal');
        else if (ev.type === 'holeopen') AudioFX.play('holeopen');
        else if (ev.type === 'button') {
          AudioFX.play('button');
          // 立柱连带下降由 SIM 内部处理：柱上积木跟着柱一起降（相对位置不变），
          // 被牵连的桥（deck 支撑全部在降）连带下降，桥上叠放物跟随；运行结束由 restorePillarDescent 恢复
        }
        else if (ev.type === 'shatter') {
          AudioFX.play('shatter');
          S.run.ball.hidden = true; // 碎裂：不再画完整球，只表现碎片
          spawnShatter(S.run.ball.x, S.run.ball.y, S.run.ball.z);
        } else if (ev.type === 'lift') AudioFX.play('elevator');
        else if (ev.type === 'belt') AudioFX.play('belt');
        else if (ev.type === 'stuck') AudioFX.play('error');
      }
      S.run.events.length = 0;
    }
    if (S.mode === 'run' && S.run && S.run.done) {
      if (S.run.result === 'win' && S.mode !== 'over') {
        handleWin();
      } else if (S.run.result !== 'win') {
        S.overT += dt;
        if (S.overT > .9) { S.overT = 0; stopRun(); }
      }
    }
    if (S.ghostBadT > 0) S.ghostBadT -= dt;
    stepParts(dt);
    render();
    } catch (err) {
      try {
        var logs = []; try { logs = JSON.parse(localStorage.getItem('isoballx_errs') || '[]'); } catch (_) { logs = []; }
        logs.push('frame: ' + (err && err.message || err)); while (logs.length > 8) logs.shift();
        localStorage.setItem('isoballx_errs', JSON.stringify(logs));
      } catch (_) { void _; }
    }
    requestAnimationFrame(frame);
  }

  function render() {
    if (!S.L) return; // 大厅态：无关卡
    const opts = {};
    // 拖拽/悬停的半透明预览积木（实时校验可放性：绿=可放 红=不可放）
    // 编辑态和滚动中都可放置（滚动中放置=原版行为），预览与红色无效反馈一致
    const gc = S.dragCell || S.hoverCell;
    if ((S.mode === 'edit' || S.mode === 'run') && S.sel && gc) {
      const stt = SIM.canPlace(S.L, S.pm, S.sel, gc.c, gc.r);
      const t0 = S.L.terr[gc.r][gc.c];
      // 红色无效提示面画在"下面的地面/积木面"上：格上有积木=其顶面，空格=地面
      let hz;
      if (stt.deck !== undefined) hz = stt.deck;
      else if (stt.on) hz = stt.z;
      else {
        const ex2 = S.pm.get(gc.c + ',' + gc.r);
        hz = ex2 ? SIM.structureTop(S.L, ex2, gc.c, gc.r) : (t0 >= 0 ? t0 : 0);
      }
      opts.ghost = { type: S.sel, c: gc.c, r: gc.r, rot: 0, ok: stt.ok, hz, deck: stt.deck, base: stt.on ? stt.z : undefined };
      // 遮挡淡化：目标格"前方"(随视角)且结构顶高于 ghost 底面的格子半透明，
      // 让玩家看清被遮挡处的落点（配合 ghost 置顶显示）。
      // 与底面比较而非顶面：等高遮挡物(如高台 vs 等高斜坡)同样会挡住轮廓。
      const PH = { ramp1: 1, block1: 1, conveyor: 1, glow: 1, elevator: 1, ramp2: 2, block2: 2, arrow: 0, button: 0, bridge: 0 };
      const gh = PH[S.sel] || 0;
      const baseZ = stt.deck !== undefined ? stt.deck : (stt.on ? stt.z : Math.max(t0, 0));
      const vw = Render.getView();
      const ahead = (c2, r2) => {
        if (vw === 1) return (r2 - c2) > (gc.r - gc.c);
        if (vw === 2) return (c2 - r2) > (gc.c - gc.r);
        if (vw === 3) return false; // 俯视无遮挡
        return (c2 + r2) > (gc.c + gc.r);
      };
      const fade = new Set();
      for (let r2 = 0; r2 < S.L.H; r2++) for (let c2 = 0; c2 < S.L.W; c2++) {
        if (!ahead(c2, r2)) continue;
        const tt = S.L.terr[r2][c2];
        let top2 = tt >= 0 ? tt : -99;
        const p2 = S.pm.get(c2 + ',' + r2);
        if (p2) top2 = Math.max(top2, SIM.structureTop(S.L, p2, c2, r2));
        if (top2 > baseZ) fade.add(c2 + ',' + r2);
      }
      opts.fade = fade;
    }
    // 点击/拖拽松手后的无效位置红面（0.5s 内显示并淡出）：画在"下面的地面/积木面"上
    if (S.ghostBadT > 0 && S.ghostBadCell) {
      const bc = S.ghostBadCell;
      const t0b = S.L.terr[bc.r] ? S.L.terr[bc.r][bc.c] : -1;
      const exb = S.pm.get(bc.c + ',' + bc.r);
      opts.badCell = {
        c: bc.c, r: bc.r,
        hz: exb ? SIM.structureTop(S.L, exb, bc.c, bc.r) : (t0b >= 0 ? t0b : 0),
        alpha: .65 * Math.min(1, S.ghostBadT / .4),
      };
    }
    // 运行失败（碎裂除外）：球淡出 → 复位回洞（洞里不画球）
    if (S.mode === 'run' && S.run && S.run.done && S.run.result !== 'win') {
      opts.ballAlpha = Math.max(0, 1 - S.overT / .9);
    }
    Render.drawAll(ctx2d, S.L, S.pm, S.mode === 'run' ? S.run : null, opts);
    drawParts();
    drawFloat();
  }

  // 浮钮（旋转/收回）画在 canvas 上层 DOM，跟随积木顶面并 clamp 在舞台内
  function drawFloat() {
    const el = $('float');
    if (!S.float || (S.mode !== 'edit' && S.mode !== 'run')) { el.style.display = 'none'; return; }
    let z = 3.2;
    const pc = S.pm.get(S.float.key);
    if (pc && SIM.structureTop) {
      try { z = SIM.structureTop(S.L, pc, S.float.c, S.float.r) + .9; } catch (e) { void e; }
    }
    const pt = Render.P(S.float.c + .5, S.float.r + .5, z);
    const st = $('stage');
    // 浮钮锚点在底部中心（translate(-50%,-100%)），保证整体可见
    const x = Math.min(Math.max(pt.x, 48), st.clientWidth - 48);
    const y = Math.min(Math.max(pt.y, 62), st.clientHeight - 6);
    el.style.display = 'flex';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  // ---------- CLEAR 覆盖层 ----------
  function showBanner() {
    const b = $('banner');
    if (!b) return;
    b.textContent = '第 ' + (S.li + 1) + ' 关通过！';
    b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 1600);
  }
  function showClear() {
    $('clearTitle').textContent = '通关！';
    const last = S.li >= (typeof LEVELS!=="undefined"?LEVELS:window.LEVELS).length - 1;
    $('clearNext').textContent = last ? '重玩本关' : '下一关 ▶';
    $('clearSub').textContent = last ? '全部通关，你太棒了！' : '';
    $('clearOv').style.display = 'flex';
  }
  $('clearNext').addEventListener('click', () => {
    $('clearOv').style.display = 'none';
    const last = S.li >= (typeof LEVELS!=="undefined"?LEVELS:window.LEVELS).length - 1;
    loadLevel(last ? S.li : S.li + 1);
  });
  $('clearMenu').addEventListener('click', () => {
    $('clearOv').style.display = 'none';
    $('menuOv').style.display = 'flex';
    buildMenu();
  });

  // ---------- 大厅（三存档） ----------
  let delIdx = -1; // 待删除存档
  function showLobby() {
    // 返回大厅=关闭进行中的游戏
    if (S.mode !== 'edit') stopRun();
    $('clearOv').style.display = 'none';
    $('menuOv').style.display = 'none';
    $('confirmOv').style.display = 'none';
    $('float') && ($('float').style.display = 'none');
    S.float = null; S.sel = null;
    renderLobby();
    $('lobbyOv').style.display = 'flex';
  }
  function renderLobby() {
    const wrap = $('saveCards');
    wrap.innerHTML = '';
    S.saves.forEach((sv, i) => {
      const card = document.createElement('div');
      card.className = 'scard' + (i === S.saveIdx ? ' cur' : '');
      const nm = document.createElement('div');
      nm.className = 'sname';
      nm.textContent = '存档' + '一二三'[i];
      const cnt = document.createElement('div');
      cnt.className = 'scount';
      cnt.textContent = '通关 ' + sv.cleared + ' / ' + TOTAL();
      const del = document.createElement('button');
      del.className = 'sdel';
      del.textContent = '删除';
      del.title = '删除该存档';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        delIdx = i;
        $('confirmText').textContent = `是否删除存档${'一二三'[i]}？（通关数将清零）`;
        $('confirmOv').style.display = 'flex';
      });
      card.appendChild(nm);
      card.appendChild(cnt);
      card.appendChild(del);
      // 点卡片=选中该存档
      card.addEventListener('click', () => {
        S.saveIdx = i;
        persistSaves();
        renderLobby();
        AudioFX.play('pick');
      });
      wrap.appendChild(card);
    });
    // "继续上一次关卡"= 当前存档没通过的第一个关（全通关=最后一关）
    const cleared = S.saves[S.saveIdx].cleared;
    const cont = Math.min(cleared, TOTAL() - 1);
    $('lobbyContinue').textContent = cleared >= TOTAL()
      ? '▶ 继续最后一关（已全通关）'
      : `▶ 继续第 ${cont + 1} 关`;
    $('lobbyHint').textContent = '已选存档' + '一二三'[S.saveIdx] + ' · 点存档卡可切换';
  }
  $('confirmYes').addEventListener('click', () => {
    if (delIdx >= 0) {
      S.saves[delIdx] = { cleared: 0 }; // 删除存档=通关数清零
      persistSaves();
      delIdx = -1;
    }
    $('confirmOv').style.display = 'none';
    renderLobby();
    showTip('存档已删除');
  });
  $('confirmNo').addEventListener('click', () => {
    delIdx = -1;
    $('confirmOv').style.display = 'none';
  });
  $('lobbyContinue').addEventListener('click', () => {
    $('lobbyOv').style.display = 'none';
    const cleared = S.saves[S.saveIdx].cleared;
    loadLevel(Math.min(cleared, TOTAL() - 1));
  });
  $('lobbyLevels').addEventListener('click', () => {
    $('lobbyOv').style.display = 'none';
    $('menuOv').style.display = 'flex';
    requestAnimationFrame(updateMenuHint);
    buildMenu();
  });
  // 退出游戏按钮：只在手机 APK 里显示（原生桥 AndroidApp 由 MainActivity 注入）
  if (window.AndroidApp && window.AndroidApp.exitApp) {
    $('lobbyExit').style.display = '';
    $('lobbyExit').addEventListener('click', () => {
      try { window.AndroidApp.exitApp(); } catch (e) { void e; }
    });
  }

  // ---------- 存档导出/导入（防清浏览器数据丢档） ----------
  $('lobbyExport').addEventListener('click', () => {
    const code = 'BX1.' + btoa(JSON.stringify({ saves: S.saves, cur: S.saveIdx }));
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {}, () => {});
        copied = true;
      }
    } catch (e) { void e; }
    prompt(copied ? '存档码已尝试复制到剪贴板，请粘贴保存到别处（微信/记事本均可）：' : '请全选复制下面的存档码并保存到别处：', code);
  });
  $('lobbyImport').addEventListener('click', () => {
    const code = prompt('粘贴之前导出的存档码（BX1. 开头）：');
    if (!code) return;
    try {
      const raw = code.trim();
      if (raw.slice(0, 4) !== 'BX1.') throw new Error('不是有效的存档码');
      const obj = JSON.parse(atob(raw.slice(4)));
      if (!Array.isArray(obj.saves) || obj.saves.length !== 3) throw new Error('存档码内容无效');
      S.saves = obj.saves.map(sv => ({ cleared: Math.max(0, Math.min(sv.cleared | 0, TOTAL() - 1)) }));
      S.saveIdx = Math.max(0, Math.min(obj.cur | 0, 2));
      persistSaves();
      renderLobby();
      alert('导入成功！当前选中存档：' + (S.saveIdx + 1) + ' 号（通关 ' + S.saves[S.saveIdx].cleared + ' 关）');
    } catch (e) {
      alert('导入失败：' + (e && e.message ? e.message : '存档码无效'));
    }
  });

  // ---------- 选关（按当前存档解锁进度） ----------
  // 已通关(i < cleared)：亮色+✓；下一可玩关(i === cleared)：亮色无勾(可玩)；
  // 未解锁(i > cleared)：浅色+斜杠锁标，点了没反应
  function buildMenu() {
    const grid = $('menuGrid');
    grid.innerHTML = '';
    const cleared = S.saves[S.saveIdx].cleared;
    (typeof LEVELS!=="undefined"?LEVELS:window.LEVELS).forEach((lv, i) => {
      const b = document.createElement('button');
      const done = i < cleared;
      const nextOpen = i === cleared && i < TOTAL();
      b.className = 'mcell' + (done ? ' done' : nextOpen ? ' cur' : ' lock');
      b.innerHTML = done ? (i + 1) + '<span class="chk">✓</span>' : String(i + 1);
      b.title = '第 ' + (i + 1) + ' 关';
      if (done || nextOpen) {
        b.addEventListener('click', () => {
          $('menuOv').style.display = 'none';
          loadLevel(i);
        });
      }
      grid.appendChild(b);
    });
    requestAnimationFrame(updateMenuHint);
  }
  // 选关网格是否需要滑动：需要就在面板里给一句提示，放得下就清空
  function updateMenuHint() {
    const grid = $('menuGrid'), hint = $('menuHint');
    if (!grid || !hint) return;
    const need = grid.scrollHeight > grid.clientHeight + 4;
    hint.textContent = need ? '共 ' + TOTAL() + ' 关 · 上下滑动查看' : '';
  }

  // ---------- 画布手势 ----------
  // 点按=放置/浮钮；单指拖动=平移画面；双指=缩放；双击=复原；滚轮=缩放
  const ptrs = new Map();
  let downInfo = null, pinch0 = null, lastTap = null;
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AudioFX.unlock();
    if (S.drag) return; // 托盘拖拽放置中：画布只作预览
    if (cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (err) { void err; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      downInfo = { x: e.clientX, y: e.clientY, moved: false };
    } else if (ptrs.size === 2) {
      downInfo = null;
      const [a, b2] = [...ptrs.values()];
      pinch0 = {
        d: Math.max(20, Math.hypot(a.x - b2.x, a.y - b2.y)),
        s: Render.cam.s, ox: Render.cam.ox, oy: Render.cam.oy,
        mx: (a.x + b2.x) / 2, my: (a.y + b2.y) / 2,
      };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (S.drag) {
      // 托盘拖拽中：桌面鼠标也更新 ghost 位置（触摸走 document 级处理）
      if (e.pointerType === 'mouse') {
        const rect = cv.getBoundingClientRect();
        const hit = Render.hitCell(S.L, S.pm, e.clientX - rect.left, e.clientY - rect.top);
        S.dragCell = hit ? { c: hit.c, r: hit.r } : null;
      }
      return;
    }
    if (!ptrs.has(e.pointerId)) {
      // 无按键悬停（桌面预览 ghost）
      if ((S.mode === 'edit' || S.mode === 'run') && S.sel && e.pointerType === 'mouse') {
        const rect = cv.getBoundingClientRect();
        const hit = Render.hitCell(S.L, S.pm, e.clientX - rect.left, e.clientY - rect.top);
        S.hoverCell = hit ? { c: hit.c, r: hit.r } : null;
      }
      return;
    }
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch0) {
      const [a, b2] = [...ptrs.values()];
      const d = Math.max(20, Math.hypot(a.x - b2.x, a.y - b2.y));
      const ns = Math.min(baseFit.s * 3.2, Math.max(baseFit.s * .55, pinch0.s * d / pinch0.d));
      const k = ns / pinch0.s;
      const rect = cv.getBoundingClientRect();
      const mx = pinch0.mx - rect.left, my = pinch0.my - rect.top;
      Render.cam.s = ns;
      Render.cam.ox = mx - (mx - pinch0.ox) * k;
      Render.cam.oy = my - (my - pinch0.oy) * k;
      return;
    }
    if (downInfo) {
      if (!downInfo.moved && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 9) downInfo.moved = true;
      if (downInfo.moved) { // 单指拖动 → 平移
        Render.cam.ox += e.clientX - prev.x;
        Render.cam.oy += e.clientY - prev.y;
      }
    }
  });
  const endPtr = (e) => {
    if (ptrs.has(e.pointerId)) ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = null;
    if (ptrs.size === 0 && downInfo) {
      const d = downInfo;
      downInfo = null;
      if (d.moved) return; // 拖动过 = 平移，不算点按
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      // 点按若产生了实际效果（放置/开浮钮/擦除/选中等）→ 不计入双击
      const st0 = { sel: S.sel, n: S.pm.size, erase: S.erase, float: !!S.float };
      onTap(x, y);
      if (!!S.float || S.sel !== st0.sel || S.pm.size !== st0.n || S.erase !== st0.erase) {
        lastTap = null;
        return;
      }
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
        resetView(); // 双击空白处复原视角
        lastTap = null;
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', () => { if (!S.drag) S.hoverCell = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  $('startBtn').addEventListener('click', () => { AudioFX.unlock(); startRun(); });
  $('eraseBtn').addEventListener('click', () => {
    if (S.help) { exitHelp(); return; } // 攻略模式：这个位置的按钮=退出并继续本关
    if (S.mode !== 'edit' && S.mode !== 'run') return; // 滚动中也能去除积木
    S.erase = !S.erase;
    if (S.erase) S.sel = null;
    $('eraseBtn').classList.toggle('on', S.erase);
    refreshTray();
  });
  $('rotBtn').addEventListener('click', () => { if (S.help) return; if (S.float) rotatePiece(S.float.key); });
  $('delBtn').addEventListener('click', () => { if (S.help) return; if (S.float) { const key = S.float.key; const top = S.pm.get(key); if (top) removeUnit(key, top); } });
  $('okBtn').addEventListener('click', () => { if (S.float) { S.float = null; AudioFX.play('clear'); } }); // 勾=确认放置
  $('menuBtn').addEventListener('click', showLobby); // ⌂ = 返回大厅（关闭当前游戏）
  $('menuClose').addEventListener('click', () => { $('menuOv').style.display = 'none'; showLobby(); });
  // 帮助：先弹确认（提醒会降低游戏性）；取消=原样继续（盘面积木不动），确认=摆出本关攻略
  $('helpBtn').addEventListener('click', () => {
    if (S.help || !S.L) return;
    AudioFX.unlock();
    AudioFX.play('pick');
    if (S.mode === 'run') stopRun(); // 运行中先复位，避免弹窗和球同时在动
    S.helpBackup = snapshotBoard();  // 记下玩家此刻的摆法：退出攻略时按它还原
    $('helpOv').style.display = 'flex';
  });
  $('helpNo').addEventListener('click', () => {
    $('helpOv').style.display = 'none';
    S.helpBackup = null;             // 取消：没进攻略，快照没用了
  });
  $('helpYes').addEventListener('click', () => { $('helpOv').style.display = 'none'; enterHelp(); });
  // CLEAR = 清空全部已放积木（沿 under 链逐层恢复库存，双层电梯塔等叠层不丢）
  $('clearBtn').addEventListener('click', () => {
    if (!S.L) return;
    if (S.help) return; // 攻略界面只读：清屏不作用于攻略摆法
    if (S.mode !== 'edit') stopRun(); // 球回墙洞 + "复位"变"开始"
    let n = 0;
    for (const [, pc] of S.pm) {
      let p = pc;
      while (p) { S.inv[p.type]++; p = p.under; n++; }
    }
    S.pm.clear();
    S.float = null; S.sel = null;
    S.erase = false; $('eraseBtn').classList.remove('on');
    S.L._beams = SIM.computeBeams(S.L, S.pm);
    if (n > 0) { AudioFX.play('clear'); showTip('已清空全部积木'); }
    refreshTray();
  });
  $('muteBtn').addEventListener('click', () => {
    AudioFX.unlock();
    const m = !AudioFX.isMuted();
    AudioFX.setMuted(m);
    $('muteBtn').textContent = m ? '♪̸' : '♪';
    $('muteBtn').classList.toggle('off', m);
  });
  $('prevBtn').addEventListener('click', () => { if (S.li > 0) loadLevel(S.li - 1); });
  $('nextBtn').addEventListener('click', () => {
    if (S.li >= TOTAL() - 1) return;
    // 只有前面的关卡通过后才能玩下一关
    if (S.li + 1 > S.saves[S.saveIdx].cleared) {
      AudioFX.play('error');
      showTip('先通过当前关卡才能解锁下一关');
      return;
    }
    loadLevel(S.li + 1);
  });
  // 视角：放大/缩小/复原（配合双指缩放、单指平移、双击复原）+ 四视角切换
  $('zinBtn').addEventListener('click', () => zoomAt(1.25));
  $('zoutBtn').addEventListener('click', () => zoomAt(1 / 1.25));
  $('zresetBtn').addEventListener('click', resetView);
  $('vrotBtn').addEventListener('click', () => {
    Render.setView(Render.getView() + 1);
    resetView(); // 新视角重新适配视野
    const names = ['默认视角', '右墙视角', '左墙视角', '俯视'];
    showTip('视角：' + names[Render.getView()]);
    AudioFX.play('clear');
  });

  // ---------- 摆好解法不开始（视觉验收用：?showsol=1&level=N） ----------
  if (location.search.indexOf('showsol') >= 0) {
    const m = location.search.match(/level=(\d+)/);
    const lv = m ? parseInt(m[1], 10) - 1 : 0;
    setTimeout(() => {
      loadLevel(lv);
      const sol = (typeof LEVELS !== 'undefined' ? LEVELS : window.LEVELS)[lv].sol || [];
      for (const s of sol) {
        place(s.p, s.c, s.r);
        if (s.rot !== undefined) {
          const pc = S.pm.get(s.c + ',' + s.r);
          if (pc) pc.rot = s.rot;
        }
      }
      S.L._beams = SIM.computeBeams(S.L, S.pm);
      const mv = location.search.match(/view=(\d+)/);
      if (mv) Render.setView(parseInt(mv[1], 10));
    }, 400);
  }

  // ---------- 自动测试钩子（?autotest=1&level=N） ----------
  if (location.search.indexOf('autotest') >= 0) {
    const m = location.search.match(/level=(\d+)/);
    const lv = m ? parseInt(m[1], 10) - 1 : 0;
    setTimeout(() => {
      loadLevel(lv);
      const sol = (typeof LEVELS !== 'undefined' ? LEVELS : window.LEVELS)[lv].sol || [];
      for (const s of sol) {
        place(s.p, s.c, s.r);
        if (s.rot !== undefined) {
          const pc = S.pm.get(s.c + ',' + s.r);
          if (pc) pc.rot = s.rot;
        }
      }
      S.L._beams = SIM.computeBeams(S.L, S.pm);
      setTimeout(() => startRun(), 500);
    }, 400);
    setInterval(() => {
      let el = document.getElementById('autostat');
      if (!el) {
        el = document.createElement('div');
        el.id = 'autostat';
        el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:#002;color:#0f0;font:11px monospace;padding:2px;pointer-events:none';
        document.body.appendChild(el);
      }
      const r = S.run;
      el.textContent = 'LV=' + (S.li + 1) + ' mode=' + S.mode + ' result=' + (r ? r.result : '-') +
        ' t=' + (r ? r.time.toFixed(1) : '-') + ' ball=' + (r ? r.ball.x.toFixed(1) + ',' + r.ball.y.toFixed(1) + ',' + r.ball.z.toFixed(1) + ' ' + r.ball.mode : '-');
    }, 250);
  }

  // ---------- 提示（通关攻略）流程测试：?helptest=1&level=N ----------
  // 注意：headless + --virtual-time-budget 下 setTimeout 会被快进、rAF 不一定跟着转，
  // 所以"等运行帧"必须用 requestAnimationFrame 驱动，不能用 sleep 轮询（否则球一步都不动）。
  if (location.search.indexOf('helptest') >= 0) {
    const m = location.search.match(/level=(\d+)/);
    const lv = m ? parseInt(m[1], 10) - 1 : 0;
    const R = [];
    const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const click = (id) => $(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const units = () => { let n = 0; for (const [, pc] of S.pm) { for (let q = pc; q; q = q.under) n++; } return n; };
    const sig = () => {
      const out = [];
      for (const [k, pc] of S.pm) {
        for (let q = pc; q; q = q.under) {
          out.push(k + ':' + q.type + (q.rot ? '@' + q.rot : '') + (q.on ? '^' : '') +
            (q.zAbs !== undefined ? 'z' + q.zAbs : '') + (q.deck !== undefined ? 'd' + q.deck : ''));
        }
      }
      return out.sort().join(',');
    };
    const finish = () => {
      let errs = [];
      try { errs = JSON.parse(localStorage.getItem('isoballx_errs') || '[]'); } catch (e) { void e; }
      const txt = R.join(' | ') + ' ERRORS: ' + (errs.slice(-3).join(' ;; ') || '(none)');
      let el = document.getElementById('autostat');
      if (!el) { el = document.createElement('div'); el.id = 'autostat'; document.body.appendChild(el); }
      el.textContent = txt;
      document.title = txt;
      try { fetch('/helptest-result?msg=' + encodeURIComponent(R.join(' | '))); } catch (e) { void e; }
    };
    // 仅截图用：&snap=dialog（确认弹窗）/ &snap=mode（攻略界面）——摆好状态就返回，不跑断言
    const snap = (location.search.match(/snap=(\w+)/) || [])[1];
    (async () => {
      await sleep(400);
      loadLevel(lv);
      if (snap) {
        await sleep(150);
        click('helpBtn');
        if (snap === 'mode') { await sleep(80); click('helpYes'); await sleep(200); }
        else if (snap === 'exit') { await sleep(80); click('helpYes'); await sleep(200); click('eraseBtn'); await sleep(200); }
        else if (snap === 'ballcol0') {
          // 仅截图用：把球步进到"贴着第 0 列往北滚"的位置，然后手动渲染一帧
          await sleep(80); click('helpYes'); await sleep(200);
          Render.setView(3); resetView();
          click('startBtn');
          let g = 0;
          while (S.run && !S.run.done && g++ < 40000) {
            SIM.step(S.run, 1 / 120);
            const b = S.run.ball;
            if (b.mode === 'roll' && Math.floor(b.x) === 0 && b.dir === 3 && b.y < 3.6 && b.y > 2.2) break;
          }
          render();
        }
        return;
      }
      const sol = (typeof LEVELS !== 'undefined' ? LEVELS : window.LEVELS)[lv].sol || [];
      const cleared0 = S.saves[S.saveIdx].cleared;
      await sleep(80);
      // 先手动放一件，验证"取消"后积木还在原位
      for (const e of sol.slice(0, 14)) {   // 含两座电梯塔 + 桥(deck) + 桥上斜坡，考验快照保真
        place(e.p, e.c, e.r, true);
        if (e.rot !== undefined) { const pc = S.pm.get(e.c + ',' + e.r); if (pc) pc.rot = e.rot; }
      }
      const n1 = units();
      const sig0 = sig(), inv0 = JSON.stringify(S.inv);
      click('helpBtn'); await sleep(80);
      ok('点提示弹出确认窗', $('helpOv').style.display === 'flex');
      click('helpNo'); await sleep(80);
      ok('取消后弹窗关闭', $('helpOv').style.display === 'none');
      ok('取消后积木留在原位（不归还底边栏）', units() === n1 && n1 > 0 && S.help === false);
      ok('取消后左下角仍是"去除"', $('eraseBtn').textContent === '去除');
      // 确认 → 攻略界面
      click('helpBtn'); await sleep(60); click('helpYes'); await sleep(80);
      ok('确认后进入攻略界面', S.help === true);
      ok('攻略界面摆出 sol 全部积木（' + units() + '/' + sol.length + '）', units() === sol.length);
      ok('左下角变"退出并继续本关"', $('eraseBtn').textContent === '退出并继续本关');
      ok('提示按钮变不可点', $('helpBtn').disabled === true);
      ok('右上角"清屏"也变不可点（只读界面）', $('clearBtn').disabled === true);
      // 开始 → 复位
      click('startBtn'); await sleep(120);
      ok('攻略界面可开始', S.mode === 'run');
      ok('开始后按钮变"复位"', $('startBtn').textContent === '复位');
      click('startBtn'); await sleep(100);
      ok('复位后回编辑态', S.mode === 'edit');
      ok('复位后积木仍是 sol 摆法', units() === sol.length);
      ok('复位后按钮回"开始"', $('startBtn').textContent === '开始');
      // 跑到通关 → 自动回到攻略初始态（headless 下 rAF 不推进，直接步进模拟器 + 走真实 handleWin）
      click('startBtn');
      let guard = 0;
      while (S.run && !S.run.done && guard++ < 20000) SIM.step(S.run, 1 / 120);
      const res = S.run ? S.run.result : '-';
      if (res === 'win') handleWin();
      ok('攻略界面跑完能通关（result=' + res + '）', res === 'win');
      await sleep(1400);           // 等 1s 自动复位
      ok('通关后仍停在攻略界面', S.help === true);
      ok('通关后自动回编辑态', S.mode === 'edit');
      ok('通关后积木恢复为 sol 初始摆法', units() === sol.length);
      ok('通关后按钮回"开始"', $('startBtn').textContent === '开始');
      ok('攻略通关不记进度', S.saves[S.saveIdx].cleared === cleared0);
      // 退出并继续本关
      click('eraseBtn'); await sleep(80);
      ok('退出后回正常游玩界面', S.help === false);
      ok('退出后左下角恢复"去除"', $('eraseBtn').textContent === '去除');
      ok('退出后提示按钮恢复可点', $('helpBtn').disabled === false);
      ok('退出后"清屏"恢复可点', $('clearBtn').disabled === false);
      ok('退出后盘面还原成进入提示前的摆法（' + units() + ' 件，应为 ' + n1 + ' 件）', units() === n1);
      ok('退出后盘面指纹完全一致（格子/类型/朝向）', sig() === sig0);
      ok('退出后库存也还原', JSON.stringify(S.inv) === inv0);
      ok('退出后快照已清空', S.helpBackup === null);
      // 换关 → 攻略界面作废
      click('helpBtn'); await sleep(60); click('helpYes'); await sleep(80);
      ok('可再次进入攻略界面', S.help === true);
      const nxt = S.li + 1 < TOTAL() ? S.li + 1 : S.li - 1;
      loadLevel(nxt); await sleep(80);
      ok('换关后回初始游玩界面（攻略作废）',
        S.help === false && S.pm.size === 0 && S.helpBackup === null &&
        $('eraseBtn').textContent === '去除' && $('helpBtn').disabled === false &&
        $('clearBtn').disabled === false && $('helpOv').style.display === 'none');
      finish();
    })();
  }

  // ---------- 交互链路测试（?clicktest=1）：模拟点托盘→点格子→START ----------
  if (location.search.indexOf('clicktest') >= 0) {
    setTimeout(() => {
      try {
        loadLevel(0); // 测试从大厅直接进入第 1 关
        // 点按 = pointerdown + pointerup（新版手势判定在 pointerup）
        const tap = (el, x, y) => {
          el.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, clientX: x || 0, clientY: y || 0,
          }));
          el.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, clientX: x || 0, clientY: y || 0,
          }));
        };
        // 1. 选中小方块
        tap(document.querySelector('.tcell[data-p="block1"]'));
        // 2. 点格 (0,1)、(1,1)
        [ [0, 1], [1, 1] ].forEach(([c, r]) => {
          const pt = Render.P(c + .5, r + .5, 0);
          const rect = cv.getBoundingClientRect();
          tap(cv, rect.left + pt.x, rect.top + pt.y);
        });
        // 3. 选中小斜坡 → 放 (2,1) → 点它开浮钮 → 旋转 2 次到 rot=2
        const dbg = [];
        tap(document.querySelector('.tcell[data-p="ramp1"]'));
        let pt = Render.P(2.5, 1.5, 0);
        let rect = cv.getBoundingClientRect();
        tap(cv, rect.left + pt.x, rect.top + pt.y);   // 放置
        dbg.push('afterPlace float=' + (S.float ? S.float.key : 'null') + ' inv=' + (S.inv.ramp1 | 0));
        // 新 onTap 逻辑：选中态点已有积木 = 无效反馈+自动取消选中；再点一次才开浮钮
        tap(cv, rect.left + pt.x, rect.top + pt.y);   // 无效反馈 → 取消选中
        dbg.push('afterTap2 sel=' + S.sel + ' badT=' + (S.ghostBadT > 0 ? 'y' : 'n'));
        tap(cv, rect.left + pt.x, rect.top + pt.y);   // 打开浮钮
        dbg.push('afterTap3 float=' + (S.float ? S.float.key : 'null') + ' sel=' + S.sel);
        $('rotBtn').click(); $('rotBtn').click();     // rot=2
        dbg.push('afterRot rampRot=' + ((S.pm.get('2,1') || {}).rot));
        // 4. 选中箭头 → 放 (5,1) → 点它打开浮钮
        tap(document.querySelector('.tcell[data-p="arrow"]'));
        pt = Render.P(5.5, 1.5, 0); // arrow 贴地，顶面 z=0
        tap(cv, rect.left + pt.x, rect.top + pt.y);
        tap(cv, rect.left + pt.x, rect.top + pt.y); // 无效反馈 → 取消选中
        tap(cv, rect.left + pt.x, rect.top + pt.y); // 再点一次 → 浮钮
        // 5. 叠放：选箭头 → 点 (1,1) 方块顶面叠放 → 收回 → 底座恢复
        dbg.push('beforeStack invArrow=' + (S.inv.arrow | 0));
        tap(document.querySelector('.tcell[data-p="arrow"]'));
        pt = Render.P(1.5, 1.5, 1); // block1 (1,1) 顶面 z=1
        tap(cv, rect.left + pt.x, rect.top + pt.y); // 叠放 arrow
        dbg.push('afterStack invArrow=' + (S.inv.arrow | 0) + ' topRot=' + ((S.pm.get('1,1') || {}).on) + ' z=' + ((S.pm.get('1,1') || {}).zAbs));
        tap(cv, rect.left + pt.x, rect.top + pt.y); // 无效反馈 → 取消选中
        tap(cv, rect.left + pt.x, rect.top + pt.y); // 点叠放积木 → 浮钮
        $('delBtn').click(); // 收回顶层 arrow
        dbg.push('afterUnstack invArrow=' + (S.inv.arrow | 0) + ' keys=' + [...S.pm.keys()].join('/'));
        // 状态上报（同步，tap 链路全是同步处理）
        {
          let el = document.getElementById('autostat');
          if (!el) { el = document.createElement('div'); el.id = 'autostat'; el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:#002;color:#0f0;font:11px monospace'; document.body.appendChild(el); }
          const pieces = [...S.pm.entries()].map(([k, p]) => p.type + (p.rot ? ':' + p.rot : '')).join(',');
          const st = $('stage');
          const fl = $('float');
          const inX = parseFloat(fl.style.left) > 0 && parseFloat(fl.style.left) < st.clientWidth;
          const inY = parseFloat(fl.style.top) > 0 && parseFloat(fl.style.top) < st.clientHeight;
          el.textContent = 'CLICKTEST placed=' + pieces + ' inv.block1=' + S.inv.block1 +
            ' DBG[' + dbg.join(' | ') + ']' +
            ' float=' + (S.float ? S.float.c + ',' + S.float.r : 'none') +
            ' floatPos=' + (fl.style.display !== 'none' ? fl.style.left + ',' + fl.style.top : 'hidden') +
            ' floatIn=' + (inX && inY ? 'yes' : 'no');
        }
      } catch (e) {
        document.title = 'CLICKTEST-ERR:' + e.message;
        const el = document.getElementById('autostat') || document.body.appendChild(document.createElement('div'));
        el.id = 'autostat';
        el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:#600;color:#ff0;font:11px monospace';
        el.textContent = 'CLICKTEST-CATCH ' + e.message;
      }
    }, 700);
  }

  // ---------- 布局探针（?probe=1：把各区域尺寸写进 title，供自动化检查手机排版） ----------
  if (location.search.indexOf('probe') >= 0) {
    if (location.search.indexOf('menu=1') >= 0) setTimeout(() => { $('lobbyOv').style.display = 'none'; buildMenu(); $('menuOv').style.display = 'flex'; }, 800);
    setTimeout(() => {
      const r = (el) => {
        if (!el || !el.getBoundingClientRect) return '-';
        const b = el.getBoundingClientRect();
        return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(',');
      };
      const parts = [
        'vp=' + window.innerWidth + 'x' + window.innerHeight,
        'body=' + document.body.scrollWidth + 'x' + document.body.scrollHeight,
        'app=' + r(document.getElementById('app')),
        'stage=' + r(document.getElementById('stage')),
        'topbar=' + r(document.getElementById('topbar')),
        'tray=' + r(document.getElementById('tray')),
        'actions=' + r(document.getElementById('actions')),
        'lobbyPanel=' + r(document.querySelector('#lobbyOv .panel')),
        'menuPanel=' + r(document.querySelector('#menuOv .panel')),
        'grid=' + r(document.getElementById('menuGrid')),
        'gridScroll=' + (document.getElementById('menuGrid') ? document.getElementById('menuGrid').scrollHeight : '-'),
      ];
      document.title = parts.join(' | ');
    }, 2000);
  }

  // ---------- 调试状态钩子（?debugstate=1：暴露内部状态供自动化验证） ----------
  if (location.search.indexOf('debugstate') >= 0) {
    window.__S = S; window.__SIM = SIM; window.__Render = Render; window.__LEVELS = (typeof LEVELS !== 'undefined' ? LEVELS : window.LEVELS);
  }

  // ---------- 启动 ----------
  // 每次进入游戏先到大厅（选存档 → 继续/选关）
  loadSaves();
  // 手机 App 环境（安卓壳用 ?app=1 进来）：存档在 WebView 的 localStorage 里，
  // 没有"导出/导入存档码"这种浏览器端玩法，直接隐藏那一行入口（省地方、少困惑）
  const IS_APP = /[?&]app=1\b/.test(location.search);
  if (IS_APP) {
    const ex = $('lobbyExport'), im = $('lobbyImport');
    if (ex && ex.parentNode) ex.parentNode.style.display = 'none';
    else { if (ex) ex.style.display = 'none'; if (im) im.style.display = 'none'; }
  }
  // 测试恢复参数：?devunlock=N 把当前存档的通关数临时设为 N（玩家不可见，仅用于清数据后快速恢复测试进度）
  try {
    const dv = parseInt(new URLSearchParams(location.search).get('devunlock') || '', 10);
    if (dv > 0) {
      S.saves[S.saveIdx] = { cleared: Math.min(dv, TOTAL() - 1) };
      persistSaves();
    }
  } catch (e) { void e; }
  resize();
  showLobby();
  // 调试：?menu=1 直接停在选关面板（截图/自动化检查用，必须在首帧前同步完成）
  if (/[?&]menu=1\b/.test(location.search)) {
    $('lobbyOv').style.display = 'none';
    buildMenu();
    $('menuOv').style.display = 'flex';
    requestAnimationFrame(updateMenuHint);
  }
  requestAnimationFrame(frame);
})();
