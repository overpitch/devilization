import { envelope, filter, musicOutput, noiseSource, tone } from './audio';

/**
 * Procedural soundtrack: a little step sequencer that schedules synthesized
 * instruments a fraction of a second ahead on the Web Audio clock, and
 * crossfades between themes as the game's situation changes.
 * (The engine is adapted from Evil One; the music is hell's own.)
 */
export type Theme = 'silence' | 'title' | 'explore' | 'battle' | 'boss' | 'victory';

const FADE = 2.5;
const LOOKAHEAD = 0.25;

/** MIDI note number → frequency. */
const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

/**
 * Each plane's flavor: a four-chord loop (MIDI triads), the arpeggio's
 * voice, and how dark the pads are.
 */
interface Mood {
  chords: number[][];
  lead: OscillatorType;
  cutoff: number;
  /** Low choir under the pads. */
  choir?: boolean;
  /** Distant chimes (ice, crystals). */
  chimes?: boolean;
}

const MOODS: Mood[] = [
  // 1 The Burning Plains: Phrygian dread, E F E D.
  { chords: [[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 53, 57]], lead: 'triangle', cutoff: 800 },
  // 2 The Ash Wastes: hollow and grey, Am Dm Am E.
  { chords: [[57, 60, 64], [50, 53, 57], [57, 60, 64], [52, 56, 59]], lead: 'sine', cutoff: 600 },
  // 3 The Bone Forest: Dm Bb Gm A.
  { chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], lead: 'square', cutoff: 700 },
  // 4 The Sulfur Swamps: wobbling, Cm Db Cm Bb.
  { chords: [[48, 51, 55], [49, 53, 56], [48, 51, 55], [46, 50, 53]], lead: 'square', cutoff: 650 },
  // 5 The Obsidian City: Fm Db Eb C.
  { chords: [[53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 52, 55]], lead: 'sawtooth', cutoff: 900, choir: true },
  // 6 The Chain Canyons: Em C D B.
  { chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], lead: 'sawtooth', cutoff: 750 },
  // 7 Frozen Hell: Bm G Em F#.
  { chords: [[47, 50, 54], [43, 47, 50], [52, 55, 59], [54, 58, 61]], lead: 'sine', cutoff: 1200, chimes: true },
  // 8 The Burning Sky: Gm Eb F D.
  { chords: [[55, 58, 62], [51, 55, 58], [53, 57, 60], [50, 54, 57]], lead: 'triangle', cutoff: 1000 },
  // 9 The Abyss: C#m D C#m C.
  { chords: [[49, 52, 56], [50, 54, 57], [49, 52, 56], [48, 52, 55]], lead: 'sine', cutoff: 500, choir: true, chimes: true },
  // 10 The Angels' War Camp: heaven's own key turned against you, C Ab Bb Gm.
  { chords: [[48, 52, 55], [44, 48, 51], [46, 50, 53], [43, 46, 50]], lead: 'triangle', cutoff: 1400, choir: true },
];

const TITLE_CHORDS = [[52, 55, 59], [53, 57, 60], [48, 52, 55], [47, 51, 54]]; // Em F C B
const TITLE_MELODY = [64, 0, 0, 65, 64, 0, 62, 0, 60, 0, 59, 0, 0, 0, 0, 0];
const VICTORY_CHORDS = [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]]; // Cm Ab Bb G: a dark triumph
const FANFARE = [60, 0, 63, 0, 67, 0, 0, 0, 72, 0, 0, 0, 67, 0, 72, 0];

interface Voice {
  ac: AudioContext;
  out: AudioNode;
}

// ---------- Instruments ----------

/** A gain node shaped attack → hold → release (for sustained notes). */
function shaped({ ac, out }: Voice, t: number, peak: number, attack: number, hold: number, release: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
  g.connect(out);
  return g;
}

function pad(v: Voice, notes: number[], t: number, dur: number, vol = 0.05, cutoff = 900) {
  const g = shaped(v, t, vol, 0.7, Math.max(0, dur - 0.7), 0.9);
  const f = filter(v.ac, 'lowpass', cutoff, 0.7);
  f.connect(g);
  for (const n of notes) {
    for (const detune of [-8, 8]) {
      const o = tone(v.ac, 'sawtooth', hz(n), hz(n), t, dur + 1.6);
      o.detune.value = detune;
      o.connect(f);
    }
  }
}

