import type { BlobShape, LevelData, Piece } from '../core/board';
import { Ctx2D } from '../platform/types';
import { shade, THEME } from './colors';
import { ellipsePath, fillCircle, fillEllipse, heart, pawPrint } from './shapes';

export interface BoardLayout {
  /** 坐标原点 (0,0) 对应的屏幕位置 */
  x0: number;
  y0: number;
  /** 1 个单位（相邻孔距）对应的像素 */
  cell: number;
}

export function toScreen(l: BoardLayout, gx: number, gy: number): { x: number; y: number } {
  return { x: l.x0 + gx * l.cell, y: l.y0 + gy * l.cell };
}

/** 布料配色（淡彩毛毡） */
export const FABRICS = ['#FFD8C4', '#CDEBD6', '#FFE9B0', '#E2D5F5', '#FFD0DC', '#CDE3F7'];

export function fabric(tint = 0): string {
  return FABRICS[tint % FABRICS.length];
}

/** 关卡内容的包围盒（单位坐标） */
export function levelBounds(lv: LevelData): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, r: number) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const [x, y] of lv.holes) add(x, y, 0.6);
  for (const p of lv.pieces) {
    if (p.kind === 'bar') {
      add(p.x1, p.y1, p.w / 2 + 0.1);
      add(p.x2, p.y2, p.w / 2 + 0.1);
    } else if (p.kind === 'arc') {
      for (let i = 0; i <= 12; i++) {
        const a = p.a0 + ((p.a1 - p.a0) * i) / 12;
        add(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r, p.w / 2 + 0.1);
      }
    } else {
      add(p.x, p.y, p.s * (p.shape === 'catHead' ? 1.15 : 1.2));
    }
  }
  return { x0, y0, x1, y1 };
}

/** 背景：粉到奶油色的渐变 + 淡淡的猫爪印和小爱心 + 四角暗角 */
export function drawBackground(ctx: Ctx2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, THEME.bgTop);
  g.addColorStop(0.55, THEME.bg);
  g.addColorStop(1, '#FFF1DE');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const step = 78;
  let row = 0;
  for (let y = 24; y < h + step; y += step * 0.78, row++) {
    for (let x = (row % 2) * step * 0.5 + 18; x < w + step; x += step) {
      const k = (x * 7 + y * 13) % 10;
      if (k < 2) heart(ctx, x, y, 6, 'rgba(245,160,170,0.22)');
      else pawPrint(ctx, x, y, 11, THEME.bgPaw, k / 10 - 0.5);
    }
  }
  const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.45, w / 2, h * 0.45, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(255,255,255,0)');
  v.addColorStop(1, 'rgba(230,170,150,0.18)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ───────────── 布片路径 ─────────────

function blobPath(ctx: Ctx2D, shape: BlobShape): void {
  // 单位尺寸的造型，中心在原点
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      break;
    case 'bean':
      ctx.save();
      ctx.scale(1.15, 0.92);
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.restore();
      break;
    case 'catHead':
      ctx.moveTo(-0.86, -0.42);
      ctx.lineTo(-0.88, -0.9);
      ctx.quadraticCurveTo(-0.88, -1.1, -0.7, -1.0);
      ctx.lineTo(-0.36, -0.75);
      ctx.quadraticCurveTo(0, -0.87, 0.36, -0.75);
      ctx.lineTo(0.7, -1.0);
      ctx.quadraticCurveTo(0.88, -1.1, 0.88, -0.9);
      ctx.lineTo(0.86, -0.42);
      ctx.bezierCurveTo(1.14, 0.05, 1.0, 0.8, 0, 0.82);
      ctx.bezierCurveTo(-1.0, 0.8, -1.14, 0.05, -0.86, -0.42);
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, 0.95);
      ctx.bezierCurveTo(-0.55, 0.6, -1.12, 0.18, -1.02, -0.35);
      ctx.bezierCurveTo(-0.92, -0.98, -0.15, -1.02, 0, -0.45);
      ctx.bezierCurveTo(0.15, -1.02, 0.92, -0.98, 1.02, -0.35);
      ctx.bezierCurveTo(1.12, 0.18, 0.55, 0.6, 0, 0.95);
      ctx.closePath();
      break;
    case 'fish':
      ctx.moveTo(-1, 0);
      ctx.bezierCurveTo(-0.72, -0.62, 0.22, -0.66, 0.62, -0.12);
      ctx.lineTo(0.98, -0.5);
      ctx.quadraticCurveTo(1.08, -0.56, 1.06, -0.4);
      ctx.quadraticCurveTo(0.95, 0, 1.06, 0.4);
      ctx.quadraticCurveTo(1.08, 0.56, 0.98, 0.5);
      ctx.lineTo(0.62, 0.12);
      ctx.bezierCurveTo(0.22, 0.66, -0.72, 0.62, -1, 0);
      ctx.closePath();
      break;
    case 'cloud':
      ctx.moveTo(-1, 0.45);
      ctx.bezierCurveTo(-1.38, 0.45, -1.32, -0.22, -0.86, -0.16);
      ctx.bezierCurveTo(-0.8, -0.72, -0.08, -0.78, 0, -0.3);
      ctx.bezierCurveTo(0.2, -0.78, 0.98, -0.66, 0.86, -0.1);
      ctx.bezierCurveTo(1.32, -0.14, 1.38, 0.45, 1, 0.45);
      ctx.closePath();
      break;
    case 'pad':
      ctx.moveTo(0, -0.7);
      ctx.bezierCurveTo(0.75, -0.7, 1.05, -0.2, 1.0, 0.25);
      ctx.bezierCurveTo(0.95, 0.75, 0.45, 0.85, 0, 0.85);
      ctx.bezierCurveTo(-0.45, 0.85, -0.95, 0.75, -1.0, 0.25);
      ctx.bezierCurveTo(-1.05, -0.2, -0.75, -0.7, 0, -0.7);
      ctx.closePath();
      break;
  }
}

