// Reusable 3D building blocks shared by the shots.
import * as THREE from 'three';
import { rng } from './util.js';

// ------------------------------------------------------------------ photos

/** Visible frustum height at distance d for a perspective camera. */
export const frustumHeight = (camera, d) => 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

/** Flat textured plane, `height` world units tall, aspect taken from the image. */
export function imagePlane(tex, height, { transparent = false, opacity = 1 } = {}) {
  const aspect = tex.image.width / tex.image.height;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent, opacity, depthWrite: !transparent, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat);
  mesh.userData.aspect = aspect;
  return mesh;
}

/**
 * Mirror image of a cut-out standing on a glossy floor: the cut-out is
 * flipped and faded so it reads as a reflection on polished concrete.
 */
export function reflectionOf(cutout, { strength = 0.28, falloff = 0.35 } = {}) {
  const tex = cutout.material.map;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false, // it sits below the floor plane, so draw it over the floor
    uniforms: { map: { value: tex }, uStrength: { value: strength }, uFalloff: { value: falloff } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uStrength, uFalloff; varying vec2 vUv;
      void main(){
        // Placed directly under the cut-out: its top edge mirrors the product's base.
        vec4 c = texture2D(map, vec2(vUv.x, 1.0 - vUv.y));
        float k = smoothstep(1.0 - uFalloff, 1.0, vUv.y);
        gl_FragColor = vec4(c.rgb, c.a * uStrength * k);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(cutout.geometry, mat);
  mesh.renderOrder = cutout.renderOrder - 1;
  return mesh;
}

// ------------------------------------------------------------------ studio

/** Dark polished floor + vertical light bars, like the official studio renders. */
export function darkStage({ barColor = '#ffffff', barIntensity = 6, bars = 6, floorColor = '#07080a', spread = 14, seed = 3 } = {}) {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.32, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(barColor).multiplyScalar(barIntensity), toneMapped: false });
  const glowTex = radialTexture();
  const r = rng(seed);
  for (let i = 0; i < bars; i++) {
    const x = (i / (bars - 1) - 0.5) * spread + (r() - 0.5) * 1.2;
    const z = -9 - r() * 6;
    const h = 5 + r() * 3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), barMat);
    bar.position.set(x, h / 2 + 0.6, z);
    group.add(bar);
    // Streak reflection on the floor.
    const refl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 7),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: new THREE.Color(barColor).multiplyScalar(0.55),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(x, 0.01, z + 3.2);
    group.add(refl);
  }
  // Soft top light so the floor has a falloff pool.
  const spot = new THREE.SpotLight('#ffffff', 60, 30, 0.6, 0.9, 1.6);
  spot.position.set(0, 12, 2);
  spot.target.position.set(0, 0, 0);
  group.add(spot, spot.target);
  group.add(new THREE.AmbientLight('#ffffff', 0.08));
  return group;
}

let _radial;
export function radialTexture() {
  if (_radial) return _radial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _radial = new THREE.CanvasTexture(c);
  return _radial;
}

// --------------------------------------------------------------- particles

