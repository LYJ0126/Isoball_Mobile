import zipfile
apk = r"C:\Users\Jacky\Desktop\smallball\mobile-isoball\android\app\build\outputs\apk\debug\app-debug.apk"
z = zipfile.ZipFile(apk)
fails = 0
def chk(name, marker):
    global fails
    data = z.read(name).decode("utf-8", "ignore")
    ok = marker in data
    if not ok:
        fails += 1
    print(("OK  " if ok else "MISS"), name, "<-", marker[:40])

# 阶段二标记
chk("assets/www/js/levels.js", "c: 6, r: 5, rot: 3")
chk("assets/www/js/sim.js", "case 'elevator': return t + 1")
chk("assets/www/js/game.js", "baseZ")
chk("assets/www/js/render.js", "PK.light")
# 阶段三标记：三存档大厅 / 四视角 / 电梯四面门 / 确认放置
chk("assets/www/index.html", "v=20261019z1")
chk("assets/www/js/levels.js", "'..2000'")
chk("assets/www/js/levels.js", "{ c: 2, r: 2, h: 2 }")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 0, r: 2, rot: 2, on: true }")
chk("assets/www/js/levels.js", "arrow: 3, conveyor: 1, glow: 5")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 4, r: 5, rot: 0 }")
chk("assets/www/js/levels.js", "动态光桥")
chk("assets/www/js/sim.js", "np.type === 'bridge') {\n              top = np.deck !== undefined ? np.deck : 1;")
chk("assets/www/js/sim.js", "glowCtxStaticUp = false; // 柱已降，不再挡光")
chk("assets/www/js/levels.js", "arrow: 3, conveyor: 1, glow: 5")
chk("assets/www/js/sim.js", "np.type === 'bridge') {\n              top = np.deck !== undefined ? np.deck : 1;")
chk("assets/www/js/game.js", "isoballx_saves_v1")
chk("assets/www/js/game.js", "lobbyOv').style.display = 'none'")
chk("assets/www/js/game.js", "S.float = { c: hit.c, r: hit.r, key }")
chk("assets/www/js/render.js", "function setView")
chk("assets/www/js/render.js", "function sideW")
chk("assets/www/js/render.js", "function liftDoor")
chk("assets/www/js/sim.js", "while (p && !SUPPORTS.has(p.type)) p = p.under;")
# 阶段四标记：居中渲染 / ramp2贴合 / 桥语义 / 荧光 / 传送门灯 / 动能 / 滚动编辑
chk("assets/www/js/render.js", "function slimBox")
chk("assets/www/js/render.js", "const flushE = pc.rot === 0 && nbTop(c + 1, r) === t + h")
chk("assets/www/js/render.js", "L.pairs.find(pr => pr.includes(pt))")
chk("assets/www/js/render.js", "deck - .3")
chk("assets/www/js/sim.js", "const FRI = 1.2")
chk("assets/www/js/sim.js", "电梯不消耗动能")
chk("assets/www/js/game.js", "S.mode !== 'edit' && S.mode !== 'run'")
# 提示（通关攻略）功能
chk("assets/www/index.html", "<button id=\"helpBtn\" title=\"提示：显示这一关的通关摆放方法\">?")
chk("assets/www/index.html", "要提示吗？")
chk("assets/www/js/game.js", "function applySolBoard()")
chk("assets/www/js/game.js", "function snapshotBoard()")
chk("assets/www/js/game.js", "function restoreBoard(snap)")
chk("assets/www/js/game.js", "cb.disabled = !!S.help;")
# 手机版适配（2026-10-19）：App 隐藏导出/导入、选关面板可滑动 + 滑动提示
chk("assets/www/js/game.js", "const IS_APP = ")
chk("assets/www/js/game.js", "先把坐标存下来")
chk("assets/www/js/game.js", "function updateMenuHint()")
chk("assets/www/index.html", "id=\"menuHint\"")
chk("assets/www/css/style.css", "overscroll-behavior: contain")
chk("assets/www/css/style.css", ".mbtn:disabled {")
chk("assets/www/js/game.js", "function handleWin()")
chk("assets/www/js/game.js", "退出并继续本关")
chk("assets/www/css/style.css", "#eraseBtn.helpmode")
chk("assets/www/js/sim.js", "beams: L._beams || computeBeams(L, pm)")
# 阶段五标记：荧光新规则 / L11进洞 / 凸包剪影 / 俯视纯平面 / 库存取消选中
chk("assets/www/js/sim.js", "ball.holeCell = true;")
chk("assets/www/js/sim.js", "ball.holeCell = true;\n        ball.dir = d;")
chk("assets/www/js/sim.js", "if (t + ph > z) return { cells, end: 'block' };")
# 光带穿传送门 + 光带任意方向可跑 + 光带 1 格宽 + 光通路无厚度/与荧光块顶面共面
chk("assets/www/js/sim.js", "function portalSeesGlow(p)")
chk("assets/www/js/sim.js", "if (beam && beam.z === z) return { kind: 'beam', z, exit: d, zOut: z };")
chk("assets/www/js/render.js", "const half = .5; // 光通路宽度=1格（与荧光块同宽）")
chk("assets/www/js/render.js", "const zs = b.z + 0.004; // 与荧光块顶面等高（无厚度）")
chk("assets/www/js/sim.js", "glowUnder")
# 2026-10-19 修：传送门出口格转向要先把球摆到格中心（否则贴墙滚，L24/L20/L25/L37/L41）
chk("assets/www/js/sim.js", "ball.x = nc + 0.5; ball.y = nr + 0.5;")
# 2026-10-19 修：光通路是虚的——完全不参与放置判定（通路上/上方随便放），
# 通路存亡只由遮挡决定：叠放积木顶面 > 通路高度才断；桥悬空不算遮挡
chk("assets/www/js/sim.js", "function solidAtZ(L, pc, c, r, z)")
chk("assets/www/js/sim.js", "不参与放置判定")
chk("assets/www/js/sim.js", "if (z >= deck - 1 && z < deck) return true;")
# L42 tip + sol
chk("assets/www/js/levels.js", "光桥就能穿过传送门把两头接通")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 5, r: 4, rot: 3 }")
# 第43关传送门（2026-10-19 用户改：R2@z8→R3@z8、R5@z2→R5@z8）
chk("assets/www/js/levels.js", "{ wall: 'R', idx: 3, z: 8, lights: 3 }")
chk("assets/www/js/levels.js", "{ wall: 'R', idx: 5, z: 8, lights: 2 }")
chk("assets/www/js/levels.js", "{ wall: 'L', idx: 5, z: 2, lights: 2 }")
# 第43关 sol（2026-10-19 反推验证：电梯塔顶 6/8、桥 deck6+ramp2 接 L2@z8、降柱后行5 z1 光桥跨虚空）
chk("assets/www/js/levels.js", "{ p: 'ramp2', c: 0, r: 2, on: true, rot: 2 }")
# 第31关 sol 换成"单个按钮"(0,3)
chk("assets/www/js/levels.js", "{ p: 'button', c: 0, r: 3 }")
# 第36关 sol（3 箭头 + 电梯塔 (5,0)）
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 0, r: 6, rot: 3 }")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 0, r: 1, rot: 2 }")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 0, r: 5, on: true, rot: 2 }")
chk("assets/www/js/render.js", "function convexHull")
chk("assets/www/js/render.js", "if (view === 3) return { x: x * TW / 2, y: y * TW / 2 }")
chk("assets/www/js/game.js", "S.ghostBadT = .5")
chk("assets/www/js/game.js", "S.ghostBadCell = { c: hit.c, r: hit.r }")
# 阶段六标记：报错静默 / 挖孔避让 / ramp 楔形直连画法
chk("assets/www/index.html", "isoballx_errs")
chk("assets/www/index.html", "errbox=1")
chk("assets/www/css/style.css", "env(safe-area-inset-top")
chk("assets/www/js/render.js", "const slope = pc.type === 'ramp2' ? PK.top : PK.light")
chk("assets/www/js/render.js", "楔形直连画法")
# 阶段七标记：audio 兜底 / errs 调试入口
chk("assets/www/js/audio.js", "ac = null")
chk("assets/www/index.html", "errs=1")
chk("assets/www/js/game.js", "frame: ' + (err && err.message || err)")
# 阶段八标记：大厅退出按钮 / 视角与关卡名 / 进关视角复位
chk("assets/www/js/game.js", "AndroidApp.exitApp")
chk("assets/www/index.html", "lobbyExit")
chk("assets/www/js/game.js", "'默认视角', '右墙视角', '左墙视角'")
chk("assets/www/js/game.js", "第 ${i + 1} 关`;")
chk("assets/www/js/game.js", "Render.setView(0); // 每次进关")
# 阶段十标记：ramp 背对=立面+三角 / 缺口可命中 / L3 缺口地形
chk("assets/www/js/render.js", "背面长方形（高侧立面）")
chk("assets/www/js/render.js", "const faceSign = (e.x - n.x) * (s.y - e.y)")
chk("assets/www/js/render.js", "口沿面")
chk("assets/www/js/sim.js", "if (deck === null || t > deck) deck = t;")
chk("assets/www/js/sim.js", "deck <= structureTop(L, ex, c, r)")
chk("assets/www/js/game.js", "bridgeAnchored(S.L, S.pm, c, r, dk)")
chk("assets/www/js/levels.js", "00..0000")
# 阶段十一标记：去除按命中层摘链 / 塌桥恢复被跨积木 / cascade 全链判定 / tip 12s
chk("assets/www/js/render.js", "const cd = { c, r, pc: top, unit }")
chk("assets/www/js/game.js", "function detachUnit")
chk("assets/www/js/game.js", "function removeUnit")
chk("assets/www/js/game.js", "const unit = hit.unit || topPc")
chk("assets/www/js/game.js", "上方桥独立重接")
chk("assets/www/js/game.js", "setTimeout(() => el.classList.remove('show'), 12000)")
# 阶段十二/十三标记：墙高公式 12 / 桥锚定 / tip 可空 / 关卡还原原稿 / 旋转校验 under 升顶
chk("assets/www/js/render.js", "return Math.min(h0 + 1, 16)")
chk("assets/www/js/sim.js", "function bridgeAnchored")
chk("assets/www/js/sim.js", "maxT: Math.max(0, ...terr.flat())")
chk("assets/www/js/sim.js", "依附的支撑悬在空中")
chk("assets/www/js/game.js", "if (!txt) { el.classList.remove('show'); return; }")
chk("assets/www/js/game.js", "if (under) S.pm.set(key, under); else S.pm.delete(key);")
chk("assets/www/js/game.js", "缺口格上叠在桥面的斜坡就会被误判")
chk("assets/www/js/levels.js", "['000000','......','000000','......','000000','000000']")