/** 按像素内缩 inset 画出布片路径（屏幕坐标） */
function piecePath(ctx: Ctx2D, p: Piece, l: BoardLayout, inset: number): void {
  const c = l.cell;
  if (p.kind === 'arc') {
    const cx = l.x0 + p.x * c;
    const cy = l.y0 + p.y * c;
    const R = p.r * c;
    const hw = (p.w * c) / 2 - inset;
    const e1 = { x: cx + Math.cos(p.a1) * R, y: cy + Math.sin(p.a1) * R };
    const e0 = { x: cx + Math.cos(p.a0) * R, y: cy + Math.sin(p.a0) * R };
    ctx.beginPath();
    ctx.arc(cx, cy, R + hw, p.a0, p.a1);
    ctx.arc(e1.x, e1.y, hw, p.a1, p.a1 + Math.PI);
    ctx.arc(cx, cy, R - hw, p.a1, p.a0, true);
    ctx.arc(e0.x, e0.y, hw, p.a0 + Math.PI, p.a0 + Math.PI * 2);
    ctx.closePath();
  } else if (p.kind === 'bar') {
    const x1 = l.x0 + p.x1 * c;
    const y1 = l.y0 + p.y1 * c;
    const x2 = l.x0 + p.x2 * c;
    const y2 = l.y0 + p.y2 * c;
    const hw = (p.w * c) / 2 - inset;
    const t = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.arc(x2, y2, hw, t - Math.PI / 2, t + Math.PI / 2);
    ctx.arc(x1, y1, hw, t + Math.PI / 2, t + Math.PI * 1.5);
    ctx.closePath();
  } else {
    const s = p.s * c;
    const k = Math.max(0.1, (s - inset) / s);
    ctx.save();
    ctx.translate(l.x0 + p.x * c, l.y0 + p.y * c);
    if (p.rot) ctx.rotate(p.rot);
    ctx.scale(s * k, s * k);
    blobPath(ctx, p.shape);
    ctx.restore();
  }
}

function pieceTop(p: Piece, l: BoardLayout): { top: number; bottom: number } {
  const b = levelBounds({ holes: [], pieces: [p], ropes: [], steps: 0, par: 0 });
  return { top: l.y0 + b.y0 * l.cell, bottom: l.y0 + b.y1 * l.cell };
}

