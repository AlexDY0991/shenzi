// 3D 毛线物理（位置约束动力学 PBD）。坐标：x / z 为棋盘平面（单位 = 相邻孔距），y 向上。
// 物理优先：是否缠着直接看物理上有没有接触到别的毛线或别人的纽扣。

export const R = 0.105; // 毛线半径
export const PIN_R = 0.25; // 纽扣半径
export const PIN_TOP = 0.17; // 纽扣顶面高度
export const ATTACH_Y = 0.05; // 毛线接在纽扣中心偏下，绳头藏在纽扣里
const SEG = 0.12; // 质点间距
const GRAVITY = 28;

export interface Pin {
  x: number;
  y: number;
  z: number;
  rope: number;
  end: 0 | 1;
}

export class Rope3 {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly oz: Float32Array;
  /** 自然总长度 */
  rest: number;
  holdRest = false;
  alive = true;

  constructor(
    readonly id: number,
    readonly color: number,
    readonly pins: [Pin, Pin],
    startHeight: number,
  ) {
    const [a, b] = pins;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    this.n = Math.max(12, Math.min(64, Math.round((d * 1.4) / SEG) + 4));
    this.x = new Float32Array(this.n);
    this.y = new Float32Array(this.n);
    this.z = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      this.x[i] = a.x + (b.x - a.x) * t;
      this.z[i] = a.z + (b.z - a.z) * t;
      this.y[i] = startHeight;
    }
    this.ox = this.x.slice();
    this.oy = this.y.slice();
    this.oz = this.z.slice();
    this.rest = d * 1.01 + 0.02;
  }

  get segRest(): number {
    return this.rest / (this.n - 1);
  }

  /** 拨一下：让毛线中段弹起来抖动 */
  pluck(strength: number): void {
    for (let i = 1; i < this.n - 1; i++) {
      const k = Math.sin((i / (this.n - 1)) * Math.PI) * strength;
      this.oy[i] -= k;
    }
  }

  length(): number {
    let l = 0;
    for (let i = 1; i < this.n; i++) l += Math.hypot(this.x[i] - this.x[i - 1], this.y[i] - this.y[i - 1], this.z[i] - this.z[i - 1]);
    return l;
  }

  stretch(): number {
    return this.length() / Math.max(0.01, this.rest);
  }
}

export class RopeWorld {
  ropes: Rope3[] = [];

  /** 所有纽扣（包括已消除毛线的，已消除的不参与碰撞） */
  private pinsOf(skip: Rope3 | null): Pin[] {
    const out: Pin[] = [];
    for (const r of this.ropes) if (r.alive && r !== skip) out.push(r.pins[0], r.pins[1]);
    return out;
  }

  step(dt: number): void {
    const ropes = this.ropes.filter((r) => r.alive);
    const g = GRAVITY * dt * dt;
    for (const r of ropes) {
      // 自然长度：跟随两端距离慢慢变化（拖动中只缩不长，拉远时毛线绷紧变细）
      const [a, b] = r.pins;
      const want = Math.hypot(b.x - a.x, b.z - a.z) * 1.01 + 0.02;
      if (!r.holdRest || want < r.rest) r.rest += (want - r.rest) * Math.min(1, dt * (r.holdRest ? 12 : 4));
      for (let i = 1; i < r.n - 1; i++) {
        const vx = (r.x[i] - r.ox[i]) * 0.985;
        const vy = (r.y[i] - r.oy[i]) * 0.985;
        const vz = (r.z[i] - r.oz[i]) * 0.985;
        r.ox[i] = r.x[i];
        r.oy[i] = r.y[i];
        r.oz[i] = r.z[i];
        r.x[i] += vx;
        r.y[i] += vy - g;
        r.z[i] += vz;
      }
      this.pinEnds(r);
    }
    for (let it = 0; it < 20; it++) {
      for (const r of ropes) this.solveRope(r);
      this.solveCollisions(ropes);
      for (const r of ropes) this.pinEnds(r);
    }
    // 贴地摩擦：落在布垫上的部分不会一直滑
    for (const r of ropes) {
      for (let i = 1; i < r.n - 1; i++) {
        if (r.y[i] <= R + 0.004) {
          r.ox[i] += (r.x[i] - r.ox[i]) * 0.35;
          r.oz[i] += (r.z[i] - r.oz[i]) * 0.35;
        }
      }
    }
  }

  private pinEnds(r: Rope3): void {
    const [a, b] = r.pins;
    const last = r.n - 1;
    r.x[0] = r.ox[0] = a.x;
    r.y[0] = r.oy[0] = a.y + ATTACH_Y;
    r.z[0] = r.oz[0] = a.z;
    r.x[last] = r.ox[last] = b.x;
    r.y[last] = r.oy[last] = b.y + ATTACH_Y;
    r.z[last] = r.oz[last] = b.z;
  }

