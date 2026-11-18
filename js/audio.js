// Tiny synthesized sound effects (WebAudio), so no audio files are needed.
'use strict';
(function () {
  const TD = window.TD;
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  const last = {};
  const MIN_GAP = {
    arrow: 0.05, hit: 0.04, kill: 0.04, orb: 0.06, stoneHit: 0.06, heal: 0.2, coin: 0.06, melee: 0.09, crit: 0.08,
    lightning: 0.07, flask: 0.06, flaskThrow: 0.06, firepot: 0.08, summon: 0.3, soldierDown: 0.1, meteor: 0.08,
  };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  function tone(type, f0, f1, dur, vol, when) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(filterType, freq, dur, vol, when, q) {
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  function horn(notes, vol) {
    const t0 = ctx.currentTime;
    notes.forEach(([f, start, dur]) => {
      const t = t0 + start;
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      lfo.frequency.value = 5; lg.gain.value = f * 0.01;
      lfo.connect(lg).connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.15);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
      g.gain.setValueAtTime(vol, t + dur - 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    });
  }

  const SOUNDS = {
    arrow: () => { noise('bandpass', 2600, 0.07, 0.12, 0, 2); tone('triangle', 900, 380, 0.06, 0.05); },
    stoneLaunch: () => { tone('sine', 140, 55, 0.22, 0.3); noise('lowpass', 700, 0.12, 0.12); },
    stoneHit: () => { noise('lowpass', 380, 0.38, 0.5); tone('sine', 90, 40, 0.3, 0.3); },
    orb: () => { tone('sine', 520, 1250, 0.16, 0.1); tone('triangle', 1040, 2100, 0.12, 0.04, 0.03); },
    chain: () => { noise('highpass', 3000, 0.12, 0.1); tone('square', 1400, 300, 0.1, 0.03); },
    bolt: () => { tone('triangle', 240, 95, 0.28, 0.22); noise('bandpass', 1500, 0.05, 0.15, 0, 3); },
    hit: () => noise('bandpass', 1800, 0.03, 0.05, 0, 3),
    kill: () => { tone('sine', 330, 120, 0.1, 0.09); noise('lowpass', 1200, 0.08, 0.05); },
    coin: () => { tone('sine', 1320, 0, 0.07, 0.06); tone('sine', 1760, 0, 0.12, 0.06, 0.06); },
    build: () => { noise('lowpass', 900, 0.06, 0.3); tone('sine', 180, 120, 0.08, 0.2); noise('lowpass', 900, 0.06, 0.25, 0.11); tone('sine', 200, 130, 0.08, 0.16, 0.11); },
    upgrade: () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, 0.16, 0.09, i * 0.07)); },
    sell: () => { [1568, 1318, 1046].forEach((f, i) => tone('sine', f, 0, 0.1, 0.07, i * 0.05)); },
    leak: () => { tone('sawtooth', 110, 70, 0.5, 0.12); noise('lowpass', 300, 0.4, 0.25); },
    heal: () => { tone('sine', 880, 1320, 0.25, 0.04); },
    wave: () => horn([[146.8, 0, 0.45], [196, 0.42, 0.8]], 0.12),
    boss: () => horn([[98, 0, 0.6], [92.5, 0.55, 0.6], [87.3, 1.1, 1.0]], 0.16),
    win: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('triangle', f, 0, i === 5 ? 0.6 : 0.18, 0.11, i * 0.15)); },
    lose: () => { [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, 0, i === 3 ? 0.8 : 0.3, 0.11, i * 0.28)); },
    lightning: () => { noise('highpass', 2500, 0.14, 0.16); tone('square', 1800, 200, 0.12, 0.035); tone('sawtooth', 90, 60, 0.15, 0.06); },
    flaskThrow: () => noise('bandpass', 1200, 0.08, 0.06, 0, 2),
    flask: () => { [2600, 3300, 2100].forEach((f, i) => tone('sine', f, f * 0.9, 0.06, 0.035, i * 0.025)); noise('highpass', 3500, 0.12, 0.08); },
    firepot: () => { noise('lowpass', 600, 0.4, 0.35); noise('bandpass', 900, 0.3, 0.12, 0.05, 1); tone('sine', 110, 50, 0.3, 0.2); },
    crit: () => tone('triangle', 1600, 2400, 0.06, 0.05),
    melee: () => { tone('square', 700 + Math.random() * 300, 400, 0.04, 0.025); noise('bandpass', 3200, 0.04, 0.05, 0, 4); },
    summon: () => { tone('sine', 240, 110, 0.6, 0.08); tone('triangle', 180, 90, 0.6, 0.05, 0.08); },
    soldierDown: () => { noise('lowpass', 500, 0.12, 0.15); tone('sine', 160, 80, 0.12, 0.08); },
    meteorFall: () => tone('sine', 1300, 260, 0.75, 0.07),
    meteor: () => { noise('lowpass', 260, 0.8, 0.6); tone('sine', 70, 28, 0.6, 0.4); noise('bandpass', 700, 0.3, 0.15); },
    freeze: () => { [1568, 2093, 2637, 3136].forEach((f, i) => tone('sine', f, 0, 0.35, 0.05, i * 0.05)); noise('highpass', 4000, 0.4, 0.06); },
    reinforce: () => { [0, 0.16].forEach((d) => { noise('lowpass', 220, 0.12, 0.35, d); tone('sine', 90, 55, 0.12, 0.3, d); }); tone('square', 900, 600, 0.05, 0.03, 0.32); },
    hornCall: () => horn([[196, 0, 0.35], [261.6, 0.3, 0.35], [329.6, 0.6, 0.7]], 0.12),
    error: () => tone('square', 140, 110, 0.12, 0.05),
    click: () => tone('sine', 900, 600, 0.04, 0.05),
  };

  TD.Audio = {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    play(name) {
      if (muted || !ensure() || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (MIN_GAP[name] && last[name] && now - last[name] < MIN_GAP[name]) return;
      last[name] = now;
      if (SOUNDS[name]) SOUNDS[name]();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.45;
    },
    get muted() { return muted; },
  };
})();
