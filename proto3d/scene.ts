import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LevelData, Piece } from '../src/core/board';
import { YARN_COLORS } from '../src/render/colors';
import { FABRICS } from '../src/render/board';
import { PIN_R, PIN_TOP, R } from './physics';

// ───────────── 代码生成的纹理 ─────────────

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 毛毡：浅色底 + 细密纤维 */
export function feltTexture(): THREE.CanvasTexture {
  const t = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = Math.random() * Math.PI;
      const l = 2 + Math.random() * 5;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 毛线：三股拧在一起的绳纹（灰度，乘上毛线颜色）。
 * 纹理的横向沿毛线长度，纵向绕一圈；每股沿对角线前进，贴到管子上就是螺旋。
 */
export function yarnTexture(): THREE.CanvasTexture {
  const t = canvasTex(128, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // 三股：沿 (x + 3y) 方向的周期
        const ph = (x / s + (3 * y) / s) % 1;
        const ridge = Math.pow(Math.sin(ph * Math.PI), 0.55); // 股的中间亮、股缝暗
        const fiber = 0.92 + 0.08 * Math.sin((x * 0.9 + y * 2.7) * 1.7) * Math.sin(y * 0.6);
        const v = Math.round(255 * (0.55 + 0.45 * ridge) * fiber);
        const k = (y * s + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 绒毛
    for (let i = 0; i < 400; i++) {
      ctx.strokeStyle = Math.random() < 0.6 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.7;
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 7, y + (Math.random() - 0.5) * 7);
      ctx.stroke();
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────── 布片 ─────────────

function pieceShape(p: Piece): THREE.Shape {
  const s = new THREE.Shape();
  if (p.kind === 'arc') {
    const hw = p.w / 2;
    s.absarc(p.x, p.y, p.r + hw, p.a0, p.a1, false);
    s.absarc(p.x + Math.cos(p.a1) * p.r, p.y + Math.sin(p.a1) * p.r, hw, p.a1, p.a1 + Math.PI, false);
    s.absarc(p.x, p.y, p.r - hw, p.a1, p.a0, true);
    s.absarc(p.x + Math.cos(p.a0) * p.r, p.y + Math.sin(p.a0) * p.r, hw, p.a0 + Math.PI, p.a0 + Math.PI * 2, false);
  } else if (p.kind === 'bar') {
    const hw = p.w / 2;
    const t = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    s.absarc(p.x2, p.y2, hw, t - Math.PI / 2, t + Math.PI / 2, false);
    s.absarc(p.x1, p.y1, hw, t + Math.PI / 2, t + Math.PI * 1.5, false);
  } else {
    // 样张里只需要圆和豆子形，其余造型先用椭圆代替
    const rx = p.s * (p.shape === 'bean' ? 1.15 : 1);
    const ry = p.s * (p.shape === 'bean' ? 0.92 : 1);
    s.absellipse(p.x, p.y, rx, ry, 0, Math.PI * 2, false, p.rot ?? 0);
  }
  return s;
}

/** 布片外缘向内一点的路径，用来摆 3D 针脚 */
function stitchPath(p: Piece, inset: number): THREE.Vector2[] {
  if (p.kind === 'arc') {
    const hw = p.w / 2 - inset;
    const pts: THREE.Vector2[] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = p.a0 + ((p.a1 - p.a0) * i) / n;
      pts.push(new THREE.Vector2(p.x + Math.cos(a) * (p.r + hw), p.y + Math.sin(a) * (p.r + hw)));
    }
    const e1 = new THREE.Vector2(p.x + Math.cos(p.a1) * p.r, p.y + Math.sin(p.a1) * p.r);
    for (let i = 1; i < 12; i++) {
      const a = p.a1 + (Math.PI * i) / 12;
      pts.push(new THREE.Vector2(e1.x + Math.cos(a) * hw, e1.y + Math.sin(a) * hw));
    }
    for (let i = 0; i <= n; i++) {
      const a = p.a1 - ((p.a1 - p.a0) * i) / n;
      pts.push(new THREE.Vector2(p.x + Math.cos(a) * (p.r - hw), p.y + Math.sin(a) * (p.r - hw)));
    }
    const e0 = new THREE.Vector2(p.x + Math.cos(p.a0) * p.r, p.y + Math.sin(p.a0) * p.r);
    for (let i = 1; i <= 12; i++) {
      const a = p.a0 + Math.PI + (Math.PI * i) / 12;
      pts.push(new THREE.Vector2(e0.x + Math.cos(a) * hw, e0.y + Math.sin(a) * hw));
    }
    return pts;
  }
  const shape = pieceShape(p);
  const pts = shape.getSpacedPoints(120);
  // 简单地朝中心收缩
  const c = pts.reduce((acc, v) => acc.add(v), new THREE.Vector2()).divideScalar(pts.length);
  return pts.map((v) => {
    const d = v.clone().sub(c);
    const l = d.length();
    return c.clone().add(d.multiplyScalar(Math.max(0, l - inset) / l));
  });
}

const THICK = 0.22;

export function buildBoard(lv: LevelData, felt: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  lv.pieces.forEach((p, idx) => {
    const geo = new THREE.ExtrudeGeometry(pieceShape(p), {
      depth: THICK,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 5,
      curveSegments: 48,
    });
    // 形状在 XY 平面，转到 XZ 平面，顶面朝上（y = 0）
    geo.rotateX(Math.PI / 2);
    // 每块布片略微错开高度，避免重叠处闪烁
    geo.translate(0, -0.07 + idx * 0.012, 0);
    const tex = felt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.9, 0.9);
    // 3D 里光照会冲淡颜色，布料色稍微加深加饱和
    const base = new THREE.Color(FABRICS[(p.tint ?? idx) % FABRICS.length]).offsetHSL(0, 0.25, -0.08);
    const mat = new THREE.MeshPhysicalMaterial({
      color: base,
      map: tex,
      roughness: 0.92,
      sheen: 1,
      sheenColor: new THREE.Color('#ffffff'),
      sheenRoughness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // 3D 针脚：沿外缘一针一针的短线
    const path = stitchPath(p, 0.11);
    const stitchMat = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.62), roughness: 0.8 });
    const stitchGeo = new THREE.CapsuleGeometry(0.013, 0.06, 2, 6);
    stitchGeo.rotateZ(Math.PI / 2);
    let acc = 0;
    const dummy = new THREE.Object3D();
    const placements: THREE.Matrix4[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const l = a.distanceTo(b);
      acc += l;
      if (acc < 0.13) continue;
      acc = 0;
      dummy.position.set((a.x + b.x) / 2, 0.012 + idx * 0.012, (a.y + b.y) / 2);
      dummy.rotation.set(0, -Math.atan2(b.y - a.y, b.x - a.x), 0);
      dummy.updateMatrix();
      placements.push(dummy.matrix.clone());
    }
    const stitches = new THREE.InstancedMesh(stitchGeo, stitchMat, placements.length);
    placements.forEach((m, i) => stitches.setMatrixAt(i, m));
    group.add(stitches);
  });

  // 孔：金属气眼 + 深色孔洞
  const ringGeo = new THREE.TorusGeometry(0.2, 0.05, 14, 40);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#e2b86e', metalness: 0.9, roughness: 0.28 });
  const holeGeo = new THREE.CircleGeometry(0.17, 32);
  holeGeo.rotateX(-Math.PI / 2);
  const holeMat = new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 1 });
  for (const [x, z] of lv.holes) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, 0.05, z);
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(x, 0.045, z);
    group.add(hole);
  }
  return group;
}

