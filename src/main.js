import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { SHOTS, DURATION, FPS, WIDTH, HEIGHT, shotAt } from './timeline.js';
import { FinalShader } from './fx.js';
import { loadAssets } from './assets.js';
import { renderMusic, audioBufferToWav } from './music.js';
import { clamp, invLerp, ease } from './util.js';
import SHOT_FACTORIES from './shots/index.js';

const params = new URLSearchParams(location.search);
const scale = parseFloat(params.get('scale') || '1');
const W = Math.round(WIDTH * scale);
const H = Math.round(HEIGHT * scale);
const isPreview = !params.has('render');

const stage = document.getElementById('stage');
stage.style.width = W + 'px';
stage.style.height = H + 'px';

const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
uiCanvas.width = W;
uiCanvas.height = H;
const g = uiCanvas.getContext('2d');

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  antialias: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 0.85);
const finalPass = new ShaderPass(FinalShader);
finalPass.uniforms.uRes.value.set(W, H);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(finalPass);

const env = { THREE, renderer, W, H, scale, assets: null };
const shots = new Map();

async function init() {
  env.assets = await loadAssets(THREE, renderer);
  await document.fonts.ready;
  await Promise.all(
    ['500 40px Inter', '600 40px Inter', '700 40px Inter', '400 40px Inter',
     '500 40px "Chakra Petch"', '600 40px "Chakra Petch"', '700 40px "Chakra Petch"'].map((f) => document.fonts.load(f)),
  );
  for (const s of SHOTS) {
    const factory = SHOT_FACTORIES[s.id];
    if (!factory) throw new Error('Missing shot module: ' + s.id);
    shots.set(s.id, factory(env));
  }
  // Compile every scene once so the first frame of each shot does not stall.
  for (const s of SHOTS) {
    const inst = shots.get(s.id);
    inst.update(0, s.end - s.start, s.start);
    renderer.compile(inst.scene, inst.camera);
  }
}

// Global post settings for time t, combining the shot's own look with the
// cut-level transitions declared in the timeline.
function fxAt(shot, inst, local, d) {
  const fx = {
    bloom: 0.55, bloomRadius: 0.5, bloomThreshold: 0.82,
    vignette: 0.55, grain: 0.035, ca: 0.0015, blur: 0, blurDir: [1, 0],
    flash: 0, fade: 0, exposure: 1,
    // Photographs stay untouched; CG shots opt into filmic tone mapping.
    toneMapped: false,
    ...(inst.fx ? inst.fx(local, d) : {}),
  };
  if (shot.whipIn && local < shot.whipIn) {
    const k = 1 - ease.outCubic(local / shot.whipIn);
    fx.blur = Math.max(fx.blur, 0.18 * k);
    fx.ca += 0.01 * k;
  }
  if (shot.whipOut && local > d - shot.whipOut) {
    const k = ease.inCubic(invLerp(d - shot.whipOut, d, local));
    fx.blur = Math.max(fx.blur, 0.18 * k);
    fx.ca += 0.01 * k;
  }
  if (shot.flashIn && local < shot.flashIn) {
    fx.flash = Math.max(fx.flash, 0.85 * (1 - ease.outQuad(local / shot.flashIn)));
  }
  const t = shot.start + local;
  if (t < 0.4) fx.fade = Math.max(fx.fade, 1 - t / 0.4);
  return fx;
}

let lastShotId = null;
function renderFrame(t) {
  t = clamp(t, 0, DURATION - 1e-6);
  const shot = shotAt(t);
  const inst = shots.get(shot.id);
  const local = t - shot.start;
  const d = shot.end - shot.start;

  if (lastShotId !== shot.id) {
    inst.enter?.();
    lastShotId = shot.id;
  }
  inst.update(local, d, t);
  const fx = fxAt(shot, inst, local, d);

  renderPass.scene = inst.scene;
  renderPass.camera = inst.camera;
  renderer.toneMapping = fx.toneMapped ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = fx.exposure;
  bloom.strength = fx.bloom;
  bloom.radius = fx.bloomRadius;
  bloom.threshold = fx.bloomThreshold;
  const u = finalPass.uniforms;
  u.uTime.value = t;
  u.uBlur.value = fx.blur;
  u.uBlurDir.value.set(fx.blurDir[0], fx.blurDir[1]);
  u.uVignette.value = fx.vignette;
  u.uGrain.value = fx.grain;
  u.uCA.value = fx.ca;
  u.uFlash.value = fx.flash;
  u.uFade.value = fx.fade;
  composer.render();

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  if (inst.ui) {
    g.save();
    inst.ui(g, local, d, t);
    g.restore();
  }
  if (fx.fade > 0) {
    g.fillStyle = `rgba(0,0,0,${fx.fade})`;
    g.fillRect(0, 0, WIDTH, HEIGHT);
  }
  return shot.id;
}

async function renderAudioWav() {
  const buf = await renderMusic(48000);
  const bytes = audioBufferToWav(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const ready = init();
window.__video = { ready, renderFrame, renderAudioWav, fps: FPS, duration: DURATION, width: W, height: H };

// ---------------------------------------------------------------- preview
if (isPreview) {
  document.body.classList.add('preview');
  const frame = document.getElementById('frame');
  const fit = () => { stage.style.transform = `scale(${frame.clientWidth / W})`; };
  addEventListener('resize', fit);
  fit();

  const playBtn = document.getElementById('play');
  const scrub = document.getElementById('scrub');
  const timeLabel = document.getElementById('time');
  let audioCtx = null;
  let buffer = null;
  let source = null;
  let playing = false;
  let startedAt = 0;
  let offset = parseFloat(params.get('t') || '0');

  const show = (t) => { renderFrame(t); scrub.value = t; timeLabel.textContent = t.toFixed(2) + ' s'; };
  ready.then(() => show(offset));

  scrub.addEventListener('input', () => {
    offset = parseFloat(scrub.value);
    if (playing) stop();
    show(offset);
  });

  function stop() {
    playing = false;
    playBtn.textContent = 'Play';
    if (source) { source.onended = null; source.stop(); source = null; }
  }

  playBtn.addEventListener('click', async () => {
    if (playing) { offset = audioCtx.currentTime - startedAt; stop(); return; }
    await ready;
    audioCtx ??= new AudioContext();
    if (!buffer) { playBtn.textContent = 'Rendering music…'; buffer = await renderMusic(audioCtx.sampleRate); }
    if (offset >= DURATION - 0.05) offset = 0;
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    startedAt = audioCtx.currentTime - offset;
    source.start(0, offset);
    source.onended = () => { offset = 0; stop(); };
    playing = true;
    playBtn.textContent = 'Pause';
    const tick = () => {
      if (!playing) return;
      show(audioCtx.currentTime - startedAt);
      requestAnimationFrame(tick);
    };
    tick();
  });
}
