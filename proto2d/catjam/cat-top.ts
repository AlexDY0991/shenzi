// 俯视角的猫（全部用代码画）。局部坐标里猫脸朝 +x，原点在猫占的格子中心。
import { Ctx2D } from '../../src/platform/types';
import { shade } from '../../src/render/colors';
import { ellipsePath, fillCircle, fillEllipse, star } from '../../src/render/shapes';

export interface Fur {
  name: string;
  base: string;
  stripe?: string;
  patches?: string[];
  /** 暹罗猫的深色脸 / 耳朵 / 尾巴 */
  point?: string;
  eye: string;
}

export const FURS: Fur[] = [
  { name: '橘猫', base: '#F4A259', stripe: '#DD8333', eye: '#4A3328' },
  { name: '蓝猫', base: '#A8B3C5', stripe: '#8693AA', eye: '#3B3A48' },
  { name: '黑猫', base: '#4D4852', eye: '#E8CF4F' },
  { name: '白猫', base: '#FBF7F0', eye: '#4A3A35' },
  { name: '三花', base: '#FBF7F0', patches: ['#F4A259', '#4D4852'], eye: '#4A3A35' },
  { name: '奶油', base: '#F3DDB8', stripe: '#E2BD88', eye: '#4A3328' },
  { name: '暹罗', base: '#F3E9DA', point: '#6E5546', eye: '#4F8FD8' },
];

export type Mood = 'idle' | 'happy' | 'dizzy' | 'angry';

export interface CatPose {
  /** 0~1 眨眼 */
  blink: number;
  /** 尾巴摆动相位 */
  tail: number;
  /** 走路的步伐相位；walk 0~1 表示在走路的程度 */
  gait: number;
  walk: number;
  /** 正数：沿身体方向压扁（撞头）；负数：拉长 */
  squash: number;
  mood: Mood;
  /** 晕眩小星星的转动相位 */
  spin: number;
  seed: number;
}

