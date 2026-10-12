// Original score, synthesised with the Web Audio API — no samples, no
// licensing. 120 BPM in D minor; every hit, riser and whoosh is placed from
// the CUES in timeline.js so the music and the edit stay locked together.
import { BPM, DURATION, CUES } from './timeline.js';
import { rng } from './util.js';

const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// D minor: i – VI – III – VII  (Dm, Bb, F, C) as MIDI notes.
const CHORDS = [
  { root: 38, tones: [62, 65, 69] }, // Dm
  { root: 34, tones: [58, 62, 65] }, // Bb
  { root: 41, tones: [60, 65, 69] }, // F
  { root: 36, tones: [60, 64, 67] }, // C
];
const chordAt = (t) => (t < CUES.drop ? CHORDS[0] : CHORDS[Math.floor((t - CUES.drop) / BAR) % 4]);

export async function renderMusic(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * DURATION), sampleRate);
  const S = buildGraph(ctx);
  arrange(ctx, S);
  return ctx.startRendering();
}

// ------------------------------------------------------------------ graph

function buildGraph(ctx) {
  const r = rng(99);
  const noise = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noise.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }

  // Hall reverb from a decaying noise impulse.
  const irLen = Math.floor(ctx.sampleRate * 3.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
  }

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const reverbRet = ctx.createGain();
  reverbRet.gain.value = 0.32;
  reverb.connect(reverbRet).connect(master);

  // Dotted-eighth ping-pong-ish delay for the arp.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.33;
  const dLp = ctx.createBiquadFilter();
  dLp.type = 'lowpass';
  dLp.frequency.value = 3200;
  delay.connect(dLp).connect(fb).connect(delay);
  const delayRet = ctx.createGain();
  delayRet.gain.value = 0.35;
  dLp.connect(delayRet).connect(master);

  // Music bus is side-chained (ducked) by the kick.
  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.connect(duck);
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.8;
  sfx.connect(master);

  return { noise, master, reverb, delay, duck, music, drums, sfx };
}

// --------------------------------------------------------------- voices

function env(param, t, { a = 0.005, peak = 1, d = 0.2, s = 0, hold = 0, rel = 0.1 }) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (s > 0) {
    param.setTargetAtTime(peak * s, t + a, d / 3);
    param.setValueAtTime(peak * s, t + a + hold);
    param.linearRampToValueAtTime(0, t + a + hold + rel);
  } else {
    param.setTargetAtTime(0, t + a, d / 4);
  }
}

function noiseSrc(ctx, S, t, dur) {
  const src = ctx.createBufferSource();
  src.buffer = S.noise;
  src.loop = true;
  src.start(t, (t * 7.3) % 1.5);
  src.stop(t + dur);
  return src;
}

function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function send(ctx, node, dest, amount) {
  const g = ctx.createGain();
  g.gain.value = amount;
  node.connect(g).connect(dest);
}

function kick(ctx, S, t, vel = 1) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.002, peak: 1.0 * vel, d: 0.55 });
  o.connect(g).connect(S.drums);
  o.start(t);
  o.stop(t + 0.7);
  const n = noiseSrc(ctx, S, t, 0.03);
  const ng = ctx.createGain();
  env(ng.gain, t, { a: 0.001, peak: 0.25 * vel, d: 0.02 });
  n.connect(filter(ctx, 'highpass', 2500)).connect(ng).connect(S.drums);
  // Side-chain duck of the music bus.
  const p = S.duck.gain;
  p.setValueAtTime(1, t);
  p.linearRampToValueAtTime(0.45, t + 0.008);
  p.setTargetAtTime(1, t + 0.03, 0.09);
}

function clap(ctx, S, t, vel = 1) {
  const n = noiseSrc(ctx, S, t, 0.4);
  const bp = filter(ctx, 'bandpass', 1500, 0.9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  for (const [dt, a] of [[0, 0.8], [0.011, 0.7], [0.022, 1]]) {
    g.gain.setValueAtTime(a * 0.55 * vel, t + dt);
    g.gain.setTargetAtTime(0.05, t + dt + 0.001, 0.004);
  }
  g.gain.setValueAtTime(0.45 * vel, t + 0.03);
  g.gain.setTargetAtTime(0, t + 0.03, 0.06);
  n.connect(bp).connect(g).connect(S.drums);
  send(ctx, g, S.reverb, 0.5);
}

function hat(ctx, S, t, vel = 1, open = false) {
  const n = noiseSrc(ctx, S, t, open ? 0.4 : 0.08);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.001, peak: 0.16 * vel, d: open ? 0.3 : 0.045 });
  const pan = ctx.createStereoPanner();
  pan.pan.value = 0.25;
  n.connect(filter(ctx, 'highpass', 7500)).connect(g).connect(pan).connect(S.drums);
}

