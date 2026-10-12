// Shots built from the official stills: a camera push into the photo with
// 3D foreground layers (cloud wisps, dust, light sweep) for real parallax.
import * as THREE from 'three';
import { ease, invLerp, lerp, speedRamp, shake } from '../util.js';
import { revealLine, featureCaption } from '../text.js';
import { imagePlane, frustumHeight, dust, wisps } from '../kit.js';
import { ORANGE } from '../timeline.js';

const DIST = 10;

function lightSweep() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPos: { value: -1 }, uStrength: { value: 0.12 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform float uPos, uStrength; varying vec2 vUv;
      void main(){
        float x = vUv.x + (vUv.y - 0.5) * 0.45;
        float band = exp(-pow((x - uPos) * 9.0, 2.0)) + 0.35 * exp(-pow((x - uPos + 0.07) * 30.0, 2.0));
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * band * uStrength, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}

/**
 * zoom: [from, to] scale of the photo; focus: point (uv) the push drifts toward.
 * move: easing of the push. extras(scene, camera) may add parallax layers and
 * return an update(t, d) function.
 */
function photoShot(env, texKey, { zoom = [1.0, 1.1], rot = [0, 0], focus = [0.5, 0.5], move = ease.inOutQuad, sweep = null, extras, ui, fx }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, env.W / env.H, 0.1, 1000);
  const tex = env.assets.textures[texKey];
  const fh = frustumHeight(camera, DIST);
  const fw = fh * camera.aspect;
  // Cover the frame regardless of the photo's aspect ratio.
  const imgAspect = tex.image.width / tex.image.height;
  const baseH = imgAspect > camera.aspect ? fh : fw / imgAspect;
  const plane = imagePlane(tex, baseH);
  plane.position.z = -DIST;
  scene.add(plane);
  const pw = baseH * imgAspect;

  let sw = null;
  if (sweep) {
    sw = lightSweep();
    sw.scale.set(fw * 1.1, fh * 1.1, 1);
    sw.position.z = -DIST + 0.5;
    sw.material.uniforms.uStrength.value = sweep.strength ?? 0.12;
    scene.add(sw);
  }
  const extraUpdate = extras ? extras(scene, camera) : null;

  return {
    scene,
    camera,
    update(t, d) {
      const k = move(invLerp(0, d, t));
      const z = lerp(zoom[0], zoom[1], k);
      plane.scale.setScalar(z);
      plane.rotation.z = lerp(rot[0], rot[1], k);
      // Drift toward the focus point while never revealing the photo's edge.
      const maxX = Math.max(0, (pw * z - fw) / 2);
      const maxY = Math.max(0, (baseH * z - fh) / 2);
      plane.position.x = THREE.MathUtils.clamp(-(focus[0] - 0.5) * pw * z, -maxX, maxX);
      plane.position.y = THREE.MathUtils.clamp(-(focus[1] - 0.5) * baseH * z, -maxY, maxY);
      if (sw) sw.material.uniforms.uPos.value = lerp(sweep.from ?? -0.3, sweep.to ?? 1.3, invLerp(sweep.at ?? 0, (sweep.at ?? 0) + (sweep.dur ?? d), t));
      extraUpdate?.(t, d);
    },
    ui,
    fx,
  };
}

export function urbanReveal(env) {
  return photoShot(env, 'urbanGoldenGate', {
    zoom: [1.02, 1.42], rot: [-0.05, 0], focus: [0.36, 0.42],
    move: (k) => speedRamp(k, 5),
    extras(scene, camera) {
      // Cloud wisps rushing past the lens sell the speed of the push.
      // They live between the lens and the photo and loop through that gap,
      // fading in at the back and out before they reach the camera.
      const w = wisps({ count: 22, length: 1, width: 16, y: [-5, 5], size: [2.5, 6], seed: 9, opacity: 1 });
      scene.add(w);
      const base = w.children.map((m, i) => ({ m, z0: (i / w.children.length) * 9.5, op: m.material.opacity }));
      return (t) => {
        const travel = speedRamp(t / 2.5, 4) * 26 + t * 2;
        for (const b of base) {
          const f = ((b.z0 + travel) % 9.5) / 9.5; // 0 = at the photo, 1 = at the lens
          b.m.position.z = -9.6 + f * 9.2;
          b.m.material.opacity = b.op * 0.5 * Math.sin(Math.PI * f) * (1 - f);
        }
        const [sx, sy] = shake(t, 0.05, 2.0, 9);
        camera.position.set(sx, sy, 0);
      };
    },
    ui(g, t) {
      revealLine(g, [{ text: 'Meet CoolFly ' }, { text: 'Urban', color: ORANGE }], t, {
        y: 975, size: 74, weight: 700, inAt: 0.35, stagger: 0.03, outAt: 2.25, outDur: 0.25,
      });
    },
    fx: () => ({ vignette: 0.5, bloom: 0.15, bloomThreshold: 0.95 }),
  });
}

export function urbanStudio(env) {
  return photoShot(env, 'urbanStudio', {
    zoom: [1.0, 1.09], focus: [0.5, 0.5], move: ease.outQuad,
    sweep: { at: 0.4, dur: 2.2, from: -0.2, to: 1.2, strength: 0.1 },
    extras(scene, camera) {
      const motes = dust({ count: 260, box: [9, 5, 6], center: [0, 0, -5], size: 0.04, seed: 4, opacity: 0.55 });
      scene.add(motes);
      return (t) => {
        motes.userData.update(t);
        camera.position.x = lerp(-0.35, 0.35, ease.inOutQuad(t / 3));
      };
    },
    ui(g, t) {
      featureCaption(g, { kicker: "WORLD'S FIRST", title: ['Standing-Position', 'Manned Aircraft'], sub: 'CoolFly Urban' }, t, {
        x: 120, y: 260, inAt: 0.35, outAt: 2.7, titleSize: 58, // top-left: the pods fill the lower frame
      });
    },
    fx: () => ({ bloom: 0.25, bloomThreshold: 0.96, bloomRadius: 0.4, vignette: 0.5 }),
  });
}

export function dreamReveal(env) {
  return photoShot(env, 'dreamStudio', {
    zoom: [1.3, 1.04], rot: [0.03, 0], focus: [0.6, 0.5],
    move: (k) => speedRamp(k, 4.5),
    sweep: { at: 0.7, dur: 1.5, from: -0.1, to: 1.2, strength: 0.14 },
    extras(scene, camera) {
      const motes = dust({ count: 200, box: [9, 5, 6], center: [0, 0, -5], size: 0.035, seed: 12, opacity: 0.45 });
      scene.add(motes);
      return (t) => {
        motes.userData.update(t);
        camera.position.x = lerp(0.3, -0.2, ease.outCubic(t / 2.5));
      };
    },
    ui(g, t) {
      revealLine(g, [{ text: 'GO FURTHER' }], t, {
        y: 870, size: 24, weight: 600, font: '"Chakra Petch", Inter, sans-serif', tracking: 7,
        inAt: 0.3, stagger: 0.02, outAt: 2.25, outDur: 0.2,
      });
      revealLine(g, [{ text: 'CoolFly Dream ' }, { text: 'Pro', color: ORANGE }], t, {
        y: 960, size: 80, weight: 700, inAt: 0.4, stagger: 0.03, outAt: 2.25, outDur: 0.2,
      });
    },
    fx: () => ({ bloom: 0.2, bloomThreshold: 0.96, vignette: 0.45 }),
  });
}