// ───────────── 纽扣 ─────────────

const buttonGeo = (() => {
  const prof = [
    [0, 0.115],
    [0.12, 0.115],
    [0.16, 0.13],
    [0.2, 0.165],
    [0.235, PIN_TOP],
    [PIN_R, 0.14],
    [PIN_R, 0.035],
    [0.225, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 48);
  g.computeVertexNormals();
  return g;
})();
const holeDotGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12);
const threadGeo = new THREE.BoxGeometry(0.19, 0.022, 0.03);
const threadMat = new THREE.MeshStandardMaterial({ color: '#fff3dd', roughness: 0.7 });

export function buildButton(color: number): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(YARN_COLORS[color % YARN_COLORS.length]);
  const body = new THREE.Mesh(
    buttonGeo,
    new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const dotMat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), roughness: 0.6 });
  for (const [dx, dz] of [
    [-0.06, -0.06],
    [0.06, -0.06],
    [-0.06, 0.06],
    [0.06, 0.06],
  ]) {
    const d = new THREE.Mesh(holeDotGeo, dotMat);
    d.position.set(dx, 0.11, dz);
    g.add(d);
  }
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const t = new THREE.Mesh(threadGeo, threadMat);
    t.position.y = 0.122;
    t.rotation.y = rot;
    t.castShadow = true;
    g.add(t);
  }
  return g;
}