function bass(ctx, S, t, midi, dur, vel = 1) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = hz(midi);
  const sub = ctx.createOscillator();
  sub.frequency.value = hz(midi);
  const lp = filter(ctx, 'lowpass', 300, 4);
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.setTargetAtTime(220, t, 0.06);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.004, peak: 0.32 * vel, d: 0.3, s: 0.7, hold: dur * 0.7, rel: dur * 0.25 });
  o.connect(lp).connect(g);
  const sg = ctx.createGain();
  sg.gain.value = 1.2;
  sub.connect(sg).connect(g);
  g.connect(S.music);
  o.start(t); sub.start(t);
  o.stop(t + dur + 0.1); sub.stop(t + dur + 0.1);
}

function pad(ctx, S, t, midis, dur, { cutoff = [500, 1600], vel = 1 } = {}) {
  const g = ctx.createGain();
  env(g.gain, t, { a: Math.min(0.5, dur * 0.3), peak: 0.06 * vel, d: 0.4, s: 1, hold: dur - 0.3, rel: 0.6 });
  const lp = filter(ctx, 'lowpass', cutoff[0], 0.6);
  lp.frequency.setValueAtTime(cutoff[0], t);
  lp.frequency.linearRampToValueAtTime(cutoff[1], t + dur);
  lp.connect(g);
  g.connect(S.music);
  send(ctx, g, S.reverb, 0.9);
  for (const m of midis) {
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = det;
      const pan = ctx.createStereoPanner();
      pan.pan.value = det / 12;
      o.connect(pan).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.8);
    }
  }
}

function pluck(ctx, S, t, midi, vel = 1, bright = 0.5) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = hz(midi);
  const lp = filter(ctx, 'lowpass', 600, 3);
  lp.frequency.setValueAtTime(1200 + bright * 4000, t);
  lp.frequency.setTargetAtTime(500, t, 0.05);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.002, peak: 0.07 * vel, d: 0.18 });
  o.connect(lp).connect(g).connect(S.music);
  send(ctx, g, S.delay, 0.8);
  o.start(t);
  o.stop(t + 0.3);
}

function lead(ctx, S, t, midi, dur, vel = 1) {
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.02, peak: 0.07 * vel, d: 0.2, s: 0.8, hold: dur, rel: 0.25 });
  const lp = filter(ctx, 'lowpass', 2600, 1);
  lp.connect(g).connect(S.music);
  send(ctx, g, S.reverb, 0.6);
  send(ctx, g, S.delay, 0.4);
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    o.detune.value = det;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = 9;
    vib.connect(vg).connect(o.detune);
    o.connect(lp);
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.4); vib.stop(t + dur + 0.4);
  }
}

function impact(ctx, S, t, size = 1) {
  // Sub drop.
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(26, t + 1.2 * size);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.003, peak: 0.9 * size, d: 1.6 * size });
  o.connect(g).connect(S.sfx);
  o.start(t);
  o.stop(t + 2.5);
  // Body: filtered noise burst into the hall.
  const n = noiseSrc(ctx, S, t, 1.5);
  const ng = ctx.createGain();
  env(ng.gain, t, { a: 0.002, peak: 0.5 * size, d: 0.6 });
  const lp = filter(ctx, 'lowpass', 2200);
  lp.frequency.setTargetAtTime(300, t, 0.15);
  n.connect(lp).connect(ng).connect(S.sfx);
  send(ctx, ng, S.reverb, 1.2);
  // "Braam": low detuned saws.
  braam(ctx, S, t, 0.8 * size);
}

function braam(ctx, S, t, vel = 1, midi = 26) {
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.01, peak: 0.16 * vel, d: 1.2 });
  const lp = filter(ctx, 'lowpass', 1400, 1.5);
  lp.frequency.setValueAtTime(1600, t);
  lp.frequency.setTargetAtTime(180, t + 0.05, 0.35);
  lp.connect(g).connect(S.sfx);
  send(ctx, g, S.reverb, 0.6);
  for (const [m, det] of [[midi, -12], [midi, 10], [midi + 12, 0], [midi + 19, 5]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(m);
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(t + 2);
  }
}

