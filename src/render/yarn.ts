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
  ctx.strokeStyle = `rgba(90,55,20,${0.2 + lift * 0.05})`;
  ctx.lineWidth = w;
  strokePolyline(ctx, pts, lift * 3, w * 0.35 + lift * 6);

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

  // 高光
  const ns = normals(pts);
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
export function drawButton(ctx: Ctx2D, x: number, y: number, r: number, color: string, opts: { lift?: number; ring?: string } = {}): void {
  const lift = opts.lift ?? 0;
  ctx.save();
  // 阴影
  ellipsePath(ctx, x + lift * 2, y + r * 0.22 + lift * 5, r * (1 + lift * 0.08), r * 0.92);
  ctx.fillStyle = `rgba(90,55,20,${0.25 - lift * 0.05})`;
  ctx.fill();

  const s = 1 + lift * 0.15;
  ctx.translate(x, y - lift * 4);
  ctx.scale(s, s);

  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2);
    ctx.strokeStyle = opts.ring;
    ctx.lineWidth = r * 0.18;
    ctx.stroke();
  }

  fillCircle(ctx, 0, 0, r, shade(color, 0.12));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = r * 0.12;
  ctx.stroke();

  // 内凹的中心
  fillCircle(ctx, 0, 0, r * 0.7, shade(color, -0.06));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, Math.PI * 0.15, Math.PI * 0.85);
  ctx.strokeStyle = shade(color, 0.35, 0.8);
  ctx.lineWidth = r * 0.08;
  ctx.stroke();

  // 四个孔 + 交叉缝线
  const o = r * 0.24;
  ctx.strokeStyle = THEME.thread;
  ctx.lineWidth = r * 0.11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-o, -o);
  ctx.lineTo(o, o);
  ctx.moveTo(o, -o);
  ctx.lineTo(-o, o);
  ctx.stroke();
  for (const [hx, hy] of [
    [-o, -o],
    [o, -o],
    [-o, o],
    [o, o],
  ]) {
    fillCircle(ctx, hx, hy, r * 0.1, shade(color, -0.5));
  }

  // 顶部反光
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, Math.PI * 1.1, Math.PI * 1.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = r * 0.12;
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