  private solveRope(r: Rope3): void {
    const seg = r.segRest;
    const last = r.n - 1;
    for (let i = 0; i < last; i++) {
      const dx = r.x[i + 1] - r.x[i];
      const dy = r.y[i + 1] - r.y[i];
      const dz = r.z[i + 1] - r.z[i];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const diff = ((d - seg) / d) * (d > seg ? 0.5 : 0.25);
      const wa = i === 0 ? 0 : 1;
      const wb = i + 1 === last ? 0 : 1;
      const w = wa + wb || 1;
      r.x[i] += (dx * diff * wa * 2) / w;
      r.y[i] += (dy * diff * wa * 2) / w;
      r.z[i] += (dz * diff * wa * 2) / w;
      r.x[i + 1] -= (dx * diff * wb * 2) / w;
      r.y[i + 1] -= (dy * diff * wb * 2) / w;
      r.z[i + 1] -= (dz * diff * wb * 2) / w;
    }
    // 弯曲刚度：隔一个质点保持距离，毛线不会折成尖角
    for (let i = 1; i < last - 1; i++) {
      const dx = r.x[i + 1] - r.x[i - 1];
      const dy = r.y[i + 1] - r.y[i - 1];
      const dz = r.z[i + 1] - r.z[i - 1];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const target = seg * 1.75;
      if (d >= target) continue;
      const diff = ((d - target) / d) * 0.12;
      if (i - 1 > 0) {
        r.x[i - 1] += dx * diff;
        r.y[i - 1] += dy * diff;
        r.z[i - 1] += dz * diff;
      }
      if (i + 1 < last) {
        r.x[i + 1] -= dx * diff;
        r.y[i + 1] -= dy * diff;
        r.z[i + 1] -= dz * diff;
      }
    }
    // 地面
    for (let i = 1; i < last; i++) if (r.y[i] < R) r.y[i] = R;
  }

  private solveCollisions(ropes: Rope3[]): void {
    const D = R * 2.1;
    // 毛线之间
    for (let a = 0; a < ropes.length; a++) {
      const A = ropes[a];
      for (let b = a + 1; b < ropes.length; b++) {
        const B = ropes[b];
        for (let i = 1; i < A.n - 1; i++) {
          for (let j = 1; j < B.n - 1; j++) {
            const dx = B.x[j] - A.x[i];
            if (dx > D || dx < -D) continue;
            const dz = B.z[j] - A.z[i];
            if (dz > D || dz < -D) continue;
            const dy = B.y[j] - A.y[i];
            const d = Math.hypot(dx, dy, dz);
            if (d >= D || d < 1e-6) continue;
            const push = (D - d) / d / 2;
            A.x[i] -= dx * push;
            A.y[i] -= dy * push;
            A.z[i] -= dz * push;
            B.x[j] += dx * push;
            B.y[j] += dy * push;
            B.z[j] += dz * push;
          }
        }
      }
    }
    // 毛线和别人的纽扣（纽扣是一个矮圆柱）
    const pins = this.pinsOf(null);
    for (const r of ropes) {
      for (const p of pins) {
        const own = p.rope === r.id;
        for (let i = 1; i < r.n - 1; i++) {
          // 自己的纽扣只和远离端点的部分碰撞
          if (own && (i < 4 || i > r.n - 5)) continue;
          const dx = r.x[i] - p.x;
          const dz = r.z[i] - p.z;
          const d = Math.hypot(dx, dz);
          const top = p.y + PIN_TOP;
          if (d >= PIN_R + R || r.y[i] >= top + R) continue;
          const radial = PIN_R + R - d;
          const up = top + R - r.y[i];
          if (up < radial || d < 1e-4) r.y[i] = top + R;
          else {
            r.x[i] = p.x + (dx / d) * (PIN_R + R);
            r.z[i] = p.z + (dz / d) * (PIN_R + R);
          }
        }
      }
    }
  }

  /** 每根活着的毛线接触到了哪些别的毛线（物理上的"缠着"） */
  contacts(): Map<number, Set<number>> {
    const ropes = this.ropes.filter((r) => r.alive);
    const out = new Map<number, Set<number>>();
    for (const r of ropes) out.set(r.id, new Set());
    const D = R * 2 * 1.2;
    for (let a = 0; a < ropes.length; a++) {
      const A = ropes[a];
      for (let b = a + 1; b < ropes.length; b++) {
        const B = ropes[b];
        let hit = false;
        for (let i = 1; i < A.n - 1 && !hit; i++) {
          for (let j = 1; j < B.n - 1; j++) {
            if (Math.hypot(B.x[j] - A.x[i], B.y[j] - A.y[i], B.z[j] - A.z[i]) < D) {
              hit = true;
              break;
            }
          }
        }
        // 压在对方纽扣上也算
        const onPin = (P: Rope3, Q: Rope3) =>
          Q.pins.some((p) => {
            for (let i = 1; i < P.n - 1; i++) {
              if (Math.hypot(P.x[i] - p.x, P.z[i] - p.z) < PIN_R + R * 1.3 && P.y[i] < p.y + PIN_TOP + R * 1.6) return true;
            }
            return false;
          });
        if (hit || onPin(A, B) || onPin(B, A)) {
          out.get(A.id)!.add(B.id);
          out.get(B.id)!.add(A.id);
        }
      }
    }
    return out;
  }

  /** 最大质点速度（判断是否静止下来） */
  maxSpeed(dt: number): number {
    let m = 0;
    for (const r of this.ropes) {
      if (!r.alive) continue;
      for (let i = 1; i < r.n - 1; i++) m = Math.max(m, Math.hypot(r.x[i] - r.ox[i], r.y[i] - r.oy[i], r.z[i] - r.oz[i]) / dt);
    }
    return m;
  }
}
