import { BoardGeo } from '../core/puzzle';
import { Ctx2D } from '../platform/types';
import { THEME } from './colors';
import { heart, pawPrint, roundRectPath } from './shapes';

export interface BoardLayout {
  /** 孔 (0,0) 的屏幕坐标 */
  x0: number;
  y0: number;
  cell: number;
}

export function toScreen(l: BoardLayout, gx: number, gy: number): { x: number; y: number } {
  return { x: l.x0 + gx * l.cell, y: l.y0 + gy * l.cell };
}

/** 背景：粉到奶油色的渐变 + 淡淡的猫爪印和小爱心 */
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
}

/** 棋盘：每个孔一块圆角方格拼成整体形状（猫头、爪子等），上面是针织纹和孔位 */
export function drawBoard(ctx: Ctx2D, geo: BoardGeo, l: BoardLayout): void {
  const c = l.cell;
  const pad = c * 0.5;
  const cells: { x: number; y: number }[] = [];
  for (let h = 0; h < geo.holeCount; h++) {
    if (!geo.holes[h]) continue;
    const p = geo.pos(h);
    cells.push(toScreen(l, p.x, p.y));
  }
  const has = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < geo.cols && gy < geo.rows && geo.holes[gy * geo.cols + gx];
  /** 圆角格子 + 相邻格子之间补直边，拼成一整块没有缝隙的形状 */
  const fillShape = (grow: number, dy: number, color: string, radius: number) => {
    ctx.fillStyle = color;
    for (let h = 0; h < geo.holeCount; h++) {
      if (!geo.holes[h]) continue;
      const g = geo.pos(h);
      const p = toScreen(l, g.x, g.y);
      const x = p.x - pad - grow;
      const y = p.y - pad - grow + dy;
      const size = c + grow * 2;
      roundRectPath(ctx, x, y, size, size, radius);
      ctx.fill();
      if (has(g.x + 1, g.y)) ctx.fillRect(p.x, y, c, size);
      if (has(g.x, g.y + 1)) ctx.fillRect(x, p.y + dy, size, c);
    }
  };
  fillShape(5, 4, '#EBD3B0', c * 0.34);
  fillShape(5, 0, THEME.boardEdge, c * 0.34);
  fillShape(1, 0, THEME.board, c * 0.3);
  // 缝线外框：沿着形状外缘一圈虚线（只画没有邻格的边）
  ctx.save();
  ctx.strokeStyle = THEME.stitch;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.lineCap = 'round';
  const inset = c * 0.08;
  const half = pad - inset;
  const rr = c * 0.22;
  for (let h = 0; h < geo.holeCount; h++) {
    if (!geo.holes[h]) continue;
    const g = geo.pos(h);
    const p = toScreen(l, g.x, g.y);
    const up = !has(g.x, g.y - 1);
    const down = !has(g.x, g.y + 1);
    const left = !has(g.x - 1, g.y);
    const right = !has(g.x + 1, g.y);
    ctx.beginPath();
    if (up) {
      ctx.moveTo(p.x - (left ? half - rr : pad), p.y - half);
      ctx.lineTo(p.x + (right ? half - rr : pad), p.y - half);
    }
    if (down) {
      ctx.moveTo(p.x - (left ? half - rr : pad), p.y + half);
      ctx.lineTo(p.x + (right ? half - rr : pad), p.y + half);
    }
    if (left) {
      ctx.moveTo(p.x - half, p.y - (up ? half - rr : pad));
      ctx.lineTo(p.x - half, p.y + (down ? half - rr : pad));
    }
    if (right) {
      ctx.moveTo(p.x + half, p.y - (up ? half - rr : pad));
      ctx.lineTo(p.x + half, p.y + (down ? half - rr : pad));
    }
    ctx.stroke();
    // 外凸的圆角
    const corners: [boolean, number, number, number][] = [
      [up && left, -1, -1, Math.PI],
      [up && right, 1, -1, Math.PI * 1.5],
      [down && right, 1, 1, 0],
      [down && left, -1, 1, Math.PI * 0.5],
    ];
    for (const [on, sx, sy, a0] of corners) {
      if (!on) continue;
      ctx.beginPath();
      ctx.arc(p.x + sx * (half - rr), p.y + sy * (half - rr), rr, a0, a0 + Math.PI / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  // 针织纹：一排排小 "V"
  ctx.strokeStyle = THEME.boardKnit;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const k = c / 5;
  for (const p of cells) {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const vx = p.x - pad + (i + 0.5) * k;
        const vy = p.y - pad + (j + 0.5) * k;
        ctx.beginPath();
        ctx.moveTo(vx - k * 0.3, vy - k * 0.25);
        ctx.lineTo(vx, vy + k * 0.25);
        ctx.lineTo(vx + k * 0.3, vy - k * 0.25);
        ctx.stroke();
      }
    }
  }
  // 孔位：凹陷 + 缝线圈
  const r = c * 0.25;
  for (const p of cells) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.38, 0, Math.PI * 2);
    ctx.setLineDash([3, 3.5]);
    ctx.strokeStyle = THEME.holeStitch;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.hole;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y + 1, r - 1.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = THEME.holeDeep;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, Math.PI * 0.2, Math.PI * 0.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
