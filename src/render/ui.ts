import { Ctx2D } from '../platform/types';
import { THEME, shade } from './colors';
import { fillCircle, FONT, pawPrint, roundRectPath, text } from './shapes';

/** 可点击区域：每帧渲染时登记，触摸时检测 */
export interface HitButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onTap: () => void;
}

export function hit(b: HitButton, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function panel(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, fill = THEME.panel, stitch = true): void {
  roundRectPath(ctx, x, y + 4, w, h, r);
  ctx.fillStyle = 'rgba(200,120,90,0.16)';
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stitch) {
    ctx.save();
    roundRectPath(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4));
    ctx.setLineDash([4, 3.5]);
    ctx.strokeStyle = THEME.stitch;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

/** 带猫耳朵的面板 */
export function catEarPanel(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  for (const side of [0, 1]) {
    const ex = side ? x + w - r * 0.9 : x + r * 0.9;
    const dir = side ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(ex - dir * r * 0.55, y + 6);
    ctx.lineTo(ex + dir * r * 0.15, y - r * 0.75);
    ctx.lineTo(ex + dir * r * 0.75, y + 8);
    ctx.closePath();
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex - dir * r * 0.2, y + 4);
    ctx.lineTo(ex + dir * r * 0.15, y - r * 0.4);
    ctx.lineTo(ex + dir * r * 0.45, y + 5);
    ctx.closePath();
    ctx.fillStyle = THEME.catPink;
    ctx.fill();
  }
  panel(ctx, x, y, w, h, r);
}

/** 胶囊形大按钮 */
export function pillButton(ctx: Ctx2D, x: number, y: number, w: number, h: number, label: string, color: string, pressed: boolean): void {
  const dy = pressed ? 3 : 0;
  roundRectPath(ctx, x, y + 5, w, h, h / 2);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fill();
  roundRectPath(ctx, x, y + dy, w, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  roundRectPath(ctx, x + 6, y + dy + 4, w - 12, h * 0.38, h * 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  text(ctx, label, x + w / 2, y + dy + h / 2 + 1, h * 0.42, '#FFFFFF', { stroke: shade(color, -0.35), strokeW: 3 });
}

/** 圆形图标按钮 */
export function roundButton(ctx: Ctx2D, cx: number, cy: number, r: number, pressed: boolean, active = false): void {
  const dy = pressed ? 2.5 : 0;
  // 底座阴影 + 立体侧边
  fillCircle(ctx, cx, cy + 5, r, 'rgba(170,100,70,0.22)');
  fillCircle(ctx, cx, cy + 3, r, active ? '#F2B26A' : '#EED8BC');
  // 鼓面：上亮下暗
  const g = ctx.createLinearGradient(0, cy - r + dy, 0, cy + r + dy);
  g.addColorStop(0, active ? '#FFF1D9' : '#FFFFFF');
  g.addColorStop(1, active ? '#FFD49A' : '#FFF1E0');
  ctx.beginPath();
  ctx.arc(cx, cy + dy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // 缝线圈
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy + dy, r - 4, 0, Math.PI * 2);
  ctx.setLineDash([3.5, 3]);
  ctx.strokeStyle = active ? THEME.accent : THEME.stitch;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  // 高光
  ctx.beginPath();
  ctx.arc(cx, cy + dy, r - 1.5, Math.PI * 1.15, Math.PI * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 关卡进度条：每 5 关一组，过关打勾、当前关高亮、困难关标红 */
export function levelProgress(ctx: Ctx2D, cx: number, cy: number, current: number, hard: boolean[]): void {
  const start = Math.floor(current / 5) * 5;
  const end = Math.min(hard.length, start + 5);
  const n = end - start;
  const gap = 38;
  const x0 = cx - ((n - 1) / 2) * gap;
  ctx.strokeStyle = '#EED8BC';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, cy);
  ctx.lineTo(x0 + (n - 1) * gap, cy);
  ctx.stroke();
  for (let i = start; i < end; i++) {
    const x = x0 + (i - start) * gap;
    if (i < current) {
      fillCircle(ctx, x, cy + 1.5, 11, '#5FA84F');
      fillCircle(ctx, x, cy, 11, '#79C267');
      ctx.beginPath();
      ctx.moveTo(x - 5, cy);
      ctx.lineTo(x - 1.5, cy + 3.5);
      ctx.lineTo(x + 5, cy - 3.5);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.6;
      ctx.stroke();
    } else if (i === current) {
      fillCircle(ctx, x, cy + 2, 14, '#D9862B');
      fillCircle(ctx, x, cy, 14, '#F7B54A');
      fillCircle(ctx, x, cy, 10.5, '#FFE3A3');
      text(ctx, String(i + 1), x, cy + 0.5, 13, '#8A4F14');
    } else if (hard[i]) {
      roundRectPath(ctx, x - 17, cy - 9, 34, 18, 9);
      ctx.fillStyle = '#F07A6E';
      ctx.fill();
      text(ctx, '困难', x, cy + 0.5, 10.5, '#FFFFFF');
    } else {
      fillCircle(ctx, x, cy, 10, '#E4D2BC');
      text(ctx, String(i + 1), x, cy + 0.5, 11, '#A88E72');
    }
  }
}

export function badge(ctx: Ctx2D, cx: number, cy: number, label: string, color = THEME.danger): void {
  const r = 11;
  fillCircle(ctx, cx, cy, r, '#FFFFFF');
  fillCircle(ctx, cx, cy, r - 2, color);
  text(ctx, label, cx, cy + 0.5, 12, '#FFFFFF');
}

export function iconRestart(ctx: Ctx2D, cx: number, cy: number, s: number, color = THEME.text): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.5, -Math.PI * 0.35, Math.PI * 1.35);
  ctx.stroke();
  const a = -Math.PI * 0.35;
  const tx = cx + Math.cos(a) * s * 0.5;
  const ty = cy + Math.sin(a) * s * 0.5;
  ctx.beginPath();
  ctx.moveTo(tx + s * 0.22, ty - s * 0.12);
  ctx.lineTo(tx - s * 0.06, ty - s * 0.3);
  ctx.lineTo(tx - s * 0.04, ty + s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function iconHome(ctx: Ctx2D, cx: number, cy: number, s: number, color = THEME.text): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.58, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.4, cy - s * 0.02);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.48);
  ctx.lineTo(cx + s * 0.12, cy + s * 0.48);
  ctx.lineTo(cx + s * 0.12, cy + s * 0.18);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.18);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.48);
  ctx.lineTo(cx - s * 0.4, cy + s * 0.48);
  ctx.lineTo(cx - s * 0.4, cy - s * 0.02);
  ctx.lineTo(cx - s * 0.58, cy - s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function iconScissors(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.lineCap = 'round';
  // 刀刃
  ctx.fillStyle = '#C9D3DD';
  ctx.strokeStyle = '#7D8B99';
  ctx.lineWidth = s * 0.05;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(side * s * 0.1, -s * 0.62);
    ctx.lineTo(side * s * 0.02, -s * 0.66);
    ctx.lineTo(-side * s * 0.06, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 手柄
  ctx.lineWidth = s * 0.13;
  ctx.strokeStyle = '#E8605A';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * s * 0.2, s * 0.32, s * 0.17, 0, Math.PI * 2);
    ctx.stroke();
  }
  fillCircle(ctx, 0, 0, s * 0.06, '#7D8B99');
  ctx.restore();
}