// ───────────── 毛线网格（每帧按物理质点重建） ─────────────

const RADIAL = 10;
const SAMPLES = 96;

export class YarnMesh {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private nor: Float32Array;
  private uv: Float32Array;

  constructor(color: number, tex: THREE.Texture) {
    const vcount = (SAMPLES + 1) * (RADIAL + 1);
    this.pos = new Float32Array(vcount * 3);
    this.nor = new Float32Array(vcount * 3);
    this.uv = new Float32Array(vcount * 2);
    const idx: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        const b = (i + 1) * (RADIAL + 1) + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setIndex(idx);
    const c = new THREE.Color(YARN_COLORS[color % YARN_COLORS.length]);
    const map = tex.clone();
    map.needsUpdate = true;
    const mat = new THREE.MeshPhysicalMaterial({
      color: c,
      map,
      bumpMap: map,
      bumpScale: 3,
      roughness: 0.72,
      sheen: 1,
      sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.6),
      sheenRoughness: 0.45,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  get material(): THREE.MeshPhysicalMaterial {
    return this.mesh.material as THREE.MeshPhysicalMaterial;
  }

  /** 按质点更新管状网格；radiusScale 用于被拉长时变细 */
  update(xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, n: number, radiusScale = 1): void {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(xs[i], ys[i], zs[i]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const frames = curve.computeFrenetFrames(SAMPLES, false);
    const r = R * radiusScale;
    const len = curve.getLength();
    const p = new THREE.Vector3();
    for (let i = 0; i <= SAMPLES; i++) {
      curve.getPointAt(i / SAMPLES, p);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j <= RADIAL; j++) {
        const v = (j / RADIAL) * Math.PI * 2;
        const cx = Math.cos(v);
        const cy = Math.sin(v);
        const nx = cx * N.x + cy * B.x;
        const ny = cx * N.y + cy * B.y;
        const nz = cx * N.z + cy * B.z;
        const k = (i * (RADIAL + 1) + j) * 3;
        this.pos[k] = p.x + nx * r;
        this.pos[k + 1] = p.y + ny * r;
        this.pos[k + 2] = p.z + nz * r;
        this.nor[k] = nx;
        this.nor[k + 1] = ny;
        this.nor[k + 2] = nz;
        const u = (i * (RADIAL + 1) + j) * 2;
        // 一个纹理周期 = 毛线前进约 2.2 倍直径，股纹呈 3 股螺旋
        this.uv[u] = ((i / SAMPLES) * len) / (R * 4.4);
        this.uv[u + 1] = j / RADIAL;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

/** 毛线球（消除时卷成的球） */
export function buildYarnBall(color: number, tex: THREE.Texture): THREE.Mesh {
  const c = new THREE.Color(YARN_COLORS[color % YARN_COLORS.length]);
  const map = tex.clone();
  map.needsUpdate = true;
  map.repeat.set(4, 2);
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 32, 20),
    new THREE.MeshPhysicalMaterial({ color: c, map, bumpMap: map, bumpScale: 3, roughness: 0.8, sheen: 1, sheenColor: c.clone().lerp(new THREE.Color('#fff'), 0.6) }),
  );
  m.castShadow = true;
  return m;
}

export function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, cx: number, cz: number, span: number): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight('#fff6ee', '#f2c8c0', 1.1));
  const sun = new THREE.DirectionalLight('#fff3e2', 1.5);
  sun.position.set(cx - span * 0.6, span * 2.2, cz - span * 0.9);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  const sc = sun.shadow.camera;
  sc.left = -span;
  sc.right = span;
  sc.top = span;
  sc.bottom = -span;
  sc.near = 0.1;
  sc.far = span * 6;
  scene.add(sun, sun.target);
  // 接收投影的地面（透明，只显示阴影）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.32, cz);
  ground.receiveShadow = true;
  scene.add(ground);
}

export { THREE };
