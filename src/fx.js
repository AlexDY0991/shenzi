import * as THREE from 'three';

// Final grade, applied after tone mapping (sRGB space): whip-pan motion blur,
// chromatic aberration, vignette, film grain, white flash and fade.
export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uBlurDir: { value: new THREE.Vector2(1, 0) },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.03 },
    uCA: { value: 0.0015 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes, uBlurDir;
    uniform float uTime, uBlur, uVignette, uGrain, uCA, uFlash, uFade;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 sampleCA(vec2 uv) {
      vec2 d = (uv - 0.5) * uCA;
      return vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
    }

    void main() {
      vec2 uv = vUv;
      vec3 col;
      if (uBlur > 0.0005) {
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 32; i++) {
          float f = float(i) / 31.0 - 0.5;
          float w = 1.0 - abs(f) * 1.4;
          acc += sampleCA(uv + uBlurDir * uBlur * f) * w;
          wsum += w;
        }
        col = acc / wsum;
      } else {
        col = sampleCA(uv);
      }
      vec2 q = (uv - 0.5) * vec2(1.0, 0.75);
      float vig = smoothstep(0.75, 0.15, length(q));
      col *= mix(1.0, vig, uVignette);
      float n = hash(floor(uv * uRes) + fract(uTime * 7.31) * 113.0) - 0.5;
      col += n * uGrain;
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