# 阶段十四标记：桥依附透明化（透过叠件认底座）/ 高度上限11 / 多层叠放
chk("assets/www/js/sim.js", "function topSupportOf")
chk("assets/www/js/sim.js", "\u8d85\u8fc7\u642d\u5efa\u9ad8\u5ea6\u4e0a\u9650\u4e86")
chk("assets/www/js/sim.js", "if (!exBase) return no(st, '\u8fd9\u4e00\u683c\u5df2\u7ecf\u88ab\u5360\u4e86');")

# 阶段十六标记：桥依附斜坡背面（仅高侧）/ 旋转后级联 / 17 关
chk("assets/www/js/sim.js", "function attachTops")
chk("assets/www/js/sim.js", "function unitTopOf")
chk("assets/www/js/sim.js", "if (di === p.rot) tops.push(unitTopOf(L, p, nc, nr));")
chk("assets/www/js/game.js", "cascadeBridges(); // \u659c\u5761\u8f6c\u8d70\u53ef\u80fd\u8ba9\u53ea\u4f9d\u9644\u5176\u80cc\u9762\u7684\u6865\u60ac\u7a7a")
chk("assets/www/js/levels.js", "W: 3, H: 6,")
chk("assets/www/js/levels.js", "W: 6, H: 7,")
chk("assets/www/js/levels.js", "W: 4, H: 4,")