/** A church organ gone wrong: square and saw an octave apart. */
function organ(v: Voice, notes: number[], t: number, dur: number, vol = 0.035) {
  const g = shaped(v, t, vol, 0.08, Math.max(0, dur - 0.08), 0.5);
  const f = filter(v.ac, 'lowpass', 1400, 0.5);
  f.connect(g);
  for (const n of notes) {
    tone(v.ac, 'square', hz(n), hz(n), t, dur + 0.6).connect(f);
    tone(v.ac, 'sawtooth', hz(n - 12), hz(n - 12), t, dur + 0.6).connect(f);
  }
}

function pluck(v: Voice, n: number, t: number, vol = 0.08, type: OscillatorType = 'triangle') {
  const o = tone(v.ac, type, hz(n), hz(n), t, 0.6);
  const f = filter(v.ac, 'lowpass', type === 'triangle' || type === 'sine' ? 3000 : 1600);
  o.connect(f).connect(envelope(v.ac, t, vol, 0.005, 0.55, v.out));
}

function bass(v: Voice, n: number, t: number, dur: number, vol = 0.12) {
  const o = tone(v.ac, 'sawtooth', hz(n), hz(n), t, dur);
  o.connect(filter(v.ac, 'lowpass', 260, 2)).connect(envelope(v.ac, t, vol, 0.01, dur, v.out));
}

function bell(v: Voice, n: number, t: number, vol = 0.06) {
  tone(v.ac, 'sine', hz(n), hz(n), t, 2.2).connect(envelope(v.ac, t, vol, 0.005, 2.2, v.out));
  tone(v.ac, 'sine', hz(n) * 2.76, hz(n) * 2.76, t, 0.8).connect(envelope(v.ac, t, vol * 0.3, 0.005, 0.8, v.out));
}

function brass(v: Voice, notes: number[], t: number, dur: number, vol = 0.05) {
  const g = shaped(v, t, vol, 0.04, dur * 0.6, dur * 0.4);
  const f = filter(v.ac, 'lowpass', 500, 1.5);
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(2000, t + 0.08);
  f.frequency.linearRampToValueAtTime(700, t + dur);
  f.connect(g);
  for (const n of notes) {
    for (const detune of [-5, 5]) {
      const o = tone(v.ac, 'sawtooth', hz(n), hz(n), t, dur + 0.1);
      o.detune.value = detune;
      o.connect(f);
    }
  }
}

/** A wordless choir: sawtooth voices with vibrato through an "oh" formant. */
function choir(v: Voice, notes: number[], t: number, dur: number, vol = 0.05) {
  const g = shaped(v, t, vol, 0.9, Math.max(0, dur - 0.9), 1.2);
  const formant = filter(v.ac, 'bandpass', 600, 3);
  formant.connect(g);
  for (const n of notes) {
    const o = tone(v.ac, 'sawtooth', hz(n), hz(n), t, dur + 2.2);
    const lfo = tone(v.ac, 'sine', 4.5 + Math.random(), 5, t, dur + 2.2);
    const depth = v.ac.createGain();
    depth.gain.value = hz(n) * 0.012;
    lfo.connect(depth).connect(o.frequency);
    o.connect(formant);
  }
}

/** A great low war drum. */
function taiko(v: Voice, t: number, vol = 0.45) {
  tone(v.ac, 'sine', 95, 38, t, 0.45).connect(envelope(v.ac, t, vol, 0.004, 0.45, v.out));
  noiseSource(v.ac, t, 0.08).connect(filter(v.ac, 'lowpass', 600)).connect(envelope(v.ac, t, vol * 0.4, 0.002, 0.07, v.out));
}

function kick(v: Voice, t: number, vol = 0.5) {
  tone(v.ac, 'sine', 120, 40, t, 0.18).connect(envelope(v.ac, t, vol, 0.004, 0.2, v.out));
}

function snare(v: Voice, t: number, vol = 0.16) {
  noiseSource(v.ac, t, 0.18).connect(filter(v.ac, 'bandpass', 1600, 0.8)).connect(envelope(v.ac, t, vol, 0.002, 0.16, v.out));
  tone(v.ac, 'triangle', 200, 150, t, 0.08).connect(envelope(v.ac, t, vol * 0.6, 0.002, 0.08, v.out));
}

/** Chains rattling instead of a hi-hat. */
function rattle(v: Voice, t: number, vol = 0.04) {
  noiseSource(v.ac, t, 0.06).connect(filter(v.ac, 'bandpass', 5200, 4)).connect(envelope(v.ac, t, vol, 0.001, 0.05, v.out));
}

