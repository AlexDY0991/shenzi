import { Vec } from '../core/geometry';

// 毛线物理（只负责表现，规则判定仍以两孔之间的直线为准）
// Verlet 积分 + 距离约束；坐标为棋盘单位。

const N = 22;
/** 自然长度比两端距离略长一点，毛线才有松弛感 */
const SLACK = 1.03;

interface P {
  x: number;
  y: number;
  px: number;
  py: number;
}

export class RopeSim {
  readonly pts: P[] = [];
  /** 自然长度（单位） */
  rest: number;
  /** 拖动中：自然长度不再变长，被拉远时毛线会变细 */
  holdRest = false;
  private ax: number;
  private ay: number;
  private bx: number;
  private by: number;

  constructor(ax: number, ay: number, bx: number, by: number) {
    this.ax = ax;
    this.ay = ay;
    this.bx = bx;
    this.by = by;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      this.pts.push({ x, y, px: x, py: y });
    }
    this.rest = Math.hypot(bx - ax, by - ay) * SLACK;
  }

  setEnds(ax: number, ay: number, bx: number, by: number): void {
    this.ax = ax;
    this.ay = ay;
    this.bx = bx;
    this.by = by;
  }

  get mid(): Vec {
    return this.pts[N >> 1];
  }

  /** 当前长度 / 自然长度，> 1 表示被拉长 */
  get stretch(): number {
    let len = 0;
    for (let i = 1; i < N; i++) len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y);
    return len / Math.max(0.01, this.rest);
  }

  /** 拨一下：给中段一个垂直于毛线方向的速度（落孔时"嘣"地抖动） */
  pluck(strength: number): void {
    const dx = this.bx - this.ax;
    const dy = this.by - this.ay;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    for (let i = 1; i < N - 1; i++) {
      const k = Math.sin((i / (N - 1)) * Math.PI) * strength;
      this.pts[i].px -= nx * k;
      this.pts[i].py -= ny * k;
    }
  }

  /** 端点参数 t（0~1）处的质点下标 */
  indexAt(t: number): number {
    return Math.max(1, Math.min(N - 2, Math.round(t * (N - 1))));
  }

  step(dt: number): void {
    const d = Math.hypot(this.bx - this.ax, this.by - this.ay);
    // 拖动中自然长度只缩不长：拖远会被拉长变细，拖近不会皱成一团
    const want = d * SLACK;
    if (!this.holdRest || want < this.rest) this.rest += (want - this.rest) * Math.min(1, dt * (this.holdRest ? 12 : 6));
    const seg = this.rest / (N - 1);
    const damp = 0.86;
    const pts = this.pts;
    for (let i = 1; i < N - 1; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * damp;
      const vy = (p.y - p.py) * damp;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
      // 轻微拉向两端连线，保持画面和判定基本一致
      const t = i / (N - 1);
      p.x += (this.ax + (this.bx - this.ax) * t - p.x) * 0.035;
      p.y += (this.ay + (this.by - this.ay) * t - p.y) * 0.035;
    }
    this.pin();
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < N - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        // 拉长时较硬，压缩时很软（毛线可以弯，不能撑）
        const stiff = dist > seg ? 0.5 : 0.08;
        const diff = ((dist - seg) / dist) * stiff * 0.5;
        const ox = dx * diff;
        const oy = dy * diff;
        if (i > 0) {
          a.x += ox;
          a.y += oy;
        }
        if (i + 1 < N - 1) {
          b.x -= ox;
          b.y -= oy;
        }
      }
      this.pin();
    }
  }

  private pin(): void {
    const a = this.pts[0];
    const b = this.pts[N - 1];
    a.x = a.px = this.ax;
    a.y = a.py = this.ay;
    b.x = b.px = this.bx;
    b.y = b.py = this.by;
  }

  /** 平滑后的折线（Catmull-Rom 细分），用于绘制 */
  smooth(): Vec[] {
    const p = this.pts;
    const out: Vec[] = [];
    for (let i = 0; i < N - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(N - 1, i + 2)];
      for (let k = 0; k < 2; k++) {
        const t = k / 2;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push({ x: p[N - 1].x, y: p[N - 1].y });
    return out;
  }
}

/**
 * 环扣：两根毛线在交叉处互相勾住。每帧把两根毛线上对应的质点拉到一起，
 * 拖动一根时会扯动另一根；交叉消失（勾子滑脱）时另一根自然弹回。
 */
export function applyLink(a: RopeSim, ia: number, b: RopeSim, ib: number, aWeight = 0.5): Vec {
  const pa = a.pts[ia];
  const pb = b.pts[ib];
  const mx = pa.x * (1 - aWeight) + pb.x * aWeight;
  const my = pa.y * (1 - aWeight) + pb.y * aWeight;
  const k = 0.35;
  pa.x += (mx - pa.x) * k;
  pa.y += (my - pa.y) * k;
  pb.x += (mx - pb.x) * k;
  pb.y += (my - pb.y) * k;
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}
