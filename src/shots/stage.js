// Studio shots: Dream Pro spec beats on a dark stage, and the white end card
// (the reference film closes on its product in a clean, bright studio).
import * as THREE from 'three';
import { ease, invLerp, lerp, noise1, smoothstep } from '../util.js';
import { statBlock, drawLogo, revealLine, FONTS } from '../text.js';
import { imagePlane, reflectionOf, darkStage, dust, radialTexture } from '../kit.js';
import { ORANGE } from '../timeline.js';

function hoverStage(env, { barColor, barIntensity, height = 3.2, hover = 1.7, x = -2.4, cam, stat, seed = 3 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020203');
  scene.fog = new THREE.Fog('#020203', 14, 34);
  scene.add(darkStage({ barColor, barIntensity, seed, spread: 18 }));

  const craft = imagePlane(env.assets.textures.dreamCutout, height, { transparent: true });
  craft.renderOrder = 5;
  const refl = reflectionOf(craft, { strength: 0.22, falloff: 0.45 });
  scene.add(refl, craft);

  // Soft downwash glow on the floor beneath the hovering aircraft.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3.5),
    new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(barColor).multiplyScalar(0.18), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, 0.02, 0);
  scene.add(pool);

  const motes = dust({ count: 300, box: [14, 5, 8], center: [0, 2.5, -1], size: 0.035, seed: seed + 40, opacity: 0.5 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(30, env.W / env.H, 0.1, 200);
  return {
    scene,
    camera,
    update(t, d) {
      const y = hover + noise1(t * 0.8, seed) * 0.06;
      craft.position.set(x, y, 0);
      refl.position.set(x, -y, 0);
      cam(camera, t, d);
      craft.quaternion.copy(camera.quaternion); // keep the photo square to the lens
      refl.quaternion.copy(camera.quaternion);
      motes.userData.update(t);
    },
    ui: (g, t) => statBlock(g, stat, t, { x: 1120, y: 600, inAt: 0.12, outAt: 1.75 }),
    fx: () => ({ toneMapped: true, exposure: 1.05, bloom: 0.55, bloomRadius: 0.35, bloomThreshold: 0.88, vignette: 0.6 }),
  };
}

export function statFlightTime(env) {
  return hoverStage(env, {
    barColor: '#ffffff', barIntensity: 3, seed: 3, x: -2.7,
    stat: { value: 40, unit: 'min', label: 'Flight Time', kicker: 'COOLFLY DREAM PRO' },
    cam: (c, t, d) => {
      const k = ease.inOutQuad(invLerp(0, d, t));
      c.position.set(lerp(1.4, -0.2, k), 2.3, lerp(12.5, 11.5, k));
      c.lookAt(lerp(0.4, -0.4, k), 1.75, 0);
    },
  });
}

export function statPayload(env) {
  return hoverStage(env, {
    barColor: ORANGE, barIntensity: 4, seed: 8, hover: 1.5, height: 3.2, x: -3.0,
    stat: { value: 120, unit: 'kg', label: 'Max Payload', kicker: 'COOLFLY DREAM PRO' },
    cam: (c, t, d) => {
      const k = ease.outCubic(invLerp(0, d, t));
      // Low angle, slight downward settle: weight.
      c.position.set(lerp(-0.4, 0.4, k), lerp(0.9, 0.7, k), lerp(10.5, 9.6, k));
      c.lookAt(0.2, lerp(1.9, 1.7, k), 0);
    },
  });
}

// ------------------------------------------------------------------ end card

function backdropMaterial() {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv;
      void main(){
        vec3 top = vec3(0.93), mid = vec3(0.985), low = vec3(0.86);
        float horizon = 0.36;
        vec3 c = vUv.y > horizon ? mix(mid, top, smoothstep(horizon, 1.0, vUv.y)) : mix(low, mid, smoothstep(0.0, horizon, vUv.y));
        float spot = smoothstep(0.9, 0.0, distance(vUv * vec2(1.6, 1.0), vec2(0.55, 0.5)));
        c += spot * 0.04;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function endCard(env) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, env.W / env.H, 0.1, 200);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), backdropMaterial());
  back.position.z = -12;
  scene.add(back);

  const urban = imagePlane(env.assets.textures.urbanCutout, 3.6, { transparent: true });
  urban.renderOrder = 5;
  scene.add(urban);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.1),
    new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#000000', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
  );
  shadow.renderOrder = 4;
  scene.add(shadow);

  return {
    scene,
    camera,
    update(t, d) {
      const k = ease.outCubic(invLerp(0, d, t));
      camera.position.set(lerp(0.5, 0, k), 0.25, lerp(13.5, 12.4, k));
      camera.lookAt(0, 0, 0);
      const rise = ease.outCubic(invLerp(0, 1.4, t));
      urban.position.set(-3.6, lerp(-0.7, -0.15, rise), 0);
      shadow.position.set(-3.6, -1.85, 0.2);
      shadow.material.opacity = 0.32 * smoothstep(0.2, 1.2, t) * (1 - 0.2 * (1 - rise));
    },
    ui(g, t) {
      drawLogo(g, env.assets.logo, t, { x: 1270, y: 470, width: 760, inAt: 0.35, color: '#0b0b0b' });
      revealLine(g, [{ text: 'Fly by Instinct', color: '#1a1a1a' }], t, {
        x: 1270, y: 650, size: 44, weight: 500, inAt: 1.1, stagger: 0.035, rise: 14, blur: 6, shadowAlpha: 0,
      });
      const k = ease.outCubic(invLerp(1.7, 2.3, t));
      if (k > 0) {
        g.save();
        g.globalAlpha = k;
        g.fillStyle = ORANGE;
        g.fillRect(1270 - 36 * k, 700, 72 * k, 3);
        g.font = `500 26px ${FONTS.TECH}`;
        g.fillStyle = '#555';
        g.textAlign = 'center';
        if ('letterSpacing' in g) g.letterSpacing = '4px';
        g.fillText('COOLFLYAIRCRAFT.COM', 1270, 760);
        g.restore();
      }
    },
    fx: () => ({ bloom: 0.0, vignette: 0.18, grain: 0.02, ca: 0.0008 }),
  };
}