function crash(ctx, S, t, vel = 1) {
  const n = noiseSrc(ctx, S, t, 2.5);
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.002, peak: 0.22 * vel, d: 1.8 });
  n.connect(filter(ctx, 'highpass', 4500)).connect(g).connect(S.drums);
  send(ctx, g, S.reverb, 0.7);
}

function riser(ctx, S, t0, t1, vel = 1) {
  const dur = t1 - t0;
  const n = noiseSrc(ctx, S, t0, dur);
  const bp = filter(ctx, 'bandpass', 300, 2.5);
  bp.frequency.setValueAtTime(300, t0);
  bp.frequency.exponentialRampToValueAtTime(7000, t1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5 * vel, t1 - 0.02);
  g.gain.linearRampToValueAtTime(0, t1);
  n.connect(bp).connect(g).connect(S.sfx);
  send(ctx, g, S.reverb, 0.5);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(880, t1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(0.05 * vel, t1 - 0.02);
  og.gain.linearRampToValueAtTime(0, t1);
  o.connect(filter(ctx, 'lowpass', 2500)).connect(og).connect(S.sfx);
  o.start(t0);
  o.stop(t1);
}

function whoosh(ctx, S, t, dur = 0.6, vel = 1) {
  const t0 = t - dur * 0.6;
  const n = noiseSrc(ctx, S, t0, dur);
  const bp = filter(ctx, 'bandpass', 400, 1.2);
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(3200, t);
  bp.frequency.exponentialRampToValueAtTime(500, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.55 * vel, t);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(-0.8, t0);
  pan.pan.linearRampToValueAtTime(0.8, t0 + dur);
  n.connect(bp).connect(g).connect(pan).connect(S.sfx);
}

function blip(ctx, S, t, vel = 1) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = 2400;
  const g = ctx.createGain();
  env(g.gain, t, { a: 0.001, peak: 0.05 * vel, d: 0.025 });
  o.connect(g).connect(S.sfx);
  o.start(t);
  o.stop(t + 0.06);
}

function bell(ctx, S, t, midi, vel = 1) {
  for (const [mult, amp] of [[1, 1], [2, 0.4], [3.01, 0.2]]) {
    const o = ctx.createOscillator();
    o.frequency.value = hz(midi) * mult;
    const g = ctx.createGain();
    env(g.gain, t, { a: 0.002, peak: 0.05 * vel * amp, d: 1.6 });
    o.connect(g).connect(S.music);
    send(ctx, g, S.reverb, 1.4);
    o.start(t);
    o.stop(t + 2.2);
  }
}

// ------------------------------------------------------------ arrangement

