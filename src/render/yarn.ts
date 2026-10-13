import { Vec } from '../core/geometry';
import { Ctx2D } from '../platform/types';
import { shade, THEME } from './colors';
import { ellipsePath, fillCircle } from './shapes';

function strokePolyline(ctx: Ctx2D, pts: Vec[], dx = 0, dy = 0): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x + dx, pts[0].y + dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + dx, pts[i].y + dy);
  ctx.stroke();
}

/** 每个点处的单位法线，统一朝"上方"，用于画高光 */
function normals(pts: Vec[]): Vec[] {
  return pts.map((_, i) => {
    const p = pts[Math.max(0, i - 1)];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - p.x;
    let ty = q.y - p.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    let nx = -ty;
    let ny = tx;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  });
}

export interface YarnStyle {
  /** 毛线粗细（像素） */
  width: number;
  /** 被拎起来时阴影更远 */
  lift?: number;
  /** 发光（拖动预览：这根会被理顺） */
  glow?: boolean;
  alpha?: number;
  /** 绒毛随机种子（每根毛线固定，避免闪烁） */
  seed?: number;
  /** 不画投影（局部重绘环扣时用） */
  flat?: boolean;
  /** 不画绒毛 */
  noFuzz?: boolean;
}

/** 画一根毛线：阴影 -> 描边 -> 主体 -> 螺旋纹 -> 高光 */
export function drawYarn(ctx: Ctx2D, pts: Vec[], color: string, st: YarnStyle): void {
  const w = st.width;
  ctx.save();
  ctx.globalAlpha = st.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (st.glow) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = w + 10;
    strokePolyline(ctx, pts);
  }

  const lift = st.lift ?? 0;
  if (!st.flat) {
    ctx.strokeStyle = `rgba(90,55,20,${0.2 + lift * 0.05})`;
    ctx.lineWidth = w;
    strokePolyline(ctx, pts, lift * 3, w * 0.35 + lift * 6);
  }

  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = w + 2.5;
  strokePolyline(ctx, pts);

  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  strokePolyline(ctx, pts);

  // 螺旋纹：沿毛线每隔一段画一条斜线，模拟毛线股的扭转
  ctx.strokeStyle = shade(color, -0.2);
  ctx.lineWidth = Math.max(1.2, w * 0.15);
  const spacing = w * 0.75;
  let acc = spacing * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const segLen = Math.hypot(q.x - p.x, q.y - p.y);
    if (segLen === 0) continue;
    const tx = (q.x - p.x) / segLen;
    const ty = (q.y - p.y) / segLen;
    const nx = -ty;
    const ny = tx;
    while (acc < segLen) {
      const cx = p.x + tx * acc;
      const cy = p.y + ty * acc;
      const h = w * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx - nx * h - tx * w * 0.28, cy - ny * h - ty * w * 0.28);
      ctx.lineTo(cx + nx * h + tx * w * 0.28, cy + ny * h + ty * w * 0.28);
      ctx.stroke();
      acc += spacing;
    }
    acc -= segLen;
  }

  // 绒毛：沿毛线边缘随机冒出的细小毛刺，让毛线看起来更软
  const ns = normals(pts);
  ctx.strokeStyle = shade(color, 0.25, 0.7);
  ctx.lineWidth = 1;
  let seed = st.seed ?? Math.floor(pts[0].x * 13 + pts[0].y * 7);
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 1; i < pts.length - 1 && !st.noFuzz; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    for (let k = 0; k < 2; k++) {
      const u = rnd();
      const side = rnd() < 0.5 ? -1 : 1;
      const cx = p.x + (q.x - p.x) * u;
      const cy = p.y + (q.y - p.y) * u;
      const ex = cx + ns[i].x * side * w * 0.5;
      const ey = cy + ns[i].y * side * w * 0.5;
      const len = w * (0.15 + rnd() * 0.2);
      const a = Math.atan2(ns[i].y * side, ns[i].x * side) + (rnd() - 0.5) * 1.2;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(a) * len, ey + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // 高光
  ctx.strokeStyle = shade(color, 0.45, 0.6);
  ctx.lineWidth = Math.max(1, w * 0.18);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.x + ns[i].x * w * 0.22;
    const y = p.y + ns[i].y * w * 0.22;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

/** 纽扣（毛线两端的"钉子"）：四孔纽扣 + 交叉缝线 */
export interface ButtonOpts {
  lift?: number;
  ring?: string;
  /** 被缝住的纽扣：花边造型 + 粗缝线 */
  sewn?: boolean;
  /** 被戳时抖动（0~1） */
  shake?: number;
  /** 落孔时压扁（正数横向变宽） */
  squash?: number;
}

/** 精灵缓存：游戏里注册离屏画布工厂后，纽扣画一次缓存成图片，之后每帧直接贴图 */
type SpriteFactory = (w: number, h: number) => { canvas: HTMLCanvasElement; ctx: Ctx2D };
let spriteFactory: SpriteFactory | null = null;
let spriteScale = 2;
const sprites = new Map<string, HTMLCanvasElement>();

export function setSpriteFactory(f: SpriteFactory, dpr: number): void {
  spriteFactory = f;
  spriteScale = dpr;
  sprites.clear();
}

function buttonSprite(r: number, color: string, sewn: boolean): HTMLCanvasElement | null {
  if (!spriteFactory) return null;
  const key = `${color}|${sewn ? 1 : 0}|${Math.round(r * 2)}`;
  let c = sprites.get(key);
  if (!c) {
    const size = Math.ceil(r * 3 * spriteScale);
    const surf = spriteFactory(size, size);
    surf.ctx.scale(spriteScale, spriteScale);
    surf.ctx.translate(r * 1.5, r * 1.5);
    if (sewn) drawSewnFace(surf.ctx, r, color);
    else drawButtonFace(surf.ctx, r, color);
    c = surf.canvas;
    sprites.set(key, c);
  }
  return c;
}

/** 普通纽扣正面（原点为中心）：渐变鼓面、凹心、四孔缝线、高光 */
function drawButtonFace(ctx: Ctx2D, r: number, color: string): void {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.55, shade(color, 0.08));
  g.addColorStop(1, shade(color, -0.18));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
  // 内凹的中心：上暗下亮
  const d = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
  d.addColorStop(0, shade(color, -0.2));
  d.addColorStop(1, shade(color, 0.18));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = d;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, Math.PI * 0.1, Math.PI * 0.9);
  ctx.strokeStyle = shade(color, 0.45, 0.8);
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
  // 四个孔 + 交叉缝线
  const o = r * 0.23;
  for (const [hx, hy] of [
    [-o, -o],
    [o, -o],
    [-o, o],
    [o, o],
  ]) {
    fillCircle(ctx, hx, hy, r * 0.1, shade(color, -0.55));
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(THEME.thread, -0.15);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(-o, -o);
  ctx.lineTo(o, o);
  ctx.moveTo(o, -o);
  ctx.lineTo(-o, o);
  ctx.stroke();
  ctx.strokeStyle = THEME.thread;
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
  // 高光
  ctx.save();
  ctx.translate(-r * 0.38, -r * 0.46);
  ctx.rotate(-0.6);
  ctx.scale(r * 0.3, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, Math.PI * 0.2, Math.PI * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
}

export function drawButton(ctx: Ctx2D, x: number, y: number, r: number, color: string, opts: ButtonOpts = {}): void {
  if (opts.shake) x += Math.sin(opts.shake * 40) * opts.shake * r * 0.25;
  const lift = opts.lift ?? 0;
  const squash = opts.squash ?? 0;
  ctx.save();
  // 阴影：拎起来时更远更淡
  ellipsePath(ctx, x + lift * 3, y + r * 0.25 + lift * 7, r * (1.02 + lift * 0.1), r * 0.9);
  ctx.fillStyle = `rgba(90,55,20,${0.28 - lift * 0.1})`;
  ctx.fill();
  const s = 1 + lift * 0.16;
  ctx.translate(x, y - lift * 6);
  ctx.scale(s * (1 + squash), s * (1 - squash));
  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2);
    ctx.strokeStyle = opts.ring;
    ctx.lineWidth = r * 0.16;
    ctx.stroke();
  }
  const sprite = buttonSprite(r, color, !!opts.sewn);
  if (sprite) ctx.drawImage(sprite, -r * 1.5, -r * 1.5, r * 3, r * 3);
  else if (opts.sewn) drawSewnFace(ctx, r, color);
  else drawButtonFace(ctx, r, color);
  ctx.restore();
}