# 阶段十七标记：存档双写备份 / L11、L12 sol
chk("assets/www/js/game.js", "BAK_KEY = 'isoballx_saves_v1_bak'")
chk("assets/www/js/game.js", "localStorage.setItem(BAK_KEY, json)")
chk("assets/www/js/levels.js", "{ p: 'ramp2', c: 1, r: 3, rot: 0 },")
chk("assets/www/js/levels.js", "{ p: 'bridge', c: 4, r: 2 },")

# 阶段十八标记：L13 sol（斜坡背面桥）
chk("assets/www/js/levels.js", "{ p: 'bridge', c: 1, r: 0 },")
chk("assets/www/js/levels.js", "{ p: 'ramp2', c: 1, r: 0, rot: 3 },")

# 阶段十九标记：L13 tip / 高度上限15 / 新增 L14-20
chk("assets/www/js/levels.js", "\u6865\u53ef\u4ee5\u4f9d\u9644\u4e8e\u659c\u5761\u7684\u80cc\u9762\u642d\u5efa")
chk("assets/www/js/sim.js", "if (deck > 15) return no(st, \"\u8d85\u8fc7\u642d\u5efa\u9ad8\u5ea6\u4e0a\u9650\u4e86\");")
chk("assets/www/js/levels.js", "['.......', '.......', '.......', '.......', '0......', '00.....', '0000000']")
chk("assets/www/js/levels.js", "['7777', '7000', '7000', '7000']")