/** 画一只俯视的猫。s 是格子大小，len 是占几格 */
export function drawCatTop(ctx: Ctx2D, cx: number, cy: number, dir: number, s: number, len: number, fur: Fur, p: CatPose): void {
  const L = len * s;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((dir * Math.PI) / 2);
  const sq = p.squash;
  ctx.scale(1 - sq, 1 + sq * 0.7);
  const line = shade(fur.base, -0.32);
  const fat = len > 1;
  const bob = Math.sin(p.gait * 2) * 0.025 * s * p.walk;
  const wig = Math.sin(p.gait) * 0.05 * p.walk;

  // 影子
  fillEllipse(ctx, -s * 0.02, s * 0.06, L / 2 - s * 0.06, s * (fat ? 0.44 : 0.38), 'rgba(120,70,30,0.16)');

  // 尾巴：趴着时绕在身体一侧，走路时翘在后面摆
  const sway = Math.sin(p.tail) * 0.5;
  const back = -L / 2 + s * 0.16;
  const side = p.seed % 2 ? 1 : -1;
  const idleEnd = { x: back + s * 0.55, y: side * s * (fat ? 0.5 : 0.44) };
  const walkEnd = { x: back - s * 0.42, y: sway * s * 0.32 };
  const ex = idleEnd.x + (walkEnd.x - idleEnd.x) * p.walk;
  const ey = idleEnd.y + (walkEnd.y - idleEnd.y) * p.walk + (1 - p.walk) * sway * s * 0.06;
  const c1x = back - s * 0.3 + p.walk * s * 0.05;
  const c1y = side * s * 0.34 * (1 - p.walk) + sway * s * 0.2 * p.walk;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(back + s * 0.06, 0);
  ctx.quadraticCurveTo(c1x, c1y, ex, ey);
  ctx.strokeStyle = line;
  ctx.lineWidth = s * 0.17;
  ctx.stroke();
  ctx.strokeStyle = fur.point ?? fur.base;
  ctx.lineWidth = s * 0.12;
  ctx.stroke();
  if (fur.stripe) {
    ctx.save();
    ctx.setLineDash([s * 0.06, s * 0.08]);
    ctx.strokeStyle = fur.stripe;
    ctx.lineWidth = s * 0.12;
    ctx.stroke();
    ctx.restore();
  }

  // 脚：走路时前后交替露出来
  if (p.walk > 0.05) {
    const ry = s * (fat ? 0.36 : 0.3);
    for (const k of [-1, 1]) {
      const ph = Math.sin(p.gait + (k > 0 ? 0 : Math.PI));
      const fx = L / 2 - s * 0.5 + ph * s * 0.12;
      const bx = -L / 2 + s * 0.3 - ph * s * 0.12;
      fillEllipse(ctx, fx, k * ry, s * 0.09, s * 0.07, shade(fur.base, -0.05, p.walk));
      fillEllipse(ctx, bx, k * ry, s * 0.09, s * 0.07, shade(fur.base, -0.05, p.walk));
    }
  }

  // 身体
  ctx.save();
  ctx.rotate(wig * 0.4);
  const bx = -s * 0.1;
  const brx = L / 2 - s * 0.18;
  const bry = s * (fat ? 0.42 : 0.33);
  ellipsePath(ctx, bx, bob, brx, bry);
  ctx.fillStyle = fur.base;
  ctx.fill();
  ctx.save();
  ellipsePath(ctx, bx, bob, brx, bry);
  ctx.clip();
  if (fur.stripe) {
    ctx.strokeStyle = fur.stripe;
    ctx.lineWidth = s * 0.07;
    const n = fat ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const x = bx - brx * 0.55 + (i * brx * 1.1) / Math.max(1, n - 1);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.05, -bry);
      ctx.quadraticCurveTo(x + s * 0.06, 0, x - s * 0.05, bry);
      ctx.stroke();
    }
    // 背脊线
    ctx.beginPath();
    ctx.moveTo(bx - brx * 0.85, 0);
    ctx.lineTo(bx + brx * 0.6, 0);
    ctx.lineWidth = s * 0.05;
    ctx.stroke();
  }
  if (fur.patches) {
    fillEllipse(ctx, bx - brx * 0.4, -bry * 0.45, brx * 0.42, bry * 0.55, fur.patches[0], 0.3);
    fillEllipse(ctx, bx + brx * 0.35, bry * 0.5, brx * 0.32, bry * 0.45, fur.patches[1], -0.4);
  }
  // 背上的高光
  fillEllipse(ctx, bx - brx * 0.1, -bry * 0.35, brx * 0.55, bry * 0.28, 'rgba(255,255,255,0.18)');
  ctx.restore();
  ellipsePath(ctx, bx, bob, brx, bry);
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.stroke();
  ctx.restore();

  // 头
  const hr = s * (fat ? 0.33 : 0.3);
  const hx = L / 2 - hr - s * 0.06;
  const hy = bob * 0.5;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-wig * 0.6);
  // 耳朵
  for (const k of [-1, 1]) {
    const a0 = k * (Math.PI / 2 - 0.15);
    const a1 = k * (Math.PI / 2 - 1.05);
    const at = k * (Math.PI / 2 - 0.55);
    const tip = hr * 1.42;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * hr * 0.92, Math.sin(a0) * hr * 0.92);
    ctx.lineTo(Math.cos(at) * tip, Math.sin(at) * tip);
    ctx.lineTo(Math.cos(a1) * hr * 0.92, Math.sin(a1) * hr * 0.92);
    ctx.closePath();
    ctx.fillStyle = fur.point ?? (fur.patches && k < 0 ? fur.patches[0] : fur.base);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0 - k * 0.12) * hr * 0.95, Math.sin(a0 - k * 0.12) * hr * 0.95);
    ctx.lineTo(Math.cos(at) * tip * 0.86, Math.sin(at) * tip * 0.86);
    ctx.lineTo(Math.cos(a1 + k * 0.12) * hr * 0.95, Math.sin(a1 + k * 0.12) * hr * 0.95);
    ctx.closePath();
    ctx.fillStyle = '#F7B6C2';
    ctx.fill();
  }
  fillCircle(ctx, 0, 0, hr, fur.base);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  ctx.clip();
  if (fur.point) fillEllipse(ctx, hr * 0.62, 0, hr * 0.62, hr * 0.58, fur.point);
  if (fur.patches) fillEllipse(ctx, -hr * 0.3, -hr * 0.55, hr * 0.7, hr * 0.5, fur.patches[1]);
  if (fur.stripe) {
    ctx.strokeStyle = fur.stripe;
    ctx.lineWidth = s * 0.05;
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(-hr * 0.6, k * hr * 0.22);
      ctx.lineTo(-hr * 0.05, k * hr * 0.16);
      ctx.stroke();
    }
  }
  fillEllipse(ctx, -hr * 0.25, -hr * 0.3, hr * 0.5, hr * 0.28, 'rgba(255,255,255,0.22)');
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.stroke();

  // 脸（朝 +x）
  const eyeX = hr * 0.4;
  const eyeY = hr * 0.38;
  const er = hr * 0.17;
  const dark = fur.eye;
  ctx.lineCap = 'round';
  if (p.mood === 'happy') {
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(eyeX, k * eyeY, er * 0.9, Math.PI * 0.5 + 0.5, Math.PI * 1.5 - 0.5);
      ctx.strokeStyle = '#3B2A22';
      ctx.lineWidth = Math.max(1.4, s * 0.035);
      ctx.stroke();
    }
  } else if (p.mood === 'dizzy') {
    for (const k of [-1, 1]) {
      ctx.strokeStyle = '#3B2A22';
      ctx.lineWidth = Math.max(1.4, s * 0.035);
      const ox = eyeX;
      const oy = k * eyeY;
      ctx.beginPath();
      ctx.moveTo(ox - er, oy - er * k);
      ctx.lineTo(ox + er * 0.2, oy);
      ctx.lineTo(ox - er, oy + er * k);
      ctx.stroke();
    }
  } else {
    const open = 1 - p.blink;
    for (const k of [-1, 1]) {
      if (open < 0.25) {
        ctx.beginPath();
        ctx.moveTo(eyeX, k * eyeY - er);
        ctx.lineTo(eyeX, k * eyeY + er);
        ctx.strokeStyle = '#3B2A22';
        ctx.lineWidth = Math.max(1.4, s * 0.035);
        ctx.stroke();
      } else {
        fillEllipse(ctx, eyeX, k * eyeY, er * (p.mood === 'angry' ? 0.55 : 1) * Math.max(0.3, open), er * 1.05, dark === '#4A3328' || dark === '#4A3A35' || dark === '#3B3A48' ? dark : '#2B2230');
        if (dark !== '#4A3328' && dark !== '#4A3A35' && dark !== '#3B3A48') fillEllipse(ctx, eyeX, k * eyeY, er * 0.7 * open, er * 0.85, dark);
        fillCircle(ctx, eyeX + er * 0.3, k * eyeY - er * 0.35, er * 0.35, '#FFFFFF');
        if (p.mood === 'angry') {
          ctx.beginPath();
          ctx.moveTo(eyeX - er * 1.3, k * eyeY - k * er * 1.5);
          ctx.lineTo(eyeX + er * 0.9, k * eyeY - k * er * 0.6);
          ctx.strokeStyle = '#3B2A22';
          ctx.lineWidth = Math.max(1.4, s * 0.035);
          ctx.stroke();
        }
      }
    }
  }
  // 鼻子 + 胡子
  ctx.beginPath();
  ctx.moveTo(hr * 0.92, 0);
  ctx.lineTo(hr * 0.7, -hr * 0.13);
  ctx.lineTo(hr * 0.7, hr * 0.13);
  ctx.closePath();
  ctx.fillStyle = '#F08BA0';
  ctx.fill();
  ctx.strokeStyle = shade(fur.base, -0.45, 0.55);
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  for (const k of [-1, 1]) {
    for (const j of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hr * 0.68, k * hr * 0.32);
      ctx.lineTo(hr * 1.05 + j * hr * 0.02, k * (hr * 0.62 + j * hr * 0.16));
      ctx.stroke();
    }
  }
  ctx.restore();

  // 撞晕了：头上转圈的小星星
  if (p.mood === 'dizzy') {
    for (let i = 0; i < 3; i++) {
      const a = p.spin + (i * Math.PI * 2) / 3;
      star(ctx, hx + Math.cos(a) * hr * 0.9, Math.sin(a) * hr * 0.9, s * 0.09, '#F7C24A', '#D9962B');
    }
  }
  // 生气：头边一个红色的“井”字青筋
  if (p.mood === 'angry') {
    ctx.save();
    ctx.translate(hx - hr * 0.2, -hr * 1.05);
    ctx.rotate(-(dir * Math.PI) / 2);
    ctx.strokeStyle = '#E8475A';
    ctx.lineWidth = Math.max(1.6, s * 0.045);
    const v = s * 0.09;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * v * 0.45, -v);
      ctx.quadraticCurveTo(k * v * 0.1, 0, k * v * 0.45, v);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-v, k * v * 0.45);
      ctx.quadraticCurveTo(0, k * v * 0.1, v, k * v * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
