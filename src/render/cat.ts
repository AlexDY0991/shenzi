import { Ctx2D } from '../platform/types';
import { THEME, shade } from './colors';
import { ellipsePath, fillCircle, fillEllipse, roundRectPath } from './shapes';
import { drawYarnBall } from './yarn';

export type CatMood = 'idle' | 'happy' | 'sad' | 'surprised';

export interface CatState {
  mood: CatMood;
  /** 0~1，眨眼进度 */
  blink: number;
  /** 尾巴摆动相位 */
  tail: number;
  /** 0~1，抬爪拍毛线 */
  paw: number;
  /** 眼睛看向的方向（-1~1） */
  lookX: number;
  lookY: number;
  /** 0~1，开心跳起 */
  hop: number;
}

export function newCatState(): CatState {
  return { mood: 'idle', blink: 0, tail: 0, paw: 0, lookX: 0, lookY: 0, hop: 0 };
}

/**
 * 坐着的橘猫，(x, y) 是坐姿底部中心，s 是尺寸单位（约等于头半径）。
 * 总高约 3.1s。
 */
export function drawCat(ctx: Ctx2D, x: number, y: number, s: number, st: CatState): void {
  const C = THEME;
  ctx.save();
  ctx.translate(x, y - st.hop * s * 0.5);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 地面阴影（跳起时变小）
  ctx.save();
  ctx.translate(0, st.hop * s * 0.5);
  fillEllipse(ctx, 0, 0, s * (1.1 - st.hop * 0.3), s * 0.18, 'rgba(90,55,20,0.15)');
  ctx.restore();

  // 尾巴
  const sway = Math.sin(st.tail) * 0.35;
  ctx.beginPath();
  ctx.moveTo(s * 0.6, -s * 0.3);
  ctx.bezierCurveTo(s * 1.5, -s * 0.2, s * (1.5 + sway), -s * 1.0, s * (1.15 + sway * 1.4), -s * 1.55);
  ctx.strokeStyle = C.catLine;
  ctx.lineWidth = s * 0.36;
  ctx.stroke();
  ctx.strokeStyle = C.catBody;
  ctx.lineWidth = s * 0.26;
  ctx.stroke();
  // 尾巴条纹
  ctx.strokeStyle = C.catStripe;
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(s * (1.3 + sway * 0.9), -s * 0.95);
  ctx.lineTo(s * (1.5 + sway), -s * 1.05);
  ctx.moveTo(s * (1.22 + sway * 1.2), -s * 1.28);
  ctx.lineTo(s * (1.42 + sway * 1.3), -s * 1.32);
  ctx.stroke();

  // 身体
  ellipsePath(ctx, 0, -s * 0.85, s * 0.88, s * 0.92);
  ctx.fillStyle = C.catBody;
  ctx.fill();
  ctx.strokeStyle = C.catLine;
  ctx.lineWidth = s * 0.07;
  ctx.stroke();
  fillEllipse(ctx, 0, -s * 0.72, s * 0.48, s * 0.62, C.catCream);
  // 身体两侧条纹
  ctx.strokeStyle = C.catStripe;
  ctx.lineWidth = s * 0.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.84, -s * 0.95);
    ctx.lineTo(side * s * 0.62, -s * 0.9);
    ctx.moveTo(side * s * 0.84, -s * 0.65);
    ctx.lineTo(side * s * 0.6, -s * 0.62);
    ctx.stroke();
  }

  // 前爪（右爪可以抬起来拍毛线）
  const pawUp = Math.sin(st.paw * Math.PI);
  drawPaw(ctx, -s * 0.32, -s * 0.1, s);
  drawPaw(ctx, s * 0.32 + pawUp * s * 0.25, -s * 0.1 - pawUp * s * 0.55, s);

  // 头
  const hy = -s * 2.0;
  for (const side of [-1, 1]) {
    // 耳朵
    const droop = st.mood === 'sad' ? 0.25 : 0;
    ctx.beginPath();
    ctx.moveTo(side * s * 0.95, hy - s * 0.15);
    ctx.lineTo(side * s * (0.98 + droop), hy - s * (1.05 - droop * 1.2));
    ctx.lineTo(side * s * 0.3, hy - s * 0.72);
    ctx.closePath();
    ctx.fillStyle = C.catBody;
    ctx.fill();
    ctx.strokeStyle = C.catLine;
    ctx.lineWidth = s * 0.07;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * s * 0.82, hy - s * 0.3);
    ctx.lineTo(side * s * (0.88 + droop * 0.9), hy - s * (0.88 - droop));
    ctx.lineTo(side * s * 0.45, hy - s * 0.66);
    ctx.closePath();
    ctx.fillStyle = C.catPink;
    ctx.fill();
  }
  ellipsePath(ctx, 0, hy, s * 1.05, s * 0.86);
  ctx.fillStyle = C.catBody;
  ctx.fill();
  ctx.strokeStyle = C.catLine;
  ctx.lineWidth = s * 0.07;
  ctx.stroke();
  // 嘴部白毛
  fillEllipse(ctx, 0, hy + s * 0.38, s * 0.5, s * 0.33, C.catCream);
  // 额头条纹
  ctx.strokeStyle = C.catStripe;
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, hy - s * 0.82);
  ctx.lineTo(0, hy - s * 0.55);
  ctx.moveTo(-s * 0.25, hy - s * 0.78);
  ctx.lineTo(-s * 0.2, hy - s * 0.56);
  ctx.moveTo(s * 0.25, hy - s * 0.78);
  ctx.lineTo(s * 0.2, hy - s * 0.56);
  // 脸颊条纹
  for (const side of [-1, 1]) {
    ctx.moveTo(side * s * 1.02, hy + s * 0.05);
    ctx.lineTo(side * s * 0.8, hy + s * 0.05);
    ctx.moveTo(side * s * 0.98, hy + s * 0.25);
    ctx.lineTo(side * s * 0.8, hy + s * 0.2);
  }
  ctx.stroke();

  // 腮红
  fillEllipse(ctx, -s * 0.62, hy + s * 0.28, s * 0.16, s * 0.1, 'rgba(247,140,160,0.45)');
  fillEllipse(ctx, s * 0.62, hy + s * 0.28, s * 0.16, s * 0.1, 'rgba(247,140,160,0.45)');

  // 眼睛
  const ex = s * 0.4;
  const ey = hy - s * 0.02;
  ctx.strokeStyle = C.catLine;
  ctx.lineWidth = s * 0.08;
  for (const side of [-1, 1]) {
    const cx = side * ex;
    if (st.mood === 'happy') {
      ctx.beginPath();
      ctx.arc(cx, ey + s * 0.06, s * 0.14, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (st.blink > 0.5) {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.13, ey);
      ctx.lineTo(cx + s * 0.13, ey);
      ctx.stroke();
    } else {
      const big = st.mood === 'surprised' ? 1.25 : 1;
      const ry = s * 0.17 * big * (1 - st.blink);
      fillEllipse(ctx, cx, ey, s * 0.13 * big, ry, '#3A2618');
      const px = cx + st.lookX * s * 0.04;
      const py = ey + st.lookY * s * 0.05;
      fillCircle(ctx, px - s * 0.04, py - s * 0.06, s * 0.05, '#FFFFFF');
      fillCircle(ctx, px + s * 0.04, py + s * 0.05, s * 0.025, 'rgba(255,255,255,0.8)');
      if (st.mood === 'sad') {
        // 委屈的眉毛
        ctx.beginPath();
        ctx.moveTo(cx - side * s * 0.16, ey - s * 0.3);
        ctx.lineTo(cx + side * s * 0.1, ey - s * 0.22);
        ctx.stroke();
      }
    }
  }

  // 鼻子和嘴
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, hy + s * 0.18);
  ctx.lineTo(s * 0.08, hy + s * 0.18);
  ctx.lineTo(0, hy + s * 0.27);
  ctx.closePath();
  ctx.fillStyle = C.catPink;
  ctx.fill();
  ctx.lineWidth = s * 0.06;
  ctx.strokeStyle = C.catLine;
  ctx.beginPath();
  if (st.mood === 'sad') {
    ctx.arc(0, hy + s * 0.5, s * 0.12, Math.PI * 1.2, Math.PI * 1.8);
  } else if (st.mood === 'surprised') {
    ellipsePath(ctx, 0, hy + s * 0.42, s * 0.07, s * 0.09);
  } else {
    ctx.moveTo(0, hy + s * 0.27);
    ctx.arc(-s * 0.1, hy + s * 0.29, s * 0.1, 0, Math.PI * 0.9);
    ctx.moveTo(0, hy + s * 0.27);
    ctx.arc(s * 0.1, hy + s * 0.29, s * 0.1, Math.PI, Math.PI * 0.1, true);
  }
  ctx.stroke();

  // 胡须
  ctx.strokeStyle = 'rgba(122,74,38,0.7)';
  ctx.lineWidth = s * 0.035;
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.45, hy + s * 0.3 + i * s * 0.07);
      ctx.lineTo(side * s * 1.25, hy + s * 0.25 + i * s * 0.16);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPaw(ctx: Ctx2D, x: number, y: number, s: number): void {
  ellipsePath(ctx, x, y, s * 0.24, s * 0.16);
  ctx.fillStyle = THEME.catCream;
  ctx.fill();
  ctx.strokeStyle = THEME.catLine;
  ctx.lineWidth = s * 0.06;
  ctx.stroke();
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.07, y + s * 0.02);
  ctx.lineTo(x - s * 0.07, y + s * 0.12);
  ctx.moveTo(x + s * 0.07, y + s * 0.02);
  ctx.lineTo(x + s * 0.07, y + s * 0.12);
  ctx.stroke();
}

