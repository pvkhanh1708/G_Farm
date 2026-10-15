/**
 * Synthesised placeholder SFX (WebAudio). Swap for recorded/licensed sounds
 * later — the call sites only use the named methods below.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private birdsTimer: number | null = null;
  enabled = true;

  /** Must be called from a user gesture (autoplay policies). */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.scheduleBirds();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** The shared AudioContext (null until the first user gesture). */
  get context() {
    return this.ctx;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; q?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = opts.freq ?? 800;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 0.3;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  tap() {
    this.tone(1200, 0.06, { type: 'sine', gain: 0.12 });
  }

  open() {
    this.tone(520, 0.09, { type: 'triangle', gain: 0.18, slideTo: 880 });
  }

  close() {
    this.tone(700, 0.08, { type: 'triangle', gain: 0.14, slideTo: 420 });
  }

  /** Soft soil rustle and a gentle rising "pip". */
  plant() {
    this.noise(0.1, { freq: 1100, gain: 0.07, q: 0.5 });
    this.tone(440, 0.22, { type: 'sine', gain: 0.07, attack: 0.02, slideTo: 587 });
    this.tone(880, 0.2, { type: 'sine', gain: 0.025, attack: 0.03, delay: 0.06 });
  }

  grow() {
    this.tone(660, 0.12, { type: 'triangle', gain: 0.07, slideTo: 990 });
  }

  harvest() {
    this.tone(320, 0.12, { type: 'sine', gain: 0.35, slideTo: 960 });
    this.noise(0.08, { freq: 2400, gain: 0.12, q: 2 });
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.12, delay: 0.08 + i * 0.06 }));
  }

  collect() {
    this.tone(1568 + Math.random() * 200, 0.08, { type: 'triangle', gain: 0.08 });
  }

  coin() {
    this.tone(1976, 0.18, { type: 'square', gain: 0.05 });
    this.tone(2637, 0.3, { type: 'square', gain: 0.05, delay: 0.06 });
    this.tone(3951, 0.25, { type: 'sine', gain: 0.06, delay: 0.06 });
  }

  coinTick() {
    this.tone(2400 + Math.random() * 400, 0.06, { type: 'triangle', gain: 0.06 });
  }

  unlock() {
    this.noise(0.35, { freq: 600, gain: 0.25, q: 0.6 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.12, delay: 0.25 + i * 0.07 }));
  }

  error() {
    this.tone(260, 0.12, { type: 'square', gain: 0.06 });
    this.tone(200, 0.16, { type: 'square', gain: 0.06, delay: 0.1 });
  }

  /** Occasional soft bird chirps for ambience. */
  private scheduleBirds() {
    const chirp = () => {
      if (this.enabled && document.visibilityState === 'visible') {
        const base = 2600 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, 0.07, { type: 'sine', gain: 0.025, delay: i * 0.11, slideTo: base * 1.35, attack: 0.01 });
      }
      this.birdsTimer = window.setTimeout(chirp, 5000 + Math.random() * 9000);
    };
    this.birdsTimer = window.setTimeout(chirp, 3000);
  }

  dispose() {
    if (this.birdsTimer) clearTimeout(this.birdsTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const sfx = new Sfx();
