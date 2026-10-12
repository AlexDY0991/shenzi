// Shot 5: CG close-up of one of Urban's enclosed ducted-fan pods — the
// equivalent of the reference film's internal "DuoRoller" CG insert.
// An orange scan line builds the pod from wireframe to solid while air is
// drawn through the grille and pushed out underneath.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rng, ease, invLerp, lerp, smoothstep } from '../util.js';
import { featureCaption } from '../text.js';
import { ORANGE } from '../timeline.js';

// Elongated octagon footprint, like the product's pods.
const A = 1.25; // half width (x)
const B = 0.9; // half depth (z)
const C = 0.38; // chamfer
const RIM = 0.13;

function octagon(a, b, c) {
  const s = new THREE.Shape();
  s.moveTo(-a + c, -b);
  s.lineTo(a - c, -b);
  s.lineTo(a, -b + c);
  s.lineTo(a, b - c);
  s.lineTo(a - c, b);
  s.lineTo(-a + c, b);
  s.lineTo(-a, b - c);
  s.lineTo(-a, -b + c);
  s.closePath();
  return s;
}

function ring(height, y, bevel) {
  const shape = octagon(A, B, C);
  shape.holes.push(octagon(A - RIM, B - RIM, C - RIM * 0.4));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2); // extrude upward along +y
  geo.translate(0, y, 0);
  return geo;
}

function innerHalfWidth(z) {
  const a = A - RIM, b = B - RIM, c = C - RIM * 0.4;
  const az = Math.abs(z);
  return az <= b - c ? a : a - (az - (b - c));
}

function buildPod() {
  const pod = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: '#0e0f11', roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#bfc1c4', roughness: 0.45, clearcoat: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.35, metalness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.45, metalness: 0.3 });
  const solids = [body, white, metal, carbon];

  pod.add(new THREE.Mesh(ring(0.26, 0.0, 0.02), body));
  pod.add(new THREE.Mesh(ring(0.09, -0.11, 0.01), white));

  // Grille slats across the opening.
  const slat = new THREE.BoxGeometry(1, 0.05, 0.026);
  const slats = [];
  for (let z = -B + RIM + 0.05; z <= B - RIM - 0.05; z += 0.075) slats.push(z);
  const grille = new THREE.InstancedMesh(slat, metal, slats.length);
  const m = new THREE.Matrix4();
  slats.forEach((z, i) => {
    const w = innerHalfWidth(z) * 2 + 0.02;
    m.compose(new THREE.Vector3(0, 0.25, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, 1));
    grille.setMatrixAt(i, m);
  });
  pod.add(grille);

  // Rotor: hub + 3 pitched blades, plus a cross strut holding the motor.
  const rotor = new THREE.Group();
  rotor.position.y = 0.08;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 32), metal);
  rotor.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13), carbon);
    blade.geometry.translate(0.36, 0, 0);
    blade.rotation.y = (i / 3) * Math.PI * 2;
    blade.rotateX(0.32);
    rotor.add(blade);
  }
  pod.add(rotor);
  const strut = new THREE.Mesh(new THREE.BoxGeometry((A - RIM) * 2, 0.035, 0.06), metal);
  strut.position.y = 0.0;
  pod.add(strut);

  return { pod, rotor, solids };
}

