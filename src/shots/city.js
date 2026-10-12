// Shots 1–2: a city at dusk drawn as long-exposure light trails.
// "Stuck on the same road?" → the camera cranes straight up: "Rise above it."
import * as THREE from 'three';
import { rng, ease, invLerp, lerp, shake, smoothstep } from '../util.js';
import { revealLine } from '../text.js';
import { sky } from '../kit.js';

const BLOCK = 44; // street spacing
const N = 7; // streets each side of the origin
const SPAN = BLOCK * N * 2;

function windowTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0c12';
  g.fillRect(0, 0, 64, 128);
  const r = rng(seed);
  for (let y = 4; y < 124; y += 8) {
    for (let x = 4; x < 60; x += 7) {
      const p = r();
      if (p < 0.55) continue;
      g.fillStyle = p > 0.85 ? '#ffd9a0' : p > 0.7 ? '#9fc4ff' : '#1a2030';
      g.fillRect(x, y, 4, 5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function buildCity() {
  const scene = new THREE.Scene();
  const dusk = new THREE.Color('#141a2b');
  scene.fog = new THREE.FogExp2(dusk, 0.0055);

  scene.add(sky({ top: '#0e1630', horizon: '#3a3f5c', sun: '#ff8a4a', sunDir: [-0.3, 0.02, -1], sunStrength: 0.5, cloudY: -1000 }));
  scene.add(new THREE.HemisphereLight('#7a88b8', '#0b0b10', 0.6));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN * 3, SPAN * 3),
    new THREE.MeshStandardMaterial({ color: '#0d0f15', roughness: 0.55 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Buildings fill every block, leaving the streets clear.
  const r = rng(21);
  const winTex = windowTexture(4);
  const sideMat = new THREE.MeshStandardMaterial({ color: '#141824', emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.55, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#0c0e14', roughness: 0.9 });
  const mats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
  const boxes = [];
  for (let bx = -N; bx < N; bx++) {
    for (let bz = -N; bz < N; bz++) {
      const x0 = bx * BLOCK + 9, x1 = (bx + 1) * BLOCK - 9;
      const z0 = bz * BLOCK + 9, z1 = (bz + 1) * BLOCK - 9;
      for (let i = 0; i < 4; i++) {
        const w = 8 + r() * 10, d = 8 + r() * 10;
        const h = 10 + Math.pow(r(), 2) * 70;
        const x = lerp(x0 + w / 2, x1 - w / 2, r());
        const z = lerp(z0 + d / 2, z1 - d / 2, r());
        boxes.push({ x, z, w, d, h });
      }
    }
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildings = new THREE.InstancedMesh(bGeo, mats, boxes.length);
  const m = new THREE.Matrix4();
  boxes.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
    buildings.setMatrixAt(i, m);
  });
  scene.add(buildings);

  // Light trails. Each car is one long glowing streak (long exposure look).
  const cars = [];
  const lanes = [
    { off: 3.4, dir: -1, red: true }, { off: 6.6, dir: -1, red: true },
    { off: -3.4, dir: 1, red: false }, { off: -6.6, dir: 1, red: false },
  ];
  for (let k = -N; k <= N; k++) {
    for (const axis of ['z', 'x']) {
      for (const lane of lanes) {
        const count = k === 0 && axis === 'z' ? 26 : 9;
        for (let i = 0; i < count; i++) {
          cars.push({
            axis, street: k * BLOCK, lane, s0: r() * SPAN,
            speed: 14 + r() * 10, len: 7 + r() * 9,
          });
        }
      }
    }
  }
  const streakGeo = new THREE.BoxGeometry(0.22, 0.14, 1);
  const streaks = new THREE.InstancedMesh(streakGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true }), cars.length);
  const red = new THREE.Color('#ff2b14').multiplyScalar(4);
  const white = new THREE.Color('#ffe7c2').multiplyScalar(2.2);
  cars.forEach((c, i) => streaks.setColorAt(i, c.lane.red ? red : white));
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(streaks);

  // Street lamps: warm points along every street.
  const lampPos = [];
  for (let k = -N; k <= N; k++) {
    for (let s = -SPAN / 2; s < SPAN / 2; s += 18) {
      lampPos.push(k * BLOCK + 8, 7, s, k * BLOCK - 8, 7, s + 9, s, 7, k * BLOCK + 8, s + 9, 7, k * BLOCK - 8);
    }
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const lamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#ffb36b').multiplyScalar(3), size: 0.9, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(lamps);

  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  function animate(t) {
    cars.forEach((c, i) => {
      let s = (c.s0 + c.lane.dir * c.speed * t) % SPAN;
      if (s < 0) s += SPAN;
      s -= SPAN / 2;
      if (c.axis === 'z') {
        pos.set(c.street + c.lane.off, 0.75, s);
        q.identity();
      } else {
        pos.set(s, 0.75, c.street - c.lane.off);
        q.setFromAxisAngle(yAxis, Math.PI / 2);
      }
      scl.set(1, 1, c.len);
      m.compose(pos, q, scl);
      streaks.setMatrixAt(i, m);
    });
    streaks.instanceMatrix.needsUpdate = true;
  }

  return { scene, animate, skyMesh: scene.children[0] };
}

function cityShot(env, cameraPath, ui) {
  const city = buildCity();
  const camera = new THREE.PerspectiveCamera(42, env.W / env.H, 0.1, 2000);
  return {
    scene: city.scene,
    camera,
    update(t, d, gt) {
      cameraPath(camera, t, d);
      camera.updateMatrixWorld();
      city.animate(gt);
      city.skyMesh.userData.update(camera, gt);
    },
    ui,
    fx: () => ({ toneMapped: true, exposure: 1.0, bloom: 0.75, bloomRadius: 0.4, bloomThreshold: 0.85, vignette: 0.7, grain: 0.045 }),
  };
}

export function traffic(env) {
  return cityShot(
    env,
    (cam, t) => {
      // Low, slow, slightly handheld push along the kerb.
      const [sx, sy] = shake(t, 0.03, 1.4, 3);
      cam.position.set(0.2 + sx, 2.0 + sy, 30 - t * 2.5);
      cam.lookAt(0.6, 3.4, -120);
      cam.rotation.z += -0.02;
    },
    (g, t) => {
      revealLine(g, [{ text: 'Stuck on the same road?' }], t, { y: 560, size: 66, inAt: 0.25, outAt: 1.7 });
    },
  );
}

export function rise(env) {
  return cityShot(
    env,
    (cam, t, d) => {
      // Crane up from street level to a top-down view of the grid.
      const k = ease.inOutCubic(invLerp(0, d, t));
      const y = lerp(2.0, 130, Math.pow(k, 1.6));
      const pitch = lerp(-0.05, -1.45, smoothstep(0.05, 0.85, k));
      cam.position.set(lerp(0.2, 4, k), y, lerp(25, 10, k));
      cam.rotation.set(pitch, lerp(0.02, 0.35, k), 0, 'YXZ');
    },
    (g, t) => {
      revealLine(g, [{ text: 'Rise above it.' }], t, { y: 560, size: 72, inAt: 0.35, outAt: 1.65, outDur: 0.25 });
    },
  );
}
