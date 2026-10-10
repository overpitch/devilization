/**
 * Sound effects synthesized with the Web Audio API, so there are no audio
 * files to download. The context starts on the first click (browsers block
 * audio before a user gesture).
 *
 * Routing: effects → sfx bus → compressor → master → speakers
 */
let ac: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let ambience: GainNode | null = null;
let breath: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let sfxVolume = 0.8;

export function initAudio() {
  if (!ac) {
    ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.7;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    limiter.connect(master).connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.connect(limiter);
    applyVolume();
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    startAmbience(ac);
    breath = startBreathLoop(ac);
  }
  if (ac.state === 'suspended') void ac.resume();
}

/** Effects volume, 0..1 (from Options). */
export function setVolume(effects: number) {
  sfxVolume = effects;
  applyVolume();
}

function applyVolume() {
  if (!ac || !sfxBus) return;
  // Squared for a more natural-feeling slider.
  sfxBus.gain.setTargetAtTime(0.8 * sfxVolume ** 2, ac.currentTime, 0.05);
}

function ready() {
  return ac && ac.state === 'running' ? ac : null;
}

/** A gain node with a quick attack and exponential decay, wired to the effects bus. */
function envelope(a: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(sfxBus!);
  return g;
}

function noiseSource(a: AudioContext, t: number, dur: number) {
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.start(t, Math.random());
  src.stop(t + dur);
  return src;
}