# 阶段二十一标记：surfaceAt 链扫描修复桥下通行（bug：桥上叠斜坡遮住桥）
chk("assets/www/js/sim.js", "for (let pc = pm.get(key); pc; pc = pc.under)")
chk("assets/www/js/sim.js", "if (pLo < z + 1 && pHi > z) return null;")

# MainActivity 源码不在 APK 内，直接读文件系统校验挖孔避让等标记
import io, os
mj = r"C:\Users\Jacky\Desktop\smallball\mobile-isoball\android\app\src\main\java\com\smallball\isoball\MainActivity.java"
mjsrc = io.open(mj, encoding="utf-8", errors="ignore").read() if os.path.exists(mj) else ""
for mk in ("status_bar_height", "setPadding(0, getStatusBarHeight()", "setWebContentsDebuggingEnabled", "exitApp"):
    ok = mk in mjsrc
    if not ok:
        fails += 1
    print(("OK  " if ok else "MISS"), "MainActivity.java <-", mk)

# 阶段二十二标记：存档导出/导入 + devunlock 测试恢复参数
chk("assets/www/index.html", "lobbyExport")
chk("assets/www/index.html", "lobbyImport")
chk("assets/www/js/game.js", "'BX1.' + btoa")
chk("assets/www/js/game.js", "devunlock")

# 阶段二十三标记：applySolution on 校验 + L14-17 sol
chk("assets/www/js/sim.js", "\u4e0e\u76d8\u9762\u4e0d\u7b26")
chk("assets/www/js/levels.js", "rot: 3, on: true")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 1, r: 2, rot: 0 }")

# 阶段二十四标记：L18/L19 sol（桥链沿斜坡背面爬升）
chk("assets/www/js/levels.js", "{ p: 'ramp2', c: 4, r: 5, rot: 0 }")
chk("assets/www/js/levels.js", "{ p: 'ramp2', c: 5, r: 0, rot: 3, on: true }")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 0, r: 5, rot: 3 }")

# 阶段二十五标记：L20 楼梯双层 sol + applySolution under 修复 + surfaceAt 桥下扫描修复
chk("assets/www/js/sim.js", "\u697c\u68af\u5173")
chk("assets/www/js/sim.js", "else if (st.under) {")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 1, r: 1, rot: 2, on: true }")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 2, r: 3, rot: 3 }")

# 阶段二十六标记：电梯中间进入默认向上 + sol 电梯去 rot
chk("assets/www/js/sim.js", "\u4ece\u5e95\u90e8/\u4e2d\u95f4\u4efb\u4f55\u4e00\u7ea7\u6eda\u5165")
chk("assets/www/js/levels.js", "{ p: 'elevator', c: 5, r: 3 }")
chk("assets/www/js/levels.js", "{ p: 'elevator', c: 5, r: 0 }")

# 阶段二十七标记：新 21 关（传送门开洞）+ 新 23 关（回马枪：二次穿门）
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 2, r: 2, rot: 3 }")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 5, r: 1, rot: 3 }")
chk("assets/www/js/levels.js", "{ wall: 'R', idx: 5, z: 0, lights: 1 }")
chk("assets/www/js/levels.js", "tip: '',\n    W: 7, H: 6,")

print("RESULT:", "ALL PASS" if fails == 0 else str(fails) + " MISS")
# 立柱改造：整格 1×1、高度可配 h、柱顶可放积木、0.4s 下降动画
chk("assets/www/js/sim.js", "L.pillarH = new Map")
chk("assets/www/js/sim.js", "placeableAt(L, pm, type, c, r, base, st)")
chk("assets/www/js/sim.js", "pillarFall")
chk("assets/www/js/render.js", "box(ctx, c, r, t, hDyn, C.pillar")

# 阶段四十二标记：立柱关卡显式 h:2 + 防缓存版本号升级
chk("assets/www/js/levels.js", "pillars: [{ c: 4, r: 3, h: 2 }]")
chk("assets/www/js/levels.js", "pillars: [{ c: 3, r: 3, h: 2 }]")
chk("assets/www/js/levels.js", "pillars: [{ c: 1, r: 2, h: 2 }]")

# 阶段四十三标记：立柱连带下降（柱上积木跟柱降、被牵连的桥连带降、桥上叠放物跟随）
chk("assets/www/js/sim.js", "computePillarDescent")
chk("assets/www/js/sim.js", "restorePillarDescent")
chk("assets/www/js/sim.js", "r2.on = true; r2.zAbs = base; r2.z = base")
chk("assets/www/js/game.js", "SIM.restorePillarDescent(S.L)")