/** Floating dust motes catching the light; positions are fixed by seed. */
export function dust({ count = 400, box = [12, 6, 10], center = [0, 3, 0], size = 0.05, seed = 7, color = '#ffffff', opacity = 0.7 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center[0] + (r() - 0.5) * box[0];
    pos[i * 3 + 1] = center[1] + (r() - 0.5) * box[1];
    pos[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
    phase[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: 1080 } },
    vertexShader: `
      attribute float phase; uniform float uTime, uSize, uScale; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.3 + phase) * 0.25;
        p.y += sin(uTime * 0.21 + phase * 1.7) * 0.2 + uTime * 0.05;
        p.z += cos(uTime * 0.25 + phase * 0.6) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z;
        vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.3 + phase * 3.0));
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * a * vA * uOpacity, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}

// --------------------------------------------------------------------- sky

/**
 * Full-screen procedural sky with a sun and a sea of clouds below the camera.
 * Rendered on a far-plane quad, so it is always behind everything else.
 */
export function sky(opts = {}) {
  const o = {
    top: '#3d6fae', horizon: '#c9d8e6', sun: '#fff1d6', sunDir: [0.4, 0.18, -1],
    cloudLit: '#ffffff', cloudShadow: '#8a9bb3', below: '#2c3e57',
    cloudY: -40, cloudScale: 0.012, coverage: 0.62, fog: 0.0016, sunStrength: 1,
    ...opts,
  };
  const C = (c) => new THREE.Color(c);
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: {
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(...o.sunDir).normalize() },
      uTop: { value: C(o.top) }, uHorizon: { value: C(o.horizon) }, uSun: { value: C(o.sun) },
      uCloudLit: { value: C(o.cloudLit) }, uCloudShadow: { value: C(o.cloudShadow) }, uBelow: { value: C(o.below) },
      uCloudY: { value: o.cloudY }, uCloudScale: { value: o.cloudScale }, uCoverage: { value: o.coverage },
      uFog: { value: o.fog }, uSunStrength: { value: o.sunStrength }, uWind: { value: new THREE.Vector2() },
    },
    vertexShader: `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform mat4 uInvProj, uCamWorld; uniform vec3 uCamPos, uSunDir, uTop, uHorizon, uSun, uCloudLit, uCloudShadow, uBelow;
      uniform float uTime, uCloudY, uCloudScale, uCoverage, uFog, uSunStrength; uniform vec2 uWind;
      varying vec2 vNdc;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 6; i++){ s += a * noise(p); p = m * p; a *= 0.5; } return s; }
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); v /= v.w;
        vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
        float sd = max(dot(dir, uSunDir), 0.0);
        vec3 skyCol = mix(uHorizon, uTop, pow(clamp(dir.y, 0.0, 1.0), 0.3));
        vec3 glow = uSun * (pow(sd, 10.0) * 0.22 + pow(sd, 90.0) * 0.55) * uSunStrength;
        vec3 disc = uSun * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunStrength;
        vec3 col = skyCol + glow + disc;
        if (dir.y < 0.02) {
          float dy = min(dir.y, -0.0005);
          float t = (uCloudY - uCamPos.y) / dy;
          vec2 p = (uCamPos.xz + dir.xz * t) * uCloudScale + uWind;
          float n = fbm(p);
          float cov = smoothstep(1.0 - uCoverage, 1.0 - uCoverage + 0.2, n);
          float n2 = fbm(p + uSunDir.xz * 0.35);
          float lit = clamp(0.5 + (n - n2) * 4.0, 0.0, 1.0);
          lit *= mix(0.75, 1.0, smoothstep(0.0, 0.35, n - (1.0 - uCoverage)));
          vec3 cloud = mix(uCloudShadow, uCloudLit, lit);
          cloud += uSun * pow(sd, 6.0) * 0.18 * uSunStrength;
          vec3 surf = mix(uBelow, cloud, cov);
          float fog = 1.0 - exp(-t * uFog);
          vec3 below = mix(surf, uHorizon * 0.92 + glow * 0.3, fog);
          col = mix(col, below, smoothstep(0.02, -0.004, dir.y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.update = (camera, t) => {
    camera.updateMatrixWorld();
    mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    mat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    mat.uniforms.uCamPos.value.copy(camera.position);
    mat.uniforms.uTime.value = t;
  };
  return mesh;
}

// ------------------------------------------------------------- cloud wisps

let _wisp;
/** Soft, irregular cloud puff texture (deterministic). */
export function wispTexture() {
  if (_wisp) return _wisp;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = rng(11);
  for (let i = 0; i < 70; i++) {
    const x = 128 + (r() - 0.5) * 150;
    const y = 128 + (r() - 0.5) * 70;
    const rad = 20 + r() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.16)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  _wisp = new THREE.CanvasTexture(c);
  _wisp.colorSpace = THREE.SRGBColorSpace;
  return _wisp;
}

/**
 * Cloud puffs scattered along a corridor in front of the camera. As the
 * camera flies through them they streak past and sell the speed.
 */
export function wisps({ count = 40, length = 400, width = 60, y = [-8, 8], size = [10, 26], seed = 5, color = '#ffffff', opacity = 0.9 } = {}) {
  const group = new THREE.Group();
  const r = rng(seed);
  const tex = wispTexture();
  for (let i = 0; i < count; i++) {
    const s = size[0] + r() * (size[1] - size[0]);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s * 2, s),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: opacity * (0.5 + r() * 0.5), depthWrite: false, toneMapped: false }),
    );
    let x = (r() - 0.5) * width;
    if (Math.abs(x) < 6) x += Math.sign(x || 1) * 6; // keep the product clear
    m.position.set(x, y[0] + r() * (y[1] - y[0]), -r() * length);
    m.rotation.z = (r() - 0.5) * 0.3;
    group.add(m);
  }
  return group;
}
