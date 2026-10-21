// Makes the site's sounds (Resources/Sounds/*.mp3, played by Javascript/Sounds.js): crystal and glass tones synthesized
// from sine partials with soft envelopes and a small reverb, then encoded as MP3 (mono, 44.1 kHz). The same seeds always
// make the same files, so making them again changes nothing (and no fingerprint) unless a sound here changed.
//
//   cd _tools && npm install --no-save @breezystack/lamejs     (the MP3 encoder, once)
//   node _tools/make-sounds.mjs Resources/Sounds              (then node _tools/stamp.mjs)
//   SHAPE=1 node _tools/make-sounds.mjs <folder>               (also prints each sound's loudness every tenth of a second)
import { Mp3Encoder } from "@breezystack/lamejs";
import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 44100;
const OUT = process.argv[2] || "Resources/Sounds";
mkdirSync(OUT, { recursive: true });

// A seeded random number generator (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds) => new Float32Array(Math.round(seconds * RATE));

// One crystal tone added into out at time start: partials [ratio, gain, decay seconds], a soft attack, a little
// shimmer (two slightly detuned copies beating slowly)
function tone(out, { start = 0, freq, gain = 1, attack = 0.004, partials, shimmer = 0.0015, phase = 0 }) {
  const first = Math.round(start * RATE);
  if (!Number.isFinite(freq)) throw new Error("a tone without a frequency");
  for (const [ratio, partGain, decay] of partials) {
    const f = freq * ratio;
    if (f > RATE / 2 - 1000) continue;
    const length = Math.min(out.length - first, Math.round(decay * 7 * RATE));
    for (let i = 0; i < length; i++) {
      const t = i / RATE;
      const envelope = (t < attack ? Math.sin((t / attack) * Math.PI / 2) ** 2 : 1) * Math.exp(-t / decay);
      const a = Math.sin(2 * Math.PI * f * t + phase);
      const b = Math.sin(2 * Math.PI * f * (1 + shimmer) * t + phase * 1.7);
      out[first + i] += gain * partGain * envelope * (a + b) * 0.5;
    }
  }
}

// A short burst of filtered noise (the touch of glass on glass), added into out
function noiseBurst(out, { start = 0, seconds = 0.03, gain = 0.2, low = 3000, high = 9000, random, attack = 0.002 }) {
  const first = Math.round(start * RATE);
  const length = Math.min(out.length - first, Math.round(seconds * RATE));
  // A band-pass from a one-pole high-pass and low-pass
  const hp = Math.exp(-2 * Math.PI * low / RATE);
  const lp = Math.exp(-2 * Math.PI * high / RATE);
  let lastIn = 0, lastHigh = 0, lastLow = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const white = random() * 2 - 1;
    const highPassed = hp * (lastHigh + white - lastIn);
    lastIn = white;
    lastHigh = highPassed;
    lastLow = (1 - lp) * highPassed + lp * lastLow;
    const envelope = (t < attack ? t / attack : 1) * Math.exp(-t / (seconds / 4));
    out[first + i] += gain * envelope * lastLow;
  }
}

// A small Freeverb-style reverb: wet is mixed in at the given level; room: how long it rings (0 to 1)
function reverb(dry, { wet = 0.25, room = 0.75, damping = 0.35 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => ({ buf: new Float32Array(n), at: 0, store: 0 }));
  const allpasses = [556, 441, 341, 225].map(n => ({ buf: new Float32Array(n), at: 0 }));
  const out = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i++) {
    const input = dry[i] * 0.015;
    let sum = 0;
    for (const comb of combs) {
      const value = comb.buf[comb.at];
      comb.store = value * (1 - damping) + comb.store * damping;
      comb.buf[comb.at] = input + comb.store * room;
      comb.at = (comb.at + 1) % comb.buf.length;
      sum += value;
    }
    for (const pass of allpasses) {
      const value = pass.buf[pass.at];
      pass.buf[pass.at] = sum + value * 0.5;
      pass.at = (pass.at + 1) % pass.buf.length;
      sum = value - sum;
    }
    out[i] = dry[i] * (1 - wet * 0.5) + sum * wet * 3;
  }
  return out;
}

// Gentle low-pass, so nothing is sharp
function smooth(samples, cutoff = 11000) {
  const k = Math.exp(-2 * Math.PI * cutoff / RATE);
  let last = 0;
  for (let i = 0; i < samples.length; i++) samples[i] = last = (1 - k) * samples[i] + k * last;
  return samples;
}