/**
 * 环扣：上层毛线 U 在交叉点 H 勾住下层毛线 L。
 * 先把 L 在交叉处压回到 U 上面，再在 L 两侧各画一道 U 的绕圈，看起来像 U 绕过 L 打了个扣。
 */
/** 在交叉点 h 附近把这根毛线的一小段重画一遍（用来修正叠放顺序：让它盖在另一根上面） */
export function drawYarnPatch(ctx: Ctx2D, h: Vec, pts: Vec[], color: string, w: number, seed: number): void {
  let best = 0;
  let bd = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const piece: Vec[] = [];
  for (let i = best; i >= 0 && Math.hypot(pts[i].x - h.x, pts[i].y - h.y) < w * 2.2; i--) piece.unshift(pts[i]);
  for (let i = best + 1; i < pts.length && Math.hypot(pts[i].x - h.x, pts[i].y - h.y) < w * 2.2; i++) piece.push(pts[i]);
  if (piece.length >= 2) drawYarn(ctx, piece, color, { width: w, flat: true, noFuzz: true, seed });
}

export function drawYarnWrap(ctx: Ctx2D, h: Vec, lowerPts: Vec[], upperColor: string, lowerColor: string, w: number, seed: number): void {
  // L 在交叉处附近的一小段
  let best = 0;
  let bd = Infinity;
  lowerPts.forEach((p, i) => {
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const piece: Vec[] = [];
  for (let i = best; i >= 0 && Math.hypot(lowerPts[i].x - h.x, lowerPts[i].y - h.y) < w * 1.6; i--) piece.unshift(lowerPts[i]);
  for (let i = best + 1; i < lowerPts.length && Math.hypot(lowerPts[i].x - h.x, lowerPts[i].y - h.y) < w * 1.6; i++) piece.push(lowerPts[i]);
  if (piece.length < 2) return;
  const a = piece[0];
  const b = piece[piece.length - 1];
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  drawYarn(ctx, piece, lowerColor, { width: w, flat: true, noFuzz: true, seed });
  // U 的两道绕圈：垂直于 L，横跨在 L 上
  const nx = -dy;
  const ny = dx;
  for (const side of [-1, 1]) {
    const cx = h.x + dx * w * 0.95 * side;
    const cy = h.y + dy * w * 0.95 * side;
    const bend = w * 0.35 * side;
    const loop: Vec[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6 - 0.5;
      const along = Math.cos(t * Math.PI) * bend;
      loop.push({ x: cx + nx * t * w * 1.9 + dx * along, y: cy + ny * t * w * 1.9 + dy * along });
    }
    drawYarn(ctx, loop, upperColor, { width: w * 0.82, flat: true, noFuzz: true, seed });
  }
}

/** 缝住的纽扣：花瓣形边缘，四周有缝到垫子上的针脚 */
function drawSewnFace(ctx: Ctx2D, r: number, color: string): void {
  ctx.save();
  // 缝到垫子上的针脚
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
    ctx.lineTo(Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38);
    ctx.stroke();
  }
  // 花瓣边
  const petals = 8;
  ctx.fillStyle = shade(color, -0.35);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    fillCircle(ctx, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, r * 0.36, shade(color, -0.35));
  }
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    fillCircle(ctx, Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, r * 0.29, shade(color, 0.15));
  }
  fillCircle(ctx, 0, 0, r * 0.78, shade(color, 0.15));
  fillCircle(ctx, 0, 0, r * 0.55, shade(color, -0.08));
  // 粗缝线（十字 + 方框）
  const o = r * 0.22;
  ctx.strokeStyle = shade(color, -0.55);
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-o, -o);
  ctx.lineTo(o, o);
  ctx.moveTo(o, -o);
  ctx.lineTo(-o, o);
  ctx.stroke();
  ctx.strokeStyle = THEME.thread;
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-o, -o);
  ctx.lineTo(o, o);
  ctx.moveTo(o, -o);
  ctx.lineTo(-o, o);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, Math.PI * 1.1, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
  ctx.restore();
}

/** 毛线球 */
export function drawYarnBall(ctx: Ctx2D, x: number, y: number, r: number, color: string, rot = 0): void {
  if (r <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  fillCircle(ctx, 0, r * 0.12, r, 'rgba(90,55,20,0.18)');
  fillCircle(ctx, 0, 0, r, color);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(rot);
  ctx.strokeStyle = shade(color, -0.22);
  ctx.lineWidth = Math.max(1, r * 0.13);
  // 几圈不同方向的缠绕线
  for (let k = 0; k < 3; k++) {
    for (let j = -2; j <= 2; j++) {
      ellipsePath(ctx, j * r * 0.32, 0, r * 0.22, r * 1.15, (k * Math.PI) / 3);
      ctx.stroke();
    }
    ctx.rotate(Math.PI / 3);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.05, -r * 0.05, r * 0.72, Math.PI * 1.1, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}