/** 篮子里毛线球的摆放位置（相对篮口中心，单位 = 篮子宽度） */
const BALL_SLOTS: [number, number][] = [
  [-0.24, 0.02],
  [0.04, 0.04],
  [0.28, 0.0],
  [-0.1, -0.12],
  [0.17, -0.13],
  [-0.32, -0.1],
  [0.36, -0.14],
  [0.03, -0.25],
  [-0.22, -0.26],
  [0.26, -0.27],
];

export function basketBallPos(x: number, y: number, w: number, i: number): { x: number; y: number; r: number } {
  const [sx, sy] = BALL_SLOTS[i % BALL_SLOTS.length];
  return { x: x + sx * w, y: y + sy * w, r: w * 0.15 };
}

/** 编织篮，(x, y) 是篮口中心，balls 是已经收进来的毛线球颜色 */
export function drawBasket(ctx: Ctx2D, x: number, y: number, w: number, balls: string[]): void {
  const h = w * 0.5;
  const C = THEME;
  // 篮口后沿
  fillEllipse(ctx, x, y, w * 0.5, w * 0.12, C.basketDark);
  // 毛线球
  balls.forEach((color, i) => {
    const p = basketBallPos(x, y, w, i);
    drawYarnBall(ctx, p.x, p.y, p.r, color, i * 1.3);
  });
  // 篮身
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.4, y + h);
  ctx.quadraticCurveTo(x, y + h * 1.12, x - w * 0.4, y + h);
  ctx.closePath();
  ctx.fillStyle = C.basket;
  ctx.fill();
  ctx.clip();
  // 编织纹
  ctx.strokeStyle = C.basketDark;
  ctx.lineWidth = w * 0.025;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, y + (h * i) / 4);
    ctx.lineTo(x + w * 0.55, y + (h * i) / 4);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const bx = x - w * 0.5 + (w * (i + 0.5)) / 9;
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2) continue;
      roundRectPath(ctx, bx - w * 0.035, y + (h * j) / 4 + w * 0.02, w * 0.07, h / 4 - w * 0.04, w * 0.02);
      ctx.fillStyle = shade(C.basket, 0.15);
      ctx.fill();
    }
  }
  ctx.restore();
  // 篮口前沿
  ctx.beginPath();
  ctx.moveTo(x - w * 0.52, y);
  ctx.quadraticCurveTo(x, y + w * 0.14, x + w * 0.52, y);
  ctx.strokeStyle = C.basketDark;
  ctx.lineWidth = w * 0.07;
  ctx.lineCap = 'round';
  ctx.stroke();
}