function arrange(ctx, S) {
  const { drop, breath, dreamDrop, statHits, finale, finalHit, end } = CUES;

  // Intro: tension. Low pad, heartbeat kick, ticking hats, riser into the drop.
  pad(ctx, S, 0, [50, 57, 62], drop - 0.15, { cutoff: [300, 1300], vel: 0.7 });
  bass(ctx, S, 0, 26, drop - 0.3, 0.5);
  for (let t = 0; t < drop - 0.3; t += BEAT * 2) kick(ctx, S, t, 0.4);
  for (let t = BEAT; t < drop - 0.3; t += BEAT / 2) hat(ctx, S, t, 0.35);
  riser(ctx, S, CUES.riserStart, drop, 1);

  // Main groove helper: one bar of drums from bar start b.
  const grooveBar = (b, { full = true, hats16 = false } = {}) => {
    kick(ctx, S, b, 1);
    kick(ctx, S, b + BEAT * 1.5, 0.8);
    if (full) kick(ctx, S, b + BEAT * 2.5, 0.85);
    clap(ctx, S, b + BEAT * 2, 1);
    const step = hats16 ? BEAT / 4 : BEAT / 2;
    for (let s = 0; s < BAR - 1e-6; s += step) hat(ctx, S, b + s, (s / BEAT) % 1 === 0.5 ? 1 : 0.55);
  };
  const harmonyBar = (b, { arp = true, bright = 0.4, len = BAR } = {}) => {
    const ch = chordAt(b + 0.01);
    pad(ctx, S, b, ch.tones, len, { cutoff: [900, 2200] });
    for (let s = 0; s < len - 1e-6; s += BEAT / 2) bass(ctx, S, b + s, ch.root, BEAT / 2 - 0.03, s === 0 ? 1 : 0.75);
    if (arp) {
      const notes = [...ch.tones, ch.tones[0] + 12, ch.tones[1] + 12, ch.tones[2] + 12];
      const order = [0, 2, 1, 3, 2, 4, 3, 5];
      for (let i = 0; i * BEAT / 4 < len - 1e-6; i++) pluck(ctx, S, b + i * BEAT / 4, notes[order[i % 8]], i % 4 === 0 ? 1 : 0.7, bright);
    }
  };

  // Drop: Urban.
  impact(ctx, S, drop, 1);
  crash(ctx, S, drop, 1);
  for (let b = drop; b < breath - 1e-6; b += BAR) {
    grooveBar(b, { hats16: b >= 9.5 });
    harmonyBar(b, { arp: b >= 6, bright: b >= 9.5 ? 0.8 : 0.4, len: Math.min(BAR, breath - b) });
  }
  riser(ctx, S, breath - 1.0, breath, 0.5);

  // Breath: the flight shot. Drums drop out, harmony keeps flowing.
  for (let b = breath; b < dreamDrop - 1e-6; b += BAR) harmonyBar(b, { arp: true, bright: 0.9, len: Math.min(BAR, dreamDrop - b) });
  for (let t = breath; t < dreamDrop - 0.2; t += BEAT / 2) hat(ctx, S, t, 0.3);
  riser(ctx, S, breath + 1.0, dreamDrop, 0.9);

  // Dream Pro.
  impact(ctx, S, dreamDrop, 0.9);
  crash(ctx, S, dreamDrop, 0.8);
  for (let b = dreamDrop + BEAT; b < finale - 1e-6; b += BAR) {
    const len = Math.min(BAR, finale - b);
    grooveBar(b, { hats16: true });
    harmonyBar(b, { arp: true, bright: 0.7, len });
  }
  // Spec hits: braam + counter blips while the numbers roll.
  for (const h of statHits) {
    braam(ctx, S, h, 0.9, 26);
    for (let i = 0; i < 12; i++) blip(ctx, S, h + 0.12 + 0.8 * Math.pow(i / 12, 1.8), 1 - i / 16);
  }
  riser(ctx, S, finale - 1.0, finale, 0.7);

  // Finale: biggest section with the lead motif.
  crash(ctx, S, finale, 1);
  kick(ctx, S, finale, 1.1);
  for (let b = finale; b < finalHit - 1e-6; b += BAR) {
    const len = Math.min(BAR, finalHit - b);
    grooveBar(b, { hats16: true });
    harmonyBar(b, { arp: true, bright: 1, len });
  }
  const motif = [[0, 69, 0.4], [0.5, 74, 0.4], [1.0, 77, 0.6], [1.75, 76, 0.2], [2.0, 74, 0.4]];
  for (const [dt, m, dur] of motif) lead(ctx, S, finale + dt, m, dur, 1);
  whoosh(ctx, S, finalHit, 0.7, 0.8);

  // Final hit and logo: resolve on Dm, long tail into silence.
  impact(ctx, S, finalHit, 1.1);
  crash(ctx, S, finalHit, 1.1);
  pad(ctx, S, finalHit, [50, 57, 62, 65], end - finalHit - 0.6, { cutoff: [2400, 700], vel: 1.2 });
  bass(ctx, S, finalHit, 26, 2.2, 0.8);
  [74, 81, 77, 86].forEach((m, i) => bell(ctx, S, finalHit + 0.45 + i * 0.16, m, 1 - i * 0.12));

  // Transition whooshes on the whip cuts.
  for (const w of CUES.whooshes) whoosh(ctx, S, w, 0.6, 0.9);

  // Master fade over the last second so the file ends cleanly.
  S.master.gain.setValueAtTime(0.9, end - 1.2);
  S.master.gain.linearRampToValueAtTime(0, end - 0.02);
}

// ------------------------------------------------------------------ export

export function audioBufferToWav(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, len * ch * 2, true);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let peak = 0;
  for (const d of data) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const gain = peak > 0.89 ? 0.89 / peak : 1; // keep ~1 dB of headroom
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] * gain));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}