/** 加步数道具：猫爪 + "+5" */
export function iconSteps(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  pawPrint(ctx, cx - s * 0.12, cy + s * 0.05, s * 0.42, THEME.accent, -0.2);
  text(ctx, '+5', cx + s * 0.25, cy - s * 0.25, s * 0.38, THEME.text, { stroke: '#FFFFFF', strokeW: 4 });
}

/** 猫咪的对话气泡，尖角指向右侧；放不下时自动换行 */
export function speechBubble(ctx: Ctx2D, right: number, cy: number, msg: string, alpha: number): void {
  if (alpha <= 0 || !msg) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = 14;
  ctx.font = `bold ${size}px ${FONT}`;
  const maxW = right - 12 - 24;
  const lines: string[] = [];
  let line = '';
  for (const ch of msg) {
    // 标点不放行首
    if (line && ctx.measureText(line + ch).width > maxW && !'，。！？～…、'.includes(ch)) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  lines.push(line);
  const w = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) + 24;
  const lh = size * 1.35;
  const h = lines.length * lh + 16;
  const x = right - w;
  const y = cy - h / 2;
  roundRectPath(ctx, x, y + 3, w, h, 14);
  ctx.fillStyle = 'rgba(120,80,40,0.14)';
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(right - 2, cy - 6);
  ctx.lineTo(right + 9, cy + 2);
  ctx.lineTo(right - 2, cy + 7);
  ctx.closePath();
  ctx.fill();
  lines.forEach((ln, i) => text(ctx, ln, x + w / 2, y + 8 + lh * (i + 0.5) + 1, size, THEME.text));
  ctx.restore();
}