// A soft start and a soft end (a fade to silence, so cutting off never clicks), then the loudest point at peak
function finish(samples, { fadeIn = 0.003, fadeOut = 0.06, peak = 0.85 } = {}) {
  const inLength = Math.round(fadeIn * RATE);
  const outLength = Math.min(samples.length, Math.round(fadeOut * RATE));
  for (let i = 0; i < inLength && i < samples.length; i++) samples[i] *= Math.sin((i / inLength) * Math.PI / 2) ** 2;
  for (let i = 0; i < outLength; i++) samples[samples.length - 1 - i] *= Math.sin((i / outLength) * Math.PI / 2) ** 2;
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peak / max;
  return samples;
}

// MP3 (mono, 112 kbps)
function save(name, samples) {
  const encoder = new Mp3Encoder(1, RATE, 112);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767)));
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (chunk.length) chunks.push(Buffer.from(chunk));
  }
  const end = encoder.flush();
  if (end.length) chunks.push(Buffer.from(end));
  const file = Buffer.concat(chunks);
  writeFileSync(`${OUT}/${name}.mp3`, file);
  const seconds = samples.length / RATE;
  // How loud each tenth of a second is, before encoding (to check a sound's shape)
  const windows = [];
  for (let w = 0; w < samples.length; w += RATE / 10) {
    let sum = 0;
    const end = Math.min(samples.length, w + RATE / 10);
    for (let i = w; i < end; i++) sum += samples[i] * samples[i];
    windows.push(Math.sqrt(sum / (end - w)).toFixed(3));
  }
  console.log(`${name}.mp3  ${seconds.toFixed(2)} s  ${(file.length / 1024).toFixed(1)} KB  ${process.env.SHAPE ? windows.join(" ") : ""}`);
}

// Crystal partials (a little inharmonic, like glass): [ratio, gain, decay seconds] for a tone that rings decay seconds
const crystal = (decay, bright = 1) => [
  [1, 1, decay],
  [2.01, 0.32 * bright, decay * 0.55],
  [2.76, 0.18 * bright, decay * 0.4],
  [4.07, 0.08 * bright, decay * 0.25],
  [5.43, 0.04 * bright, decay * 0.18]
];

// A mystical scale, high up (D Lydian, pentatonic-ish): the notes the twinkles pick from
const NOTE = (semitones) => 1174.66 * 2 ** (semitones / 12); // From D6
const MYSTIC = [0, 2, 4, 6, 9, 11, 12, 14, 16, 18, 21, 23, 24];

// ---------- Twinkle (most buttons): small, gentle, quick ----------
[[MYSTIC[7], 11], [MYSTIC[9], 12], [MYSTIC[11], 13]].forEach(([note, seed], i) => {
  const random = seeded(seed);
  const out = buffer(0.32);
  tone(out, { freq: NOTE(note), attack: 0.004, partials: crystal(0.07, 0.8), phase: random() * 6 });
  tone(out, { start: 0.012, freq: NOTE(note + 12), gain: 0.22, attack: 0.004, partials: crystal(0.05, 0.5) });
  noiseBurst(out, { seconds: 0.012, gain: 0.05, low: 5000, high: 12000, random });
  save(`Twinkle${i + 1}`, finish(smooth(reverb(out, { wet: 0.22, room: 0.62 })), { fadeOut: 0.12 }));
});

// ---------- Ding (yes, save, add, on): one clear crystal bell ----------
{
  const random = seeded(21);
  const out = buffer(1.0);
  tone(out, { freq: NOTE(MYSTIC[5]), attack: 0.005, partials: crystal(0.28, 1), phase: random() * 6 });
  tone(out, { start: 0.004, freq: NOTE(MYSTIC[5] + 12), gain: 0.18, attack: 0.004, partials: crystal(0.16, 0.6) });
  noiseBurst(out, { seconds: 0.015, gain: 0.05, low: 4000, high: 12000, random });
  save("Ding", finish(smooth(reverb(out, { wet: 0.3, room: 0.72 })), { fadeOut: 0.3 }));
}

