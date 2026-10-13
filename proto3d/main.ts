// 3D 样张：第 2 关。Three.js 渲染 + 物理优先的毛线（是否缠着由物理接触决定）。
import levelsJson from '../src/levels/levels.json';
import type { LevelData } from '../src/core/board';
import { createSynth, AudioCtxLike } from '../src/platform/synth';
import { Pin, Rope3, RopeWorld } from './physics';
import { buildBoard, buildButton, buildYarnBall, feltTexture, setupLights, THREE, YarnMesh, yarnTexture } from './scene';

const LEVEL = (levelsJson as unknown as LevelData[])[1];
const LIFT = 0.55;

// ───────────── 触感 / 音效 ─────────────

let audio: AudioCtxLike | null = null;
const sfx = createSynth(() => audio);
function ensureAudio() {
  if (audio) return;
  const W = window as unknown as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike };
  const C = W.AudioContext || W.webkitAudioContext;
  if (C) audio = new C();
}
function haptic(kind: 'light' | 'medium' | 'heavy' | 'warning') {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate({ light: 8, medium: 18, heavy: 32, warning: [28, 60, 28] }[kind]);
      return;
    }
    // iOS：切换隐藏的系统开关给一下轻触反馈
    const label = document.createElement('label');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // 不支持
  }
}

// ───────────── 场景 ─────────────

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const xs = LEVEL.holes.map((h) => h[0]);
const zs = LEVEL.holes.map((h) => h[1]);
const minX = Math.min(...xs) - 0.9;
const maxX = Math.max(...xs) + 0.9;
const minZ = Math.min(...zs) - 0.9;
const maxZ = Math.max(...zs) + 0.9;
const cx = (minX + maxX) / 2;
const cz = (minZ + maxZ) / 2;
const span = Math.max(maxX - minX, maxZ - minZ);
setupLights(scene, renderer, cx, cz, span);

const felt = feltTexture();
const yarnTex = yarnTexture();
scene.add(buildBoard(LEVEL, felt));

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
function fitCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 可视区域：上方留给 HUD，下方留给提示
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const needW = (maxX - minX) / 2 + 0.25;
  const needH = (maxZ - minZ) / 2 + 0.6;
  const dist = Math.max(needW / Math.tan(hfov / 2), needH / Math.tan(vfov / 2));
  // 略微倾斜，让厚度和投影看得出来
  const tilt = 0.24;
  camera.position.set(cx, dist * Math.cos(tilt), cz + dist * Math.sin(tilt) + 0.15);
  camera.lookAt(cx, 0, cz + 0.15);
  camera.updateProjectionMatrix();
}
fitCamera();
window.addEventListener('resize', fitCamera);

// ───────────── 关卡状态 ─────────────

interface PinView {
  pin: Pin;
  group: THREE.Group;
  hole: number;
  /** 落孔压扁动画计时 */
  squash: number;
}

let world: RopeWorld;
let yarns: YarnMesh[] = [];
let pinViews: PinView[] = [];
let balls: { mesh: THREE.Mesh; t: number; from: THREE.Vector3 }[] = [];
let clearing: { rope: Rope3; t: number; mid: THREE.Vector3; ball: THREE.Mesh }[] = [];
let moves = 0;
let cleared = 0;
let settleTimer = 0;
const dynamic = new THREE.Group();
scene.add(dynamic);

const hud = {
  moves: document.getElementById('moves')!,
  done: document.getElementById('done')!,
  tip: document.getElementById('tip')!,
  win: document.getElementById('win')!,
};

function say(msg: string) {
  hud.tip.textContent = msg;
  hud.tip.classList.remove('pop');
  void hud.tip.offsetWidth;
  hud.tip.classList.add('pop');
}

function reset() {
  dynamic.clear();
  world = new RopeWorld();
  yarns = [];
  pinViews = [];
  balls = [];
  clearing = [];
  moves = 0;
  cleared = 0;
  LEVEL.ropes.forEach(([color, a, b], i) => {
    const pa: Pin = { x: LEVEL.holes[a][0], y: 0, z: LEVEL.holes[a][1], rope: i, end: 0 };
    const pb: Pin = { x: LEVEL.holes[b][0], y: 0, z: LEVEL.holes[b][1], rope: i, end: 1 };
    // 数组靠后的毛线在上层：从更高处落下来
    const rope = new Rope3(i, color, [pa, pb], 0.12 + i * 0.22);
    world.ropes.push(rope);
    const y = new YarnMesh(color, yarnTex);
    yarns.push(y);
    dynamic.add(y.mesh);
    for (const [pin, hole] of [
      [pa, a],
      [pb, b],
    ] as const) {
      const g = buildButton(color);
      dynamic.add(g);
      pinViews.push({ pin, group: g, hole, squash: 1 });
    }
  });
  // 先让毛线自然落下、叠好
  for (let i = 0; i < 240; i++) world.step(1 / 120);
  hud.win.classList.remove('show');
  updateHud();
  say('拖动纽扣试试：被压住的毛线会被拽住');
}