function tom(v: Voice, t: number, pitch: number, vol = 0.3) {
  tone(v.ac, 'sine', pitch, pitch * 0.6, t, 0.25).connect(envelope(v.ac, t, vol, 0.004, 0.25, v.out));
}

// ---------- Themes ----------

interface ThemeDef {
  bpm: number;
  /** Plays one sixteenth-note step. */
  step(v: Voice, step: number, t: number, mood: Mood): void;
}

const THEMES: Record<Exclude<Theme, 'silence'>, ThemeDef> = {
  title: {
    bpm: 58,
    step(v, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const beat = 60 / 58;
      const chord = TITLE_CHORDS[bar % 4];
      if (s === 0) {
        pad(v, chord, t, beat * 4, 0.04, 600);
        bass(v, chord[0] - 24, t, beat * 3.5, 0.1);
        if (bar % 2 === 0) choir(v, [chord[0] - 12, chord[2] - 12], t, beat * 8, 0.035);
        taiko(v, t, 0.3);
      }
      if (s === 8 && bar % 2 === 1) taiko(v, t, 0.2);
      const m = TITLE_MELODY[(bar % 2) * 8 + s / 2];
      if (s % 2 === 0 && m && bar >= 2) bell(v, m - 12, t, 0.055);
      if (bar >= 4 && bar % 4 === 0 && s === 0) organ(v, [chord[0], chord[2]], t, beat * 4, 0.02);
    },
  },
  explore: {
    bpm: 70,
    step(v, step, t, mood) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const barDur = (60 / 70) * 4;
      const chord = mood.chords[bar % 4];
      if (s === 0) {
        pad(v, chord, t, barDur, 0.045, mood.cutoff);
        bass(v, chord[0] - 24, t, barDur * 0.45, 0.09);
        if (mood.choir && bar % 2 === 0) choir(v, [chord[0] - 12, chord[1] - 12], t, barDur * 2, 0.03);
      }
      if (s === 8) bass(v, chord[0] - 24 + (bar % 2 ? 7 : 0), t, barDur * 0.4, 0.07);
      // A slow heartbeat of drums on the downbeats.
      if ((s === 0 || s === 3) && bar % 2 === 0) taiko(v, t, s === 0 ? 0.22 : 0.12);
      // A sparse arpeggio over the chord.
      const pattern = [0, 3, 6, 8, 11, 14];
      const idx = pattern.indexOf(s);
      if (idx >= 0 && Math.random() < 0.7) {
        const n = chord[idx % 3] + 12 + (Math.random() < 0.2 ? 12 : 0);
        pluck(v, n, t, mood.lead === 'triangle' || mood.lead === 'sine' ? 0.07 : 0.03, mood.lead);
      }
      if (mood.chimes && s % 4 === 2 && Math.random() < 0.3) bell(v, chord[Math.floor(Math.random() * 3)] + 24, t, 0.025);
      if (s === 0 && bar % 4 === 3) bell(v, chord[2] + 12, t, 0.045);
    },
  },
  battle: {
    bpm: 124,
    step(v, step, t, mood) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = mood.chords[Math.floor(bar / 2) % 4];
      if (s === 0 || s === 8) taiko(v, t, 0.45);
      if (s === 10 && bar % 2 === 1) kick(v, t);
      if (s === 4 || s === 12) snare(v, t);
      if (s % 2 === 0) rattle(v, t, s % 4 === 0 ? 0.045 : 0.025);
      if (s % 2 === 0) bass(v, chord[0] - 24 + (s % 8 === 6 ? 1 : 0), t, 0.2, 0.11);
      if (s === 0) {
        brass(v, chord, t, 0.35, 0.045);
        pad(v, chord, t, (60 / 124) * 4, 0.02, 700);
      }
      if (s === 6 || s === 10) brass(v, [chord[0] + 12], t, 0.18, 0.04);
    },
  },
  boss: {
    bpm: 136,
    step(v, step, t, mood) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = mood.chords[Math.floor(bar / 2) % 4];
      const barDur = (60 / 136) * 4;
      if (s === 0 || s === 3 || s === 8 || s === 11) taiko(v, t, 0.5);
      if (s === 4 || s === 12) snare(v, t, 0.18);
      if (bar % 4 === 3 && s >= 13) snare(v, t, 0.11);
      if (bar % 4 === 3 && (s === 8 || s === 10)) tom(v, t, s === 8 ? 170 : 120);
      rattle(v, t, s % 2 === 0 ? 0.035 : 0.02);
      if (s % 2 === 0) bass(v, chord[0] - 24, t, 0.18, 0.13);
      // Heaven's choir sings against you.
      if (s === 0 && bar % 2 === 0) choir(v, [chord[0], chord[1], chord[2]], t, barDur * 2, 0.04);
      if (s === 0) organ(v, [chord[0], chord[2]], t, barDur * 0.5, 0.03);
      if (bar % 2 === 1) {
        const motif: Record<number, number> = { 0: chord[0] + 12, 6: chord[1] + 12, 10: chord[2] + 12, 14: chord[1] + 13 };
        if (motif[s]) bell(v, motif[s], t, 0.05);
      }
    },
  },
  victory: {
    bpm: 88,
    step(v, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = VICTORY_CHORDS[bar % 4];
      const barDur = (60 / 88) * 4;
      if (bar < 2) {
        // Opening fanfare.
        const n = FANFARE[s];
        if (bar === 0 && n) brass(v, [n, n - 12], t, s === 8 ? 0.9 : 0.25, 0.06);
        if (bar === 1 && s === 0) brass(v, [72, 67, 63, 60], t, 1.8, 0.05);
        if (s === 0 || s === 8) taiko(v, t, 0.4);
        if (s === 4 || s === 12) snare(v, t, 0.12);
        return;
      }
      if (s === 0) {
        organ(v, chord, t, barDur, 0.03);
        bass(v, chord[0] - 24, t, barDur * 0.5, 0.09);
        if (bar % 2 === 0) choir(v, [chord[0] - 12, chord[2] - 12], t, barDur * 2, 0.03);
      }
      if (s === 0 || s === 8) taiko(v, t, 0.25);
      if ([0, 3, 6, 8, 11, 14].includes(s)) pluck(v, chord[[0, 3, 6, 8, 11, 14].indexOf(s) % 3] + 12, t, 0.06);
      if (s === 0 && bar % 2 === 0) bell(v, chord[2] + 24, t, 0.045);
    },
  },
};