/** 一块布片：投影 -> 鼓起的边 -> 渐变布面 -> 毛毡颗粒 -> 缝线 -> 高光 */
function drawPiece(ctx: Ctx2D, p: Piece, l: BoardLayout, seed: number): void {
  const base = fabric(p.tint);
  const { top, bottom } = pieceTop(p, l);

  // 投影
  ctx.save();
  ctx.translate(0, 5);
  piecePath(ctx, p, l, 0);
  ctx.fillStyle = 'rgba(170,100,70,0.22)';
  ctx.shadowColor = 'rgba(150,80,50,0.25)';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();

  // 边（深一点，像布垫鼓起的侧面）
  piecePath(ctx, p, l, 0);
  ctx.fillStyle = shade(base, -0.16);
  ctx.fill();

  // 布面：上亮下暗
  piecePath(ctx, p, l, 2.5);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.06));
  ctx.fillStyle = g;
  ctx.fill();

  // 毛毡颗粒
  ctx.save();
  piecePath(ctx, p, l, 2.5);
  ctx.clip();
  let s = seed * 9301 + 17;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const b = levelBounds({ holes: [], pieces: [p], ropes: [], steps: 0, par: 0 });
  const area = (b.x1 - b.x0) * (b.y1 - b.y0) * l.cell * l.cell;
  const n = Math.min(900, Math.floor(area / 40));
  for (let i = 0; i < n; i++) {
    const x = l.x0 + (b.x0 + rnd() * (b.x1 - b.x0)) * l.cell;
    const y = l.y0 + (b.y0 + rnd() * (b.y1 - b.y0)) * l.cell;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : shade(base, -0.2, 0.25);
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.restore();

  // 缝线
  ctx.save();
  piecePath(ctx, p, l, Math.max(5, l.cell * 0.1));
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(base, -0.38);
  ctx.stroke();
  ctx.restore();

  // 顶部高光
  ctx.save();
  piecePath(ctx, p, l, 2.5);
  ctx.clip();
  ctx.translate(0, 3);
  piecePath(ctx, p, l, 2.5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();
  ctx.restore();
}

/** 孔：金属气眼 + 下凹的孔洞 */
function drawEyelet(ctx: Ctx2D, x: number, y: number, r: number): void {
  // 外圈阴影
  fillCircle(ctx, x, y + 1.5, r * 1.32, 'rgba(120,70,40,0.25)');
  // 金属圈
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#FFF4D6');
  g.addColorStop(0.45, '#E9C88E');
  g.addColorStop(1, '#B98A4E');
  fillCircle(ctx, x, y, r * 1.28, g as unknown as string);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.28, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(140,95,45,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 孔洞
  const h = ctx.createRadialGradient(x, y + r * 0.25, r * 0.1, x, y, r);
  h.addColorStop(0, '#C9A487');
  h.addColorStop(1, '#8E6A52');
  fillCircle(ctx, x, y, r, h as unknown as string);
  // 内壁阴影 + 金属高光
  ctx.beginPath();
  ctx.arc(x, y + 1, r - 1.5, Math.PI * 1.1, Math.PI * 1.9);
  ctx.strokeStyle = 'rgba(60,35,20,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 1.14, Math.PI * 1.15, Math.PI * 1.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export const HOLE_R = 0.22;

export interface FaceState {
  blink: number;
  happy: number;
}

function eachFace(lv: LevelData, l: BoardLayout, fn: (cx: number, cy: number, s: number) => void): void {
  for (const p of lv.pieces) {
    if (p.kind !== 'blob' || !p.face) continue;
    fn(l.x0 + p.x * l.cell, l.y0 + p.y * l.cell, p.s * l.cell);
  }
}

const THREAD = '#7A4A36';

/** 猫脸布垫上静态的刺绣：耳朵贴布、鼻子、嘴、腮红、胡须（画进棋盘缓存） */
function drawFaceStatic(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.74, -s * 0.5);
    ctx.lineTo(side * s * 0.74, -s * 0.86);
    ctx.lineTo(side * s * 0.46, -s * 0.68);
    ctx.closePath();
    ctx.fillStyle = 'rgba(247,160,180,0.55)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, 0);
  ctx.lineTo(s * 0.06, 0);
  ctx.lineTo(0, s * 0.06);
  ctx.closePath();
  ctx.fillStyle = '#F28AA0';
  ctx.fill();
  ctx.strokeStyle = THREAD;
  ctx.lineWidth = Math.max(2, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.06);
  ctx.arc(-s * 0.075, s * 0.08, s * 0.075, 0, Math.PI * 0.9);
  ctx.moveTo(0, s * 0.06);
  ctx.arc(s * 0.075, s * 0.08, s * 0.075, Math.PI, Math.PI * 0.1, true);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ellipsePath(ctx, side * s * 0.42, s * 0.12, s * 0.1, s * 0.06);
    ctx.fillStyle = 'rgba(247,130,150,0.45)';
    ctx.fill();
  }
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = Math.max(1.4, s * 0.028);
  ctx.strokeStyle = 'rgba(122,74,54,0.6)';
  for (const side of [-1, 1]) {
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.18, s * (0.05 + k * 0.035));
      ctx.lineTo(side * s * 0.4, s * (0.0 + k * 0.08));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 整个棋盘（缓存到离屏画布，只在布局变化时重画） */
export function drawBoard(ctx: Ctx2D, lv: LevelData, l: BoardLayout): void {
  lv.pieces.forEach((p, i) => drawPiece(ctx, p, l, i + 1));
  eachFace(lv, l, (cx, cy, s) => drawFaceStatic(ctx, cx, cy, s));
  const r = l.cell * HOLE_R;
  for (const [hx, hy] of lv.holes) {
    const p = toScreen(l, hx, hy);
    drawEyelet(ctx, p.x, p.y, r);
  }
}

/** 猫脸布垫的眼睛（每帧画，会眨眼、开心时眯眼） */
export function drawFabricFaces(ctx: Ctx2D, lv: LevelData, l: BoardLayout, st: FaceState): void {
  eachFace(lv, l, (cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    ctx.strokeStyle = THREAD;
    ctx.lineWidth = Math.max(2, s * 0.05);
    for (const side of [-1, 1]) {
      const ex = side * s * 0.34;
      const ey = -s * 0.2;
      if (st.happy > 0.5) {
        ctx.beginPath();
        ctx.arc(ex, ey + s * 0.04, s * 0.1, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (st.blink > 0.5) {
        ctx.beginPath();
        ctx.moveTo(ex - s * 0.09, ey);
        ctx.lineTo(ex + s * 0.09, ey);
        ctx.stroke();
      } else {
        fillEllipse(ctx, ex, ey, s * 0.075, s * 0.1, '#3A2618');
        fillCircle(ctx, ex - s * 0.025, ey - s * 0.035, s * 0.03, '#FFFFFF');
      }
    }
    ctx.restore();
  });
}

