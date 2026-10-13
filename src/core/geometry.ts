// 纯几何计算：所有坐标都是"网格单位"（相邻孔距离 = 1），与屏幕尺寸无关。

export interface Vec {
  x: number;
  y: number;
}

/** 毛线自然下垂：二次贝塞尔控制点向下偏移，越水平越垂 */
export function sagOffset(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(bx - ax);
  const len = Math.hypot(bx - ax, by - ay);
  return 0.12 * dx + 0.03 * len;
}

export const CURVE_SEGMENTS = 14;

/** 毛线曲线的采样点（含两端），渲染和交叉判断共用同一条曲线 */
export function ropeCurve(ax: number, ay: number, bx: number, by: number, n = CURVE_SEGMENTS): Vec[] {
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2 + sagOffset(ax, ay, bx, by);
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * ax + 2 * u * t * cx + t * t * bx,
      y: u * u * ay + 2 * u * t * cy + t * t * by,
    });
  }
  return pts;
}

function orient(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 线段严格相交（端点共线的退化情况交给"压钉子"判断处理） */
export function segmentsIntersect(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** 两条线段的交点（严格相交时），否则 null */
export function segmentIntersection(p1: Vec, p2: Vec, p3: Vec, p4: Vec): Vec | null {
  if (!segmentsIntersect(p1, p2, p3, p4)) return null;
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

/** 两根毛线贴得比这个更近就视为重叠（约等于毛线粗细，网格单位） */
export const ROPE_TOUCH = 0.12;

export function polylinesTouch(a: Vec[], b: Vec[], eps = ROPE_TOUCH): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    const a1 = a[i];
    const a2 = a[i + 1];
    for (let j = 0; j < b.length - 1; j++) {
      const b1 = b[j];
      const b2 = b[j + 1];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
      if (
        Math.min(distToSegment(a1, b1, b2), distToSegment(a2, b1, b2), distToSegment(b1, a1, a2), distToSegment(b2, a1, a2)) < eps
      )
        return true;
    }
  }
  return false;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export function distToPolyline(p: Vec, line: Vec[]): number {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, distToSegment(p, line[i], line[i + 1]));
  return d;
}

/** 毛线压到别人纽扣上的判定半径（纽扣半径 + 毛线半宽，网格单位） */
export const PIN_BLOCK_R = 0.3;

/** 两根毛线是否缠在一起：曲线相交，或者一根压在另一根的纽扣上 */
export function curvesTangled(a: Vec[], b: Vec[]): boolean {
  const aEnds = [a[0], a[a.length - 1]];
  const bEnds = [b[0], b[b.length - 1]];
  for (const p of bEnds) if (distToPolyline(p, a) < PIN_BLOCK_R) return true;
  for (const p of aEnds) if (distToPolyline(p, b) < PIN_BLOCK_R) return true;
  return polylinesTouch(a, b);
}