interface Track {
  key: string;
  theme: Exclude<Theme, 'silence'>;
  mood: Mood;
  gain: GainNode;
  step: number;
  next: number;
  stopAt: number | null;
}

export class Music {
  private theme: Theme = 'silence';
  private plane = 1;
  private readonly tracks: Track[] = [];

  constructor() {
    // Scheduled on a timer rather than animation frames so it keeps time steadily.
    setInterval(() => this.pump(), 50);
  }

  /** What should be playing, on which plane (1-10). Changes crossfade over a couple of seconds. */
  set(theme: Theme, plane = this.plane) {
    this.theme = theme;
    this.plane = plane;
  }

  get current() {
    return this.theme;
  }

  private pump() {
    const out = musicOutput();
    if (!out) return;
    const { ac, bus } = out;
    const now = ac.currentTime;
    // The plane only matters for the themes that take on its flavor.
    const flavored = this.theme === 'explore' || this.theme === 'battle' || this.theme === 'boss';
    const key = flavored ? `${this.theme}:${this.plane}` : this.theme;
    const playing = this.tracks.find((t) => t.stopAt === null);
    if (playing?.key !== key) {
      if (playing) {
        playing.stopAt = now + FADE;
        playing.gain.gain.cancelScheduledValues(now);
        playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
        playing.gain.gain.linearRampToValueAtTime(0, now + FADE);
      }
      if (this.theme !== 'silence') {
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + FADE);
        gain.connect(bus);
        const mood = MOODS[Math.min(MOODS.length, Math.max(1, this.plane)) - 1];
        this.tracks.push({ key, theme: this.theme, mood, gain, step: 0, next: now + 0.05, stopAt: null });
      }
    }
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const track = this.tracks[i];
      if (track.stopAt !== null && now > track.stopAt) {
        track.gain.disconnect();
        this.tracks.splice(i, 1);
        continue;
      }
      const def = THEMES[track.theme];
      const stepDur = 60 / def.bpm / 4;
      const voice = { ac, out: track.gain };
      // After a stall (a background tab), skip ahead instead of playing a burst of catch-up notes.
      if (track.next < now - 0.5) track.next = now + 0.05;
      while (track.next < now + LOOKAHEAD) {
        def.step(voice, track.step, track.next, track.mood);
        track.step++;
        track.next += stepDur;
      }
    }
  }
}
