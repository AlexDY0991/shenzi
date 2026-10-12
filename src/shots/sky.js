// Air-to-air shots above a procedural sea of clouds. The aircraft cut-outs
// ride on a rig that flies with the camera; clouds and wisps are world-fixed,
// so the parallax between them is what sells the speed.
import * as THREE from 'three';
import { ease, invLerp, lerp, shake, noise1 } from '../util.js';
import { revealLine, statBlock } from '../text.js';
import { imagePlane, sky, wisps } from '../kit.js';
import { ORANGE } from '../timeline.js';

function flightShot(env, { skyOpts, speed = 30, craft, wispOpts, cam, ui, fx }) {
  const scene = new THREE.Scene();
  const skyMesh = sky(skyOpts);
  scene.add(skyMesh);
  const camera = new THREE.PerspectiveCamera(38, env.W / env.H, 0.1, 3000);
  const w = wisps({ count: 70, length: 900, width: 90, y: [-14, 10], size: [12, 30], seed: 17, ...wispOpts });
  scene.add(w);

  const rig = new THREE.Group();
  scene.add(rig);
  const planes = craft.map((c) => {
    const p = imagePlane(env.assets.textures[c.tex], c.height, { transparent: true });
    p.material.color.set(c.tint || '#ffffff');
    p.renderOrder = 10 + (c.order || 0);
    rig.add(p);
    return { p, c };
  });

  return {
    scene,
    camera,
    update(t, d, gt) {
      const z = -speed * t;
      const v = cam(t, d); // { pos:[x,y,z] relative to rig, look:[x,y,z], roll }
      rig.position.set(0, 0, z);
      camera.position.set(v.pos[0], v.pos[1], z + v.pos[2]);
      camera.lookAt(v.look[0], v.look[1], z + v.look[2]);
      camera.rotateZ(v.roll || 0);
      camera.updateMatrixWorld();
      for (const { p, c } of planes) {
        const [bx, by] = [noise1(t * 0.7, c.seed || 1) * 0.12, noise1(t * 0.6, (c.seed || 1) + 5) * 0.18];
        const pos = typeof c.pos === 'function' ? c.pos(t, d) : c.pos;
        p.position.set(pos[0] + bx, pos[1] + by, pos[2]);
        p.quaternion.copy(camera.quaternion);
        p.rotateZ((c.bank || 0) + noise1(t * 0.5, (c.seed || 1) + 9) * 0.03);
      }
      skyMesh.material.uniforms.uWind.value.set(gt * 0.004, 0);
      skyMesh.userData.update(camera, gt);
    },
    ui,
    fx: fx || (() => ({ bloom: 0.25, bloomThreshold: 0.95, vignette: 0.45 })),
  };
}

const GOLDEN = {
  top: '#2a5899', horizon: '#d8c6ae', sun: '#ffd49a', sunDir: [0.55, 0.07, -1],
  cloudLit: '#ece6dc', cloudShadow: '#5d6c8a', below: '#2a3a56', cloudY: -28, cloudScale: 0.016, coverage: 0.5, fog: 0.00045,
};

export function urbanFlight(env) {
  return flightShot(env, {
    skyOpts: GOLDEN,
    speed: 34,
    wispOpts: { count: 45, y: [-14, -4], opacity: 0.4 },
    craft: [{ tex: 'urbanPilot', height: 4.2, pos: [0, -1.0, 0], bank: -0.05, tint: '#f6f1ea', seed: 3 }],
    cam: (t, d) => {
      const k = ease.inOutQuad(invLerp(0, d, t));
      const [sx, sy] = shake(t, 0.06, 1.6, 4);
      return { pos: [lerp(4.5, -2.2, k) + sx, lerp(1.0, 2.2, k) + sy, lerp(10.5, 8.5, k)], look: [lerp(0.6, -0.3, k), 0.6, 0], roll: lerp(0.06, -0.04, k) };
    },
  });
}

export function statSpeed(env) {
  return flightShot(env, {
    skyOpts: { ...GOLDEN, top: '#245aa6', horizon: '#cfdbe8', sun: '#fff3dc', sunDir: [-0.5, 0.25, -1], cloudLit: '#f4f6f8', cloudShadow: '#71819f', below: '#3d4f70' },
    speed: 85,
    wispOpts: { count: 110, size: [8, 22], opacity: 0.85 },
    craft: [{ tex: 'dreamCutout', height: 3.1, pos: [-2.7, -0.2, 0], bank: 0.07, seed: 8 }],
    cam: (t) => {
      const [sx, sy] = shake(t, 0.08, 3.0, 6);
      return { pos: [0.6 + sx, 1.0 + sy, 11 - t * 0.6], look: [0.6, -0.6, 0], roll: 0.02 };
    },
    ui(g, t) {
      statBlock(g, { value: 100, unit: 'km/h', label: 'Top Speed', kicker: 'COOLFLY DREAM PRO' }, t, { x: 1120, y: 600, inAt: 0.12, outAt: 1.75 });
    },
    fx: () => ({ bloom: 0.25, bloomThreshold: 0.95, vignette: 0.45 }),
  });
}

export function skyRoad(env) {
  return flightShot(env, {
    skyOpts: {
      top: '#1d3263', horizon: '#eea47a', sun: '#ffc98a', sunDir: [0.5, 0.05, -1],
      cloudLit: '#f5c7a3', cloudShadow: '#55597e', below: '#2b3155', cloudY: -60, cloudScale: 0.009, coverage: 0.55, fog: 0.0009, sunStrength: 0.9,
    },
    speed: 30,
    wispOpts: { color: '#ffd8c0', opacity: 0.7 },
    craft: [
      { tex: 'urbanPilot', height: 3.6, pos: (t) => [-3.1, -0.5, 1.2], bank: -0.04, tint: '#ffe6d2', seed: 11, order: 1 },
      { tex: 'dreamCutout', height: 2.4, pos: (t) => [3.6, 0.6, -6], bank: 0.05, tint: '#ffe6d2', seed: 14 },
    ],
    cam: (t, d) => {
      const k = ease.outCubic(invLerp(0, d, t));
      return { pos: [lerp(0.3, 0.6, k), lerp(1.4, 3.6, k), lerp(9, 17, k)], look: [0.3, lerp(-0.2, 0.6, k), -4], roll: 0 };
    },
    ui(g, t) {
      revealLine(g, [{ text: 'The sky is your ' }, { text: 'road.', color: ORANGE }], t, {
        y: 260, size: 74, weight: 700, inAt: 0.3, stagger: 0.03, outAt: 2.2, outDur: 0.25,
      });
    },
    fx: () => ({ bloom: 0.3, bloomThreshold: 0.93, vignette: 0.5 }),
  });
}