function updateHud() {
  hud.moves.textContent = String(moves);
  hud.done.textContent = `${cleared}/${LEVEL.ropes.length}`;
}

// ───────────── 输入 ─────────────

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const liftPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT);

function boardPoint(e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, p);
}

let drag: { view: PinView; tx: number; tz: number; target: number; moved: boolean; sx: number; sy: number } | null = null;

function occupied(hole: number): boolean {
  return pinViews.some((v) => world.ropes[v.pin.rope].alive && v.hole === hole);
}

function nearestFreeHole(x: number, z: number): number {
  let best = -1;
  let bd = 0.5;
  LEVEL.holes.forEach(([hx, hz], h) => {
    const d = Math.hypot(hx - x, hz - z);
    if (d < bd && !occupied(h)) {
      bd = d;
      best = h;
    }
  });
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  const p = boardPoint(e, groundPlane);
  if (!p) return;
  let best: PinView | null = null;
  let bd = 0.45;
  for (const v of pinViews) {
    if (!world.ropes[v.pin.rope].alive) continue;
    const d = Math.hypot(v.pin.x - p.x, v.pin.z - p.z);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  if (!best) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { view: best, tx: best.pin.x, tz: best.pin.z, target: -1, moved: false, sx: e.clientX, sy: e.clientY };
  world.ropes[best.pin.rope].holdRest = true;
  sfx.play('pick');
  haptic('light');
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
  const p = boardPoint(e, liftPlane);
  if (!p) return;
  drag.tx = p.x;
  drag.tz = p.z;
  const h = nearestFreeHole(p.x, p.z);
  if (h !== drag.target) {
    drag.target = h;
    if (h >= 0) {
      haptic('light');
      sfx.play('tap');
    }
  }
});

