import { Ctx2D } from '../platform/types';

// 基础图形工具。不用 ctx.roundRect / ctx.ellipse / Path2D，保证微信小游戏兼容。

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function ellipsePath(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(rx, ry);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.restore();
}

export function fillEllipse(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
  ellipsePath(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = color;
  ctx.fill();
}

export function fillCircle(ctx: Ctx2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

export function text(
  ctx: Ctx2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { align?: CanvasTextAlign; weight?: string; stroke?: string; strokeW?: number } = {},
): void {
  ctx.font = `${opts.weight ?? 'bold'} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (opts.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = opts.strokeW ?? size * 0.2;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/** 猫爪印：一个肉垫 + 四个脚趾 */
export function pawPrint(ctx: Ctx2D, x: number, y: number, s: number, color: string, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ellipsePath(ctx, 0, s * 0.25, s * 0.48, s * 0.4);
  ctx.fill();
  const toes: [number, number][] = [
    [-0.52, -0.25],
    [-0.2, -0.55],
    [0.2, -0.55],
    [0.52, -0.25],
  ];
  for (const [tx, ty] of toes) {
    ellipsePath(ctx, tx * s, ty * s, s * 0.17, s * 0.21);
    ctx.fill();
  }
  ctx.restore();
}

export function star(ctx: Ctx2D, x: number, y: number, r: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function heart(ctx: Ctx2D, x: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
