import { Ctx2D } from '../platform/types';
import { shade, THEME } from './colors';
import { ellipsePath, fillCircle, fillEllipse, pawPrint, roundRectPath, text } from './shapes';

/**
 * 打盹的小猫：白底灰斑，团成一团趴着。
 * (x, y) 是身体中心，s 约等于身体半宽。count > 0 时头顶显示还要等几团毛线。
 * wake: 0~1 醒来动画（跳起 + 淡出），wiggle: 被戳时抖一下
 */
export function drawKitten(ctx: Ctx2D, x: number, y: number, s: number, t: number, count: number, wake = 0, wiggle = 0): void {
  const line = '#8A7768';
  const fur = '#FFFFFF';
  const patch = '#CFC6D6';
  ctx.save();
  const hop = Math.sin(Math.min(1, wake) * Math.PI) * s * 1.2;
  ctx.globalAlpha = wake > 0.6 ? Math.max(0, 1 - (wake - 0.6) / 0.4) : 1;
  ctx.translate(x + Math.sin(wiggle * 30) * wiggle * s * 0.15, y - hop);
  const breathe = 1 + Math.sin(t * 2.2) * 0.03;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 阴影
  fillEllipse(ctx, 0, s * 0.42 + hop, s * 0.95, s * 0.22, 'rgba(90,55,20,0.18)');
  // 身体
  ellipsePath(ctx, s * 0.1, 0, s * 0.82 * breathe, s * 0.5 * breathe);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = s * 0.08;
  ctx.stroke();
  // 背上的灰斑
  ctx.save();
  ellipsePath(ctx, s * 0.1, 0, s * 0.82 * breathe, s * 0.5 * breathe);
  ctx.clip();
  fillEllipse(ctx, s * 0.45, -s * 0.35, s * 0.4, s * 0.3, patch);
  ctx.restore();
  // 尾巴绕到身前
  ctx.beginPath();
  ctx.moveTo(s * 0.85, s * 0.05);
  ctx.quadraticCurveTo(s * 0.9, s * 0.55, s * 0.05, s * 0.45);
  ctx.strokeStyle = line;
  ctx.lineWidth = s * 0.26;
  ctx.stroke();
  ctx.strokeStyle = patch;
  ctx.lineWidth = s * 0.16;
  ctx.stroke();

  // 头
  const hx = -s * 0.5;
  const hy = -s * 0.08;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + side * s * 0.34, hy - s * 0.12);
    ctx.lineTo(hx + side * s * 0.36, hy - s * 0.52);
    ctx.lineTo(hx + side * s * 0.08, hy - s * 0.32);
    ctx.closePath();
    ctx.fillStyle = side < 0 ? patch : fur;
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = s * 0.07;
    ctx.stroke();
  }
  fillCircle(ctx, hx, hy, s * 0.4, fur);
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.4, 0, Math.PI * 2);
  ctx.strokeStyle = line;
  ctx.lineWidth = s * 0.08;
  ctx.stroke();
  // 闭着的眼睛 / 醒来睁眼
  ctx.lineWidth = s * 0.06;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (wake > 0) {
      fillCircle(ctx, hx + side * s * 0.15, hy - s * 0.02, s * 0.06, '#3A2618');
    } else {
      ctx.arc(hx + side * s * 0.15, hy - s * 0.04, s * 0.08, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  fillCircle(ctx, hx, hy + s * 0.1, s * 0.05, THEME.catPink);
  fillEllipse(ctx, hx - s * 0.24, hy + s * 0.12, s * 0.08, s * 0.05, 'rgba(247,140,160,0.5)');
  fillEllipse(ctx, hx + s * 0.24, hy + s * 0.12, s * 0.08, s * 0.05, 'rgba(247,140,160,0.5)');

  if (wake <= 0) {
    // 飘起的 z
    for (let i = 0; i < 2; i++) {
      const u = (t * 0.5 + i * 0.5) % 1;
      ctx.save();
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.85;
      text(ctx, 'z', hx - s * 0.2 - u * s * 0.5, hy - s * 0.7 - u * s * 0.7, s * (0.32 + u * 0.18), '#9C8FB5', { stroke: '#FFFFFF', strokeW: 3 });
      ctx.restore();
    }
    if (count > 0) {
      // 计数气泡
      const bx = s * 0.35;
      const by = -s * 0.95;
      fillCircle(ctx, bx, by, s * 0.32, '#FFFFFF');
      ctx.beginPath();
      ctx.arc(bx, by, s * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = '#9C8FB5';
      ctx.lineWidth = s * 0.07;
      ctx.stroke();
      text(ctx, String(count), bx, by + 1, s * 0.4, '#7A6A9A');
    }
  }
  ctx.restore();
}

/** 毛线锁：孔上挂一把和钥匙毛线同色的小挂锁，锁面是猫爪印。open: 0~1 打开动画 */
export function drawLock(ctx: Ctx2D, x: number, y: number, r: number, color: string, t: number, open = 0): void {
  ctx.save();
  ctx.globalAlpha = open > 0 ? Math.max(0, 1 - open) : 1;
  const lift = open * r * 1.5;
  const bob = Math.sin(t * 2.5) * r * 0.04;
  ctx.translate(x, y - lift + bob);
  // 孔上的彩色光圈
  ctx.beginPath();
  ctx.arc(0, lift - bob, r * 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = shade(color, 0.2, 0.55);
  ctx.lineWidth = r * 0.16;
  ctx.setLineDash([r * 0.25, r * 0.2]);
  ctx.stroke();
  ctx.setLineDash([]);
  // 锁梁（打开时抬起）
  ctx.beginPath();
  ctx.arc(0, -r * 0.2 - open * r * 0.35, r * 0.4, Math.PI, 0);
  ctx.lineTo(r * 0.4, -r * 0.05 - open * r * 0.35);
  ctx.moveTo(-r * 0.4, -r * 0.2 - open * r * 0.35);
  ctx.lineTo(-r * 0.4, -r * 0.05);
  ctx.strokeStyle = '#A99A8C';
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  // 锁身
  roundRectPath(ctx, -r * 0.68, -r * 0.12, r * 1.36, r * 1.05, r * 0.3);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fill();
  roundRectPath(ctx, -r * 0.68, -r * 0.18, r * 1.36, r * 1.0, r * 0.3);
  ctx.fillStyle = color;
  ctx.fill();
  roundRectPath(ctx, -r * 0.5, -r * 0.1, r * 1.0, r * 0.22, r * 0.11);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  pawPrint(ctx, 0, r * 0.38, r * 0.3, 'rgba(255,255,255,0.9)');
  ctx.restore();
}