# 阶段四十四标记：新 33/34/35 关（用户原稿，无 sol 待试玩）+ 立柱下降 0.3s + 37 关
chk("assets/www/js/levels.js", "W: 4, H: 6,")
chk("assets/www/js/levels.js", "['111111','110111','101100','101100','110111','111111']")
chk("assets/www/js/levels.js", "['00.....','00.....','00.....','10.....','0000000','0000000']")
chk("assets/www/js/levels.js", "pillars: [{ c: 0, r: 3, h: 2 }]")
chk("assets/www/js/sim.js", "dt / 0.3")

# 阶段四十五标记：电梯可叠方块/荧光/桥面（塔底=底座顶面，非地形）
chk("assets/www/js/sim.js", "电梯只能叠放在方块、荧光方块、桥面或电梯上")
chk("assets/www/js/sim.js", "lo = structureTop(L, u, c, r)")
chk("assets/www/js/render.js", "!(pc.under && pc.under.type === 'elevator')")

# 阶段四十六标记：L33/L34 sol 反推完成（verify 全绿）+ L34 v0=3.6
chk("assets/www/js/levels.js", "{ p: 'elevator', c: 2, r: 1 },")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 3, r: 1, rot: 3, on: true }")
chk("assets/www/js/levels.js", "{ p: 'conveyor', c: 5, r: 2, rot: 1 }")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 0, r: 3, rot: 2 }")
chk("assets/www/js/levels.js", "idx: 0, z: 2, v0: 3.6")

# 阶段四十七标记：立柱 h 语义=自身高度（柱顶=地形+h；降柱降自身高度，柱上积木落到地面）
chk("assets/www/js/sim.js", "base = up ? L.terr[r][c] + ((L.pillarH && L.pillarH.get(key)) || 2)")
chk("assets/www/js/sim.js", "const top = t + ((L.pillarH && L.pillarH.get(key)) || 2)")
chk("assets/www/js/sim.js", "const top = L.terr[nr][nc] + ((L.pillarH && L.pillarH.get(nc + ',' + nr)) || 2)")
chk("assets/www/js/sim.js", "const fd = (pl.h === undefined ? 2 : pl.h);")
chk("assets/www/js/render.js", "h=立柱自身高度，从地形 t 起画 h 格")

# 阶段四十九标记：stopRun 恢复 _pillarsUp（L37 块嵌柱身 bug）+ L35 sol（37/37 全绿收官）
chk("assets/www/js/game.js", "S.L._pillarsUp = true")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 0, r: 0, rot: 3, on: true }")
chk("assets/www/js/levels.js", "{ p: 'button', c: 0, r: 1, on: true }")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 0, r: 3, rot: 3, on: true }")

# 阶段五十标记：L36/37 tip 清空 + 新 38/39/40 关（无 sol 待试玩；L38 无洞占位）+ 40 关
chk("assets/www/js/levels.js", "['000060','000000','000000','00....','00....','00....']")
chk("assets/www/js/levels.js", "pillars: [{ c: 2, r: 2, h: 2 }]")
chk("assets/www/js/levels.js", "['00..00','00..00','0...0.','0...0.','00..0.','000000']")
chk("assets/www/js/sim.js", "hole: lvl.hole || { c: -9, r: -9, z: -99 }")
chk("assets/www/js/levels.js", "hole: { c: 2, r: 3, z: 2 }")
chk("assets/www/js/levels.js", "'..2...'")
chk("assets/www/js/levels.js", "idx: 5, z: 0, v0: 4.5")
chk("assets/www/js/levels.js", "{ p: 'arrow', c: 7, r: 7, rot: 2, on: true }")
chk("assets/www/js/levels.js", "{ p: 'conveyor', c: 7, r: 1, rot: 1 }")
# 阶段五十三标记：L38 v0=2.6 + sol（荧光摩擦确认与地面一致，无需改码）
chk("assets/www/js/levels.js", "idx: 1, z: 2, v0: 2.6")
chk("assets/www/js/levels.js", "{ p: 'ramp1', c: 1, r: 4, rot: 1 }")
# 阶段五十五标记：L39 电梯 4 台+删除错误 sol（柱降后塔身挡球门控修复）
chk("assets/www/js/levels.js", "elevator: 4")
chk("assets/www/js/sim.js", "glowCtx.pillarsUp !== false")
