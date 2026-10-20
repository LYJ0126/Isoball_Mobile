/* Isoball X 重制版 — 音效（WebAudio 合成, 零资源文件） */
(function () {
  'use strict';
  let ac = null, muted = false;

  function ctx() {
    // 手机 WebView 上 AudioContext 的创建/resume 可能抛异常（自动播放策略/权限），
    // 这里必须静默兜底——unlock 在每次按下托盘（拖拽放置）时调用，裸抛会冒泡成 Script error
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
      }
      if (ac && ac.state === 'suspended') {
        const rp = ac.resume();
        if (rp && rp.catch) rp.catch(() => {});
      }
    } catch (e) { void e; ac = null; }
    return ac;
  }

  // 基础音符: osc 类型 + 频率包络 + 增益包络
  function tone(o) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (o.delay || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0 || 440, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.dur || .15));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.vol || .2, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + (o.dur || .15));
    osc.connect(g); g.connect(a.destination);
    osc.start(t0); osc.stop(t0 + (o.dur || .15) + .05);
  }

  // 噪声爆裂
  function noise(o) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (o.delay || 0);
    const dur = o.dur || .3;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f || 900, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(o.vol || .3, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t0);
  }

  const FX = {
    place() { tone({ type: 'triangle', f0: 240, f1: 180, dur: .1, vol: .25 }); noise({ f: 1400, dur: .06, vol: .12 }); },
    pick() { tone({ type: 'triangle', f0: 330, f1: 420, dur: .08, vol: .18 }); },
    rotate() { tone({ type: 'square', f0: 520, f1: 660, dur: .07, vol: .1 }); },
    erase() { tone({ type: 'triangle', f0: 300, f1: 160, dur: .14, vol: .2 }); },
    error() { tone({ type: 'square', f0: 160, f1: 110, dur: .18, vol: .18 }); },
    start() { tone({ f0: 392, dur: .1, vol: .2 }); tone({ f0: 523, dur: .12, vol: .2, delay: .09 }); },
    portal() { tone({ type: 'sine', f0: 300, f1: 900, dur: .25, vol: .22 }); tone({ type: 'sine', f0: 450, f1: 1200, dur: .25, vol: .12, delay: .04 }); },
    holeopen() { tone({ type: 'triangle', f0: 440, dur: .1, vol: .2 }); tone({ type: 'triangle', f0: 660, dur: .12, vol: .2, delay: .08 }); tone({ type: 'triangle', f0: 880, dur: .16, vol: .2, delay: .16 }); },
    button() { tone({ type: 'square', f0: 200, f1: 140, dur: .12, vol: .22 }); noise({ f: 700, dur: .1, vol: .15, delay: .05 }); },
    elevator() { tone({ type: 'sawtooth', f0: 120, f1: 240, dur: .5, vol: .1 }); },
    belt() { noise({ f: 500, f1: 900, dur: .2, vol: .1 }); },
    shatter() { noise({ f: 2200, f1: 300, dur: .45, vol: .4 }); tone({ type: 'square', f0: 220, f1: 60, dur: .3, vol: .18 }); },
    win() {
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: .18, vol: .22, delay: i * .1 }));
      tone({ type: 'sine', f0: 1319, dur: .4, vol: .15, delay: .45 });
    },
    clear() { noise({ f: 400, dur: .08, vol: .1 }); },
  };

  function play(name) { if (FX[name]) try { FX[name](); } catch (e) { void e; } }
  function setMuted(m) { muted = m; }
  function isMuted() { return muted; }
  function unlock() { ctx(); } // ctx 内部已全量 try-catch（手机 WebView 安全）

  window.AudioFX = { play, setMuted, isMuted, unlock };
})();