function airflow(count, seed) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const ang = r() * Math.PI * 2;
    parts.push({ ang, rad: 0.35 + Math.sqrt(r()) * 0.95, p0: r(), rate: 0.38 + r() * 0.25, len: 0.035 + r() * 0.04 });
  }
  const pos = new Float32Array(count * 6);
  const col = new Float32Array(count * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  lines.frustumCulled = false;

  // Streamline: converge from above into the duct, accelerate, spread below.
  const at = (pt, p) => {
    const y = lerp(2.2, -2.4, Math.pow(p, 1.25));
    const squeeze = p < 0.5 ? lerp(1.35, 0.62, smoothstep(0, 0.5, p)) : lerp(0.62, 1.15, smoothstep(0.5, 1, p));
    const rr = pt.rad * squeeze;
    const swirl = pt.ang + p * 1.4;
    return [Math.cos(swirl) * rr * (A / 1.05), y, Math.sin(swirl) * rr * (B / 1.05)];
  };
  lines.userData.update = (t) => {
    parts.forEach((pt, i) => {
      const p = (pt.p0 + t * pt.rate) % 1;
      const a = at(pt, p);
      const b = at(pt, Math.max(0, p - pt.len * (p > 0.5 ? 2.2 : 1)));
      pos.set(a, i * 6);
      pos.set(b, i * 6 + 3);
      const fade = Math.sin(Math.PI * p);
      const glow = 0.6 + 1.6 * smoothstep(0.4, 0.6, p) * (1 - smoothstep(0.6, 1, p));
      const c = fade * glow;
      col.set([0.75 * c, 0.88 * c, 1.0 * c], i * 6);
      col.set([0, 0, 0], i * 6 + 3);
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return lines;
}

export function ductedFan(env) {
  const { renderer } = env;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color('#050506');

  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 5, 2);
  const rim = new THREE.PointLight(ORANGE, 30, 12, 1.5);
  rim.position.set(-2.5, 1.0, -2.5);
  scene.add(key, rim);

  const { pod, rotor, solids } = buildPod();
  scene.add(pod);

  // Scan reveal: solid below the line, orange wireframe above it.
  const below = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const above = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  solids.forEach((mat) => { mat.clippingPlanes = [below]; });
  const wireMat = new THREE.LineBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(2.5), clippingPlanes: [above], transparent: true, toneMapped: false });
  pod.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), wireMat);
      e.position.copy(o.position);
      e.rotation.copy(o.rotation);
      e.scale.copy(o.scale);
      o.parent.add(e);
    }
  });
  const scanRing = new THREE.Mesh(
    new THREE.ShapeGeometry(octagon(A + 0.18, B + 0.18, C + 0.07)).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(1.4), transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  const scanEdge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(octagon(A + 0.18, B + 0.18, C + 0.07).getPoints().map((p) => new THREE.Vector3(p.x, 0, -p.y))),
    new THREE.LineBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(4), toneMapped: false }),
  );
  scene.add(scanRing, scanEdge);

  const air = airflow(420, 31);
  scene.add(air);

  // Faint floor grid far below for depth.
  const grid = new THREE.GridHelper(40, 80, '#2a2d33', '#16181c');
  grid.position.y = -2.6;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(34, env.W / env.H, 0.05, 200);
  const target = new THREE.Vector3();

  return {
    scene,
    camera,
    update(t, d) {
      const k = ease.inOutCubic(invLerp(0, d, t));
      const az = lerp(-0.95, 0.35, k);
      const rad = lerp(2.5, 4.3, k);
      const h = lerp(0.15, 2.7, ease.inOutQuad(k));
      camera.position.set(Math.sin(az) * rad, h, Math.cos(az) * rad);
      target.set(0, lerp(0.15, -0.2, k), 0);
      camera.lookAt(target);

      const scanY = lerp(-0.3, 0.45, ease.inOutCubic(invLerp(0.0, 1.3, t)));
      below.constant = scanY;
      above.constant = -scanY;
      const scanVis = 1 - smoothstep(1.2, 1.5, t);
      scanRing.position.y = scanEdge.position.y = scanY;
      scanRing.material.opacity = 0.07 * scanVis;
      scanEdge.material.opacity = scanVis;
      scanEdge.material.transparent = true;
      wireMat.opacity = 1 - smoothstep(1.0, 1.6, t);

      rotor.rotation.y = t * 5.5; // slow-motion spin
      air.userData.update(t);
      air.material.opacity = smoothstep(0.6, 1.3, t);
    },
    ui(g, t) {
      featureCaption(g, { kicker: 'COOLFLY URBAN', title: 'Enclosed Ducted Fans', sub: 'Every rotor, fully enclosed.' }, t, {
        inAt: 0.9, outAt: 3.2,
      });
    },
    fx: () => ({ toneMapped: true, exposure: 1.0, bloom: 0.55, bloomRadius: 0.35, bloomThreshold: 0.92, vignette: 0.65 }),
  };
}