function tone(a: AudioContext, type: OscillatorType, from: number, to: number, t: number, dur: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filter(a: AudioContext, type: BiquadFilterType, freq: number, q = 1) {
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** The low roar of the lava plains, always playing quietly underneath everything. */
function startAmbience(a: AudioContext) {
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  ambience = a.createGain();
  ambience.gain.value = 0;
  const low = filter(a, 'lowpass', 140, 0.7);
  // A slow swell, like distant fire breathing.
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.09;
  const depth = a.createGain();
  depth.gain.value = 50;
  lfo.connect(depth).connect(low.frequency);
  src.connect(low).connect(ambience).connect(sfxBus!);
  src.start();
  lfo.start();
}

/** The roar of your fire breath: always running, silent until you breathe. */
function startBreathLoop(a: AudioContext) {
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = filter(a, 'bandpass', 500, 0.6);
  const gain = a.createGain();
  gain.gain.value = 0;
  src.connect(f).connect(gain).connect(sfxBus!);
  src.start();
  return { gain, filter: f };
}

/** Fire breath on (true) or off. */
export function setBreathing(on: boolean) {
  if (!ac || !breath) return;
  const t = ac.currentTime;
  breath.gain.gain.setTargetAtTime(on ? 0.7 : 0, t, on ? 0.04 : 0.12);
  breath.filter.frequency.setTargetAtTime(on ? 900 + Math.random() * 300 : 300, t, 0.08);
}

/** Ambient rumble level, 0..1 (louder near lava). */
export function setAmbience(level: number) {
  if (!ac || !ambience) return;
  ambience.gain.setTargetAtTime(0.06 + level * 0.3, ac.currentTime, 0.4);
}

/** An angelic voice: a few pure tones, like a choir note. */
function choir(a: AudioContext, t: number, base: number, end: number, dur: number, vol: number) {
  for (const [ratio, peak] of [[1, 0.16], [1.5, 0.09], [2, 0.06]] as const) {
    const o = tone(a, 'sine', base * ratio, end * ratio, t, dur);
    const vib = tone(a, 'sine', 5.5, 5.5, t, dur);
    const depth = a.createGain();
    depth.gain.value = base * ratio * 0.012;
    vib.connect(depth).connect(o.frequency);
    o.connect(envelope(a, t, peak * vol, 0.04, dur));
  }
}

export const sfx = {
  /** The spiked ball whistling through the air. */
  swing(heavy = false) {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const dur = heavy ? 0.42 : 0.3;
    const f = filter(a, 'bandpass', 500, 1.6);
    f.frequency.setValueAtTime(heavy ? 300 : 450, t);
    f.frequency.exponentialRampToValueAtTime(heavy ? 1400 : 2200, t + dur * 0.7);
    f.frequency.exponentialRampToValueAtTime(400, t + dur);
    noiseSource(a, t, dur).connect(f).connect(envelope(a, t, heavy ? 0.55 : 0.4, dur * 0.6, dur * 0.4));
    // The chain rattles as it whips around.
    for (let i = 0; i < 4; i++) {
      const s = t + 0.03 + i * 0.045;
      noiseSource(a, s, 0.03).connect(filter(a, 'highpass', 4500)).connect(envelope(a, s, 0.08, 0.002, 0.025));
    }
  },

  /** The ball smashing into a body. */
  hit(heavy = false, vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sine', heavy ? 120 : 150, 40, t, 0.2).connect(envelope(a, t, (heavy ? 1 : 0.85) * vol, 0.004, 0.22));
    noiseSource(a, t, 0.15).connect(filter(a, 'lowpass', 1800)).connect(envelope(a, t, 0.6 * vol, 0.003, 0.12));
    // Spikes crunching through armor.
    tone(a, 'square', 2200, 900, t, 0.06).connect(filter(a, 'bandpass', 2500, 4)).connect(envelope(a, t, 0.08 * vol, 0.002, 0.06));
  },

  /** The ball thudding into the ground. */
  thud(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sine', 90, 35, t, 0.2).connect(envelope(a, t, 0.5 * vol, 0.004, 0.2));
    noiseSource(a, t, 0.18).connect(filter(a, 'lowpass', 700)).connect(envelope(a, t, 0.4 * vol, 0.003, 0.16));
  },

  hurt() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    tone(a, 'sawtooth', 180, 70, t, 0.3).connect(filter(a, 'lowpass', 700)).connect(envelope(a, t, 0.4, 0.01, 0.3));
    tone(a, 'sine', 100, 45, t, 0.15).connect(envelope(a, t, 0.6, 0.005, 0.15));
  },

  /** A demon's growl when badly hurt, or rising again. */
  demonRoar() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const voice = tone(a, 'sawtooth', 70, 45, t, 1.2);
    const formant = filter(a, 'bandpass', 300, 4);
    formant.frequency.setValueAtTime(260, t);
    formant.frequency.linearRampToValueAtTime(600, t + 0.4);
    formant.frequency.linearRampToValueAtTime(240, t + 1.2);
    voice.connect(formant).connect(envelope(a, t, 0.5, 0.1, 1.1));
  },

  step(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    noiseSource(a, t, 0.08).connect(filter(a, 'lowpass', 400 + Math.random() * 300)).connect(envelope(a, t, 0.2 * vol, 0.004, 0.07));
  },

  land(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    noiseSource(a, t, 0.15).connect(filter(a, 'lowpass', 500)).connect(envelope(a, t, 0.4 * vol, 0.004, 0.13));
    tone(a, 'sine', 80, 40, t, 0.1).connect(envelope(a, t, 0.3 * vol, 0.004, 0.1));
  },

  /** Feet in lava. */
  sizzle(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    noiseSource(a, t, 0.5).connect(filter(a, 'highpass', 3500)).connect(envelope(a, t, 0.22 * vol, 0.02, 0.45));
  },

  /** A geyser getting ready to blow: a deep gurgle. */
  geyserWarn(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const f = filter(a, 'lowpass', 200, 3);
    const lfo = tone(a, 'sine', 9, 14, t, 1);
    const depth = a.createGain();
    depth.gain.value = 120;
    lfo.connect(depth).connect(f.frequency);
    noiseSource(a, t, 1).connect(f).connect(envelope(a, t, 0.6 * vol, 0.5, 0.5));
  },

  /** A geyser erupting: a roaring column of fire. */
  geyser(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const f = filter(a, 'bandpass', 400, 0.8);
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(350, t + 2);
    noiseSource(a, t, 2.2).connect(f).connect(envelope(a, t, 0.8 * vol, 0.05, 2));
    tone(a, 'sine', 60, 30, t, 0.6).connect(envelope(a, t, 0.7 * vol, 0.01, 0.6));
  },

  bark(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    for (const dt of [0, 0.18]) {
      const s = t + dt;
      const v = tone(a, 'sawtooth', 210, 120, s, 0.12);
      v.connect(filter(a, 'bandpass', 700, 2)).connect(envelope(a, s, 0.4 * vol, 0.005, 0.12));
      noiseSource(a, s, 0.08).connect(filter(a, 'bandpass', 1200, 1)).connect(envelope(a, s, 0.2 * vol, 0.003, 0.07));
    }
  },

  /** The dog's jaws snapping shut. */
  bite(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const v = tone(a, 'sawtooth', 110, 70, t, 0.3);
    v.connect(filter(a, 'bandpass', 450, 3)).connect(envelope(a, t, 0.35 * vol, 0.01, 0.28));
    noiseSource(a, t + 0.05, 0.05).connect(filter(a, 'highpass', 2000)).connect(envelope(a, t + 0.05, 0.4 * vol, 0.002, 0.05));
  },

  /** The dog lowering its horns and charging. */
  charge(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const v = tone(a, 'sawtooth', 55, 90, t, 0.8);
    v.connect(filter(a, 'lowpass', 400, 2)).connect(envelope(a, t, 0.5 * vol, 0.1, 0.7));
  },

  angelHurt(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    choir(a, a.currentTime, 520 + Math.random() * 80, 400, 0.4, vol);
  },

  angelDie(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    choir(a, t, 660, 220, 1.4, vol * 1.2);
    noiseSource(a, t, 1).connect(filter(a, 'highpass', 5000)).connect(envelope(a, t, 0.1 * vol, 0.2, 0.8));
  },

  /** A bright shimmer: a training angel returns. */
  angelAppear(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    [784, 988, 1175].forEach((f, i) => {
      const s = t + i * 0.07;
      tone(a, 'sine', f, f, s, 0.6).connect(envelope(a, s, 0.08 * vol, 0.01, 0.6));
    });
  },

  levelUp() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    // A rising minor arpeggio over a low drone: an infernal fanfare.
    [220, 261.6, 329.6, 440, 523.3].forEach((f, i) => {
      const s = t + i * 0.09;
      tone(a, 'sawtooth', f, f, s, 0.5).connect(filter(a, 'lowpass', 1800)).connect(envelope(a, s, 0.12, 0.01, i === 4 ? 0.9 : 0.35));
    });
    tone(a, 'sine', 55, 55, t, 1.4).connect(envelope(a, t, 0.4, 0.05, 1.3));
  },

  /** A new power: a deep gong. */
  unlock() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    for (const [f, peak] of [[98, 0.5], [147, 0.25], [196, 0.15], [311, 0.08]] as const) {
      tone(a, 'sine', f, f * 0.98, t, 2.5).connect(envelope(a, t, peak, 0.01, 2.4));
    }
  },

  coin() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const f = 1400 + Math.random() * 300;
    tone(a, 'square', f, f, t, 0.05).connect(filter(a, 'lowpass', 4000)).connect(envelope(a, t, 0.06, 0.002, 0.05));
    tone(a, 'square', f * 1.5, f * 1.5, t + 0.05, 0.12).connect(filter(a, 'lowpass', 4000)).connect(envelope(a, t + 0.05, 0.06, 0.002, 0.12));
  },

  /** Not enough hellfire. */
  denied() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    tone(a, 'square', 110, 100, t, 0.18).connect(filter(a, 'lowpass', 600)).connect(envelope(a, t, 0.15, 0.005, 0.18));
  },

  /** The dog's burst of flame. */
  dogBreath(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const f = filter(a, 'bandpass', 700, 0.7);
    noiseSource(a, t, 1.3).connect(f).connect(envelope(a, t, 0.45 * vol, 0.08, 1.2));
  },

  /** The ground cracking before spikes burst out. */
  spikeRumble(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    noiseSource(a, t, 0.35).connect(filter(a, 'lowpass', 180, 2)).connect(envelope(a, t, 0.6 * vol, 0.2, 0.15));
  },

  /** Spikes tearing out of the ground. */
  spikes(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sine', 120, 40, t, 0.3).connect(envelope(a, t, 0.8 * vol, 0.003, 0.3));
    noiseSource(a, t, 0.3).connect(filter(a, 'bandpass', 1200, 1)).connect(envelope(a, t, 0.5 * vol, 0.003, 0.25));
    for (let i = 0; i < 5; i++) {
      const s = t + i * 0.02;
      tone(a, 'square', 1800 - i * 200, 600, s, 0.05).connect(filter(a, 'bandpass', 2000, 3)).connect(envelope(a, s, 0.06 * vol, 0.001, 0.05));
    }
  },

  /** An angel notices you: a sharp rising chime. */
  alert(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'triangle', 880, 1760, t, 0.18).connect(envelope(a, t, 0.18 * vol, 0.005, 0.25));
    tone(a, 'sine', 1320, 1320, t + 0.08, 0.3).connect(envelope(a, t + 0.08, 0.1 * vol, 0.005, 0.3));
  },

  /** An angel's sword whooshing down. */
  angelSwing(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    const f = filter(a, 'bandpass', 900, 1.5);
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.15);
    noiseSource(a, t, 0.2).connect(f).connect(envelope(a, t, 0.3 * vol, 0.06, 0.14));
  },

  bowShot(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'triangle', 220, 110, t, 0.12).connect(envelope(a, t, 0.25 * vol, 0.002, 0.12));
    noiseSource(a, t, 0.25).connect(filter(a, 'highpass', 3000)).connect(envelope(a, t, 0.12 * vol, 0.01, 0.22));
  },

  /** Holy light striking something. */
  holyImpact(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sine', 1200, 600, t, 0.2).connect(envelope(a, t, 0.15 * vol, 0.003, 0.2));
    noiseSource(a, t, 0.1).connect(filter(a, 'highpass', 4000)).connect(envelope(a, t, 0.15 * vol, 0.002, 0.08));
  },

  /** A priest's spell launching. */
  cast(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sine', 400, 1200, t, 0.35).connect(envelope(a, t, 0.16 * vol, 0.02, 0.35));
  },

  /** A priest's healing: a warm major chord. */
  heal(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    for (const f of [523.3, 659.3, 784]) tone(a, 'sine', f, f, t, 0.9).connect(envelope(a, t, 0.08 * vol, 0.1, 0.8));
  },

  impHurt(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sawtooth', 380, 240, t, 0.15).connect(filter(a, 'bandpass', 900, 3)).connect(envelope(a, t, 0.2 * vol, 0.005, 0.15));
  },

  impDie(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'sawtooth', 420, 120, t, 0.6).connect(filter(a, 'bandpass', 800, 3)).connect(envelope(a, t, 0.25 * vol, 0.01, 0.6));
  },

  /** A silent kill: a wet crunch and a low hiss. */
  assassinate() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    tone(a, 'sine', 90, 40, t, 0.3).connect(envelope(a, t, 0.7, 0.003, 0.3));
    noiseSource(a, t, 0.25).connect(filter(a, 'bandpass', 1400, 2)).connect(envelope(a, t, 0.35, 0.003, 0.22));
    noiseSource(a, t + 0.1, 0.8).connect(filter(a, 'highpass', 2500)).connect(envelope(a, t + 0.1, 0.12, 0.1, 0.7));
  },

  /** Picking up a weapon or an item. */
  pickup() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    tone(a, 'square', 300, 300, t, 0.06).connect(filter(a, 'lowpass', 1500)).connect(envelope(a, t, 0.12, 0.002, 0.06));
    tone(a, 'square', 450, 450, t + 0.07, 0.1).connect(filter(a, 'lowpass', 1500)).connect(envelope(a, t + 0.07, 0.12, 0.002, 0.1));
  },

  chestOpen() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    // A creaking lid, then a shower of coins.
    tone(a, 'sawtooth', 90, 140, t, 0.5).connect(filter(a, 'bandpass', 500, 6)).connect(envelope(a, t, 0.2, 0.1, 0.4));
    for (let i = 0; i < 8; i++) {
      const s = t + 0.45 + i * 0.05;
      const f = 1500 + Math.random() * 800;
      tone(a, 'square', f, f, s, 0.06).connect(filter(a, 'lowpass', 4000)).connect(envelope(a, s, 0.05, 0.002, 0.08));
    }
  },

  /** Heaven's war horn: an attack wave is coming. */
  warHorn() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    for (const f of [392, 587.3]) {
      const o = tone(a, 'sawtooth', f * 0.9, f, t, 1.5);
      o.connect(filter(a, 'lowpass', 1600, 1)).connect(envelope(a, t, 0.13, 0.25, 1.2));
    }
  },

  /** A mission objective done: a rising, menacing fanfare. */
  missionDone() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    [146.8, 220, 293.7].forEach((f, i) => {
      const s = t + i * 0.18;
      tone(a, 'sawtooth', f, f, s, 0.8).connect(filter(a, 'lowpass', 1200)).connect(envelope(a, s, 0.15, 0.02, i === 2 ? 1.2 : 0.4));
    });
  },

  /** Malphas speaking: a deep, rumbling growl. */
  rulerVoice() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const voice = tone(a, 'sawtooth', 52, 44, t, 1.4);
    const f = filter(a, 'bandpass', 260, 5);
    f.frequency.setValueAtTime(220, t);
    f.frequency.linearRampToValueAtTime(420, t + 0.3);
    f.frequency.linearRampToValueAtTime(240, t + 0.9);
    f.frequency.linearRampToValueAtTime(380, t + 1.3);
    voice.connect(f).connect(envelope(a, t, 0.55, 0.08, 1.3));
  },

  /** A blow glancing off your invulnerable dog. */
  immune(vol = 1) {
    const a = ready();
    if (!a || vol < 0.03) return;
    const t = a.currentTime;
    tone(a, 'triangle', 1700, 1500, t, 0.15).connect(envelope(a, t, 0.06 * vol, 0.002, 0.15));
  },

  click() {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    tone(a, 'triangle', 700, 450, t, 0.06).connect(envelope(a, t, 0.12, 0.002, 0.06));
  },
};

/** Volume for a sound at a distance (meters) from the player. */
export const volumeAt = (dist: number) => Math.max(0, 1 - dist / 35);