function endDrag() {
  if (!drag) return;
  const { view, target } = drag;
  world.ropes[view.pin.rope].holdRest = false;
  if (target >= 0 && target !== view.hole) {
    view.hole = target;
    moves++;
    view.squash = 0;
    world.ropes[view.pin.rope].pluck(0.025);
    sfx.play('drop');
    haptic('medium');
    settleTimer = 0;
    updateHud();
  } else {
    sfx.play('drop');
  }
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
document.getElementById('restart')!.addEventListener('click', () => {
  haptic('light');
  reset();
});
document.getElementById('again')!.addEventListener('click', () => reset());

// ───────────── 循环 ─────────────

let last = performance.now();
let acc = 0;
const STEP = 1 / 180;

function frame(now: number) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;

  // 纽扣位置：拖着的抬起来跟手（靠近空孔时被吸过去），其余回到孔里
  for (const v of pinViews) {
    const [hx, hz] = LEVEL.holes[v.hole];
    let tx = hx;
    let tz = hz;
    let ty = 0;
    if (drag && drag.view === v && drag.moved) {
      tx = drag.tx;
      tz = drag.tz;
      ty = LIFT;
      if (drag.target >= 0) {
        const [gx, gz] = LEVEL.holes[drag.target];
        tx += (gx - tx) * 0.6;
        tz += (gz - tz) * 0.6;
        ty = LIFT * 0.55;
      }
    }
    const k = 1 - Math.exp(-dt * (drag && drag.view === v ? 26 : 16));
    // 限制纽扣最大速度，防止毛线被扯得穿过别的毛线
    let mx = (tx - v.pin.x) * k;
    let mz = (tz - v.pin.z) * k;
    const maxMove = 7 * dt;
    const mm = Math.hypot(mx, mz);
    if (mm > maxMove && mm > 0) {
      mx *= maxMove / mm;
      mz *= maxMove / mm;
    }
    v.pin.x += mx;
    v.pin.z += mz;
    v.pin.y += (ty - v.pin.y) * k;
    if (v.squash < 1) v.squash = Math.min(1, v.squash + dt * 2.2);
    const s = v.squash < 1 ? 1 + 0.25 * Math.exp(-v.squash * 8) * Math.cos(v.squash * 30) : 1;
    const lifted = v.pin.y / LIFT;
    v.group.position.set(v.pin.x, v.pin.y, v.pin.z);
    v.group.scale.set((1 + lifted * 0.15) * s, (1 + lifted * 0.15) / s, (1 + lifted * 0.15) * s);
    v.group.visible = world.ropes[v.pin.rope].alive;
  }

  // 定步长物理
  acc += dt;
  while (acc >= STEP) {
    world.step(STEP);
    acc -= STEP;
  }

  // 物理优先的消除：静止下来后，没有碰到任何别的毛线 / 纽扣的毛线被理顺
  if (!drag) {
    settleTimer += dt;
    if (settleTimer > 0.35 && world.maxSpeed(STEP) < 0.6) {
      const contacts = world.contacts();
      for (const r of world.ropes) {
        if (r.alive && contacts.get(r.id)!.size === 0) startClear(r);
      }
    }
  }

  // 毛线网格
  world.ropes.forEach((r, i) => {
    const y = yarns[i];
    y.mesh.visible = r.alive;
    if (r.alive) y.update(r.x, r.y, r.z, r.n, 1 / Math.sqrt(Math.max(1, r.stretch())));
  });

  // 消除动画：毛线收拢成球 -> 飞走
  for (const c of clearing) {
    c.t += dt;
    const u = Math.min(1, c.t / 0.45);
    const r = c.rope;
    for (let i = 0; i < r.n; i++) {
      r.x[i] += (c.mid.x - r.x[i]) * u * 0.25;
      r.y[i] += (c.mid.y + 0.3 - r.y[i]) * u * 0.25;
      r.z[i] += (c.mid.z - r.z[i]) * u * 0.25;
    }
    const y = yarns[r.id];
    y.mesh.visible = u < 0.95;
    if (u < 0.95) y.update(r.x, r.y, r.z, r.n, 1 - u * 0.5);
    c.ball.scale.setScalar(Math.min(1, u * 1.3));
    c.ball.position.set(c.mid.x, c.mid.y + 0.35, c.mid.z);
    c.ball.rotation.y += dt * 6;
    if (u >= 1) balls.push({ mesh: c.ball, t: 0, from: c.ball.position.clone() });
  }
  clearing = clearing.filter((c) => c.t < 0.45);
  for (const b of balls) {
    b.t += dt;
    const u = Math.min(1, b.t / 0.6);
    b.mesh.position.set(b.from.x + (maxX + 1 - b.from.x) * u, b.from.y + Math.sin(u * Math.PI) * 1.5 + u * 2, b.from.z + (minZ - 1.5 - b.from.z) * u);
    b.mesh.scale.setScalar(1 - u * 0.6);
    b.mesh.rotation.x += dt * 8;
    if (u >= 1) dynamic.remove(b.mesh);
  }
  balls = balls.filter((b) => b.t < 0.6);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function startClear(r: Rope3) {
  r.alive = false;
  const m = Math.floor(r.n / 2);
  const ball = buildYarnBall(r.color, yarnTex);
  ball.scale.setScalar(0.01);
  dynamic.add(ball);
  clearing.push({ rope: r, t: 0, mid: new THREE.Vector3(r.x[m], r.y[m], r.z[m]), ball });
  cleared++;
  updateHud();
  sfx.play('clear');
  haptic('heavy');
  if (cleared === LEVEL.ropes.length) {
    setTimeout(() => {
      sfx.play('win');
      hud.win.classList.add('show');
    }, 700);
  } else say('好耶，理好一团！');
}

reset();
requestAnimationFrame(frame);

// 调试用：返回纽扣和孔在屏幕上的位置（自动化测试脚本使用）
(window as unknown as { __proto3d: unknown }).__proto3d = {
  toScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  },
  pins: () => pinViews.map((v) => ({ rope: v.pin.rope, end: v.pin.end, hole: v.hole, x: v.pin.x, z: v.pin.z, alive: world.ropes[v.pin.rope].alive })),
  holes: () => LEVEL.holes,
  cleared: () => cleared,
  contacts: () => [...world.contacts()].map(([k, v]) => [k, [...v]]),
};
