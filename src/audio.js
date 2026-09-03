/* Procedural sound. No files: every cue is an oscillator or a filtered noise
 * burst built on demand, so the game stays a static folder. The context is
 * created on the first user gesture, which is what browsers require. */

export function createAudio(initiallyOn) {
  let ac = null, master = null, on = !!initiallyOn;
  const lastAt = {};

  function ensure() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }
  function throttle(key, ms) {
    const now = performance.now();
    if (now - (lastAt[key] || 0) < ms) return false;
    lastAt[key] = now; return true;
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!on || !ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay = 0) {
    if (!on || !ac) return;
    const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  return {
    unlock: ensure,
    get on() { return on; },
    setOn(v) { on = !!v; if (on) ensure(); },

    tick()      { if (throttle('tick', 70)) tone('square', 1400, 900, 0.03, 0.05); },
    ping(v)     { if (throttle('ping', 90)) tone('sine', 480 + v * 28, 480 + v * 28, 0.05, 0.08); },
    pop()       { if (throttle('pop', 45)) noise(0.05, 0.25, 600, 0.8); },
    gateGood()  { tone('triangle', 520, 780, 0.18, 0.2); tone('triangle', 780, 1040, 0.22, 0.15, 0.08); },
    gateBad()   { tone('sawtooth', 160, 70, 0.25, 0.25); },
    weapon()    { tone('square', 330, 660, 0.12, 0.15); tone('square', 660, 990, 0.16, 0.12, 0.1); },
    crack()     { if (throttle('crack', 80)) { noise(0.06, 0.4, 2200, 2); tone('sine', 220, 180, 0.08, 0.12); } },
    shatter()   { noise(0.5, 0.7, 1500, 0.6); tone('sine', 880, 110, 0.6, 0.3); tone('triangle', 1320, 220, 0.5, 0.15, 0.05); },
    lost()      { if (throttle('lost', 120)) tone('square', 220, 120, 0.12, 0.15); },
    broken()    { tone('sawtooth', 200, 40, 0.9, 0.3); noise(0.4, 0.4, 300, 0.7); },
    held()      { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.35, 0.18, i * 0.09)); },
  };
}
