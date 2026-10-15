import { sfx } from './sfx';

/**
 * Soft generated background music: a slow pentatonic melody over warm pad
 * chords, scheduled a little ahead on the shared AudioContext. No files to load.
 */

// I - vi - IV - V in C, as MIDI notes
const CHORDS = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76];
const BEAT = 0.5;
const BAR = BEAT * 8;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private out: GainNode | null = null;
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  private on = false;
  private note = 3;

  setEnabled(on: boolean) {
    this.on = on;
    if (on) this.start();
    else this.stop();
  }

  /** Call from a user gesture: the AudioContext only exists after one. */
  resume() {
    if (this.on && !this.timer) this.start();
  }

  private start() {
    const ctx = sfx.context;
    if (!ctx || this.timer) return;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.out.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 2);
    this.out.connect(ctx.destination);
    this.nextBar = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 250);
    this.schedule();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ctx = sfx.context, out = this.out;
    if (ctx && out) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      setTimeout(() => out.disconnect(), 800);
    }
    this.out = null;
  }

  private voice(freq: number, t: number, dur: number, gain: number, type: OscillatorType) {
    const ctx = sfx.context!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private schedule() {
    const ctx = sfx.context;
    if (!ctx || !this.out || document.hidden) return;
    while (this.nextBar < ctx.currentTime + 1.5) {
      const t = this.nextBar;
      const chord = CHORDS[this.bar % CHORDS.length];
      for (const m of chord) this.voice(hz(m), t, BAR * 0.98, 0.07, 'sine');
      this.voice(hz(chord[0] - 12), t, BAR * 0.9, 0.09, 'triangle');
      // a wandering melody: small steps, some rests
      for (let b = 0; b < 8; b++) {
        if (Math.random() < 0.38) continue;
        this.note = Math.max(0, Math.min(SCALE.length - 1, this.note + Math.round((Math.random() - 0.5) * 3)));
        const len = Math.random() < 0.3 ? BEAT * 2 : BEAT;
        this.voice(hz(SCALE[this.note]), t + b * BEAT, len * 1.6, 0.05, 'triangle');
      }
      this.bar++;
      this.nextBar += BAR;
    }
  }
}

export const music = new Music();