// ---------- Shatter (delete, off, cancel): a quick crystal break ----------
{
  const random = seeded(31);
  const out = buffer(0.42);
  noiseBurst(out, { seconds: 0.05, gain: 0.35, low: 2500, high: 9000, random, attack: 0.001 });
  noiseBurst(out, { start: 0.01, seconds: 0.08, gain: 0.12, low: 5000, high: 11000, random });
  // The shards: small high glass tones scattered over the first fifth of a second, softer as they go
  for (let i = 0; i < 34; i++) {
    const start = 0.003 + (random() ** 1.6) * 0.2;
    const freq = 2600 + random() * 5200;
    const gain = 0.5 * (1 - start / 0.25) * (0.4 + random() * 0.6);
    tone(out, { start, freq, gain, attack: 0.0015, partials: [[1, 1, 0.012 + random() * 0.03], [2.7, 0.3, 0.01]], phase: random() * 6, shimmer: 0.004 });
  }
  // A last falling piece
  tone(out, { start: 0.16, freq: NOTE(MYSTIC[8]), gain: 0.35, attack: 0.002, partials: crystal(0.05, 0.6) });
  save("Shatter", finish(smooth(reverb(out, { wet: 0.2, room: 0.55 }), 10000), { fadeOut: 0.1 }));
}

// ---------- Transition (pages): a crystal rolling across other crystals, soft in and soft out, within half a second ----------
{
  const random = seeded(41);
  const length = 0.5;
  const out = buffer(length);
  // Clinks closer together in the middle, like something rolling past, louder in the middle
  let time = 0.015;
  let step = 0;
  while (time < 0.36) {
    const progress = time / 0.36;
    const loudness = Math.sin(progress * Math.PI) ** 1.4;
    const note = MYSTIC[(3 + step * 2 + Math.floor(random() * 3)) % MYSTIC.length];
    tone(out, { start: time, freq: NOTE(note), gain: 0.18 + 0.82 * loudness, attack: 0.003, partials: crystal(0.045 + random() * 0.03, 0.7), phase: random() * 6 });
    noiseBurst(out, { start: time, seconds: 0.006, gain: 0.04 * loudness, low: 6000, high: 12000, random });
    time += 0.026 + 0.03 * Math.abs(progress - 0.5) * 2 + random() * 0.008;
    step++;
  }
  // A faint shimmer under it
  const shimmer = buffer(length);
  noiseBurst(shimmer, { start: 0.0, seconds: 0.45, gain: 0.05, low: 6000, high: 11000, random, attack: 0.15 });
  for (let i = 0; i < out.length; i++) out[i] += shimmer[i] * Math.sin(Math.min(1, i / out.length / 0.8) * Math.PI);
  save("Transition", finish(smooth(reverb(out, { wet: 0.28, room: 0.62 })), { fadeIn: 0.02, fadeOut: 0.12 }));
}

// ---------- Soft (every other action): barely there, quick, soft in and soft out ----------
[[MYSTIC[9], 51], [MYSTIC[12], 52]].forEach(([note, seed], i) => {
  const random = seeded(seed);
  const out = buffer(0.2);
  tone(out, { freq: NOTE(note), gain: 0.7, attack: 0.02, partials: [[1, 1, 0.05], [2.01, 0.25, 0.03]], phase: random() * 6, shimmer: 0.003 });
  tone(out, { start: 0.01, freq: NOTE(note + 7), gain: 0.25, attack: 0.02, partials: [[1, 1, 0.04]] });
  noiseBurst(out, { seconds: 0.08, gain: 0.04, low: 7000, high: 12000, random, attack: 0.02 });
  save(`Soft${i + 1}`, finish(smooth(reverb(out, { wet: 0.25, room: 0.5 })), { fadeIn: 0.015, fadeOut: 0.08, peak: 0.7 }));
});

// ---------- Ambience (music): now and then a few far-off twinkles, airy and slow ----------
// (Each a few places in MYSTIC)
[[[3, 7, 10], 61], [[1, 4, 8, 11], 62], [[5, 9], 63], [[0, 3, 7, 9], 64], [[4, 8, 12], 65]].forEach(([notes, seed], i) => {
  const random = seeded(seed);
  const out = buffer(2.6);
  notes.forEach((index, n) => {
    const start = 0.03 + n * (0.16 + random() * 0.14);
    tone(out, { start, freq: NOTE(MYSTIC[index]), gain: 0.55 + random() * 0.45, attack: 0.025 + random() * 0.02, partials: crystal(0.35 + random() * 0.25, 0.55), phase: random() * 6, shimmer: 0.002 });
  });
  save(`Ambient${i + 1}`, finish(smooth(reverb(out, { wet: 0.55, room: 0.86, damping: 0.45 }), 9000), { fadeIn: 0.02, fadeOut: 0.6, peak: 0.8 }));
});
