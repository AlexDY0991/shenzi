import { curvesTangled, ropeCurve, Vec } from './geometry';

/** 关卡数据（JSON 格式），孔位编号 = r * cols + c */
export interface LevelData {
  cols: number;
  rows: number;
  /** 每行一个字符串，'#' 表示有孔，'.' 表示空位 */
  mask: string[];
  /** [颜色序号, 孔A, 孔B] */
  ropes: [number, number, number][];
  /** 给玩家的步数 */
  steps: number;
  /** 求解器算出的参考最少步数 */
  par: number;
}

/** 棋盘几何：孔位坐标 + 曲线/缠绕结果缓存（关卡生成和求解器也复用） */
export class BoardGeo {
  readonly cols: number;
  readonly rows: number;
  readonly holes: boolean[];
  private curveCache = new Map<number, Vec[]>();
  private tangleCache = new Map<number, boolean>();

  constructor(cols: number, rows: number, mask: string[]) {
    this.cols = cols;
    this.rows = rows;
    this.holes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) this.holes.push((mask[r] ?? '')[c] === '#');
    }
  }

  get holeCount(): number {
    return this.cols * this.rows;
  }

  pos(hole: number): Vec {
    return { x: hole % this.cols, y: Math.floor(hole / this.cols) };
  }

  private pairKey(a: number, b: number): number {
    return a < b ? a * 256 + b : b * 256 + a;
  }

  curve(a: number, b: number): Vec[] {
    const key = this.pairKey(a, b);
    let pts = this.curveCache.get(key);
    if (!pts) {
      // 曲线左右对称，统一从编号小的孔画起，保证缓存一致
      const [p, q] = a < b ? [this.pos(a), this.pos(b)] : [this.pos(b), this.pos(a)];
      pts = ropeCurve(p.x, p.y, q.x, q.y);
      this.curveCache.set(key, pts);
    }
    return pts;
  }

  tangled(a1: number, b1: number, a2: number, b2: number): boolean {
    let k1 = this.pairKey(a1, b1);
    let k2 = this.pairKey(a2, b2);
    if (k1 > k2) [k1, k2] = [k2, k1];
    const key = k1 * 65536 + k2;
    let v = this.tangleCache.get(key);
    if (v === undefined) {
      v = curvesTangled(this.curve(a1, b1), this.curve(a2, b2));
      this.tangleCache.set(key, v);
    }
    return v;
  }
}

export interface Rope {
  id: number;
  color: number;
  a: number;
  b: number;
  /** 叠放层级，越大越靠上 */
  z: number;
  alive: boolean;
}

export type RopeEnd = 'a' | 'b';

export class Puzzle {
  readonly geo: BoardGeo;
  readonly ropes: Rope[];
  stepsLeft: number;
  /** 孔位 -> 占用它的毛线 id，-1 为空 */
  private occ: Int16Array;
  private zCounter: number;

  constructor(readonly level: LevelData) {
    this.geo = new BoardGeo(level.cols, level.rows, level.mask);
    this.ropes = level.ropes.map(([color, a, b], i) => ({ id: i, color, a, b, z: i, alive: true }));
    this.zCounter = this.ropes.length;
    this.stepsLeft = level.steps;
    this.occ = new Int16Array(this.geo.holeCount).fill(-1);
    for (const r of this.ropes) {
      this.occ[r.a] = r.id;
      this.occ[r.b] = r.id;
    }
  }

  get aliveRopes(): Rope[] {
    return this.ropes.filter((r) => r.alive);
  }

  get isWon(): boolean {
    return this.aliveRopes.length === 0;
  }

  get isLost(): boolean {
    return !this.isWon && this.stepsLeft <= 0;
  }

  isFreeHole(hole: number): boolean {
    return hole >= 0 && hole < this.geo.holeCount && this.geo.holes[hole] && this.occ[hole] === -1;
  }

  ropeAtHole(hole: number): number {
    return this.occ[hole];
  }

  /** 当前每根活着的毛线与几根毛线缠绕 */
  tangleCounts(override?: { id: number; a: number; b: number }): Map<number, number> {
    const alive = this.aliveRopes.map((r) => (override && r.id === override.id ? { ...r, a: override.a, b: override.b } : r));
    const counts = new Map<number, number>();
    for (const r of alive) counts.set(r.id, 0);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const p = alive[i];
        const q = alive[j];
        if (this.geo.tangled(p.a, p.b, q.a, q.b)) {
          counts.set(p.id, counts.get(p.id)! + 1);
          counts.set(q.id, counts.get(q.id)! + 1);
        }
      }
    }
    return counts;
  }

  /** 预览：把某根毛线的一端挪到 hole 后，会被理顺消除的毛线 */
  previewCleared(ropeId: number, end: RopeEnd, hole: number): number[] {
    const r = this.ropes[ropeId];
    const a = end === 'a' ? hole : r.a;
    const b = end === 'b' ? hole : r.b;
    const counts = this.tangleCounts({ id: ropeId, a, b });
    return [...counts].filter(([, n]) => n === 0).map(([id]) => id);
  }

  canMove(ropeId: number, hole: number): boolean {
    const r = this.ropes[ropeId];
    return !!r && r.alive && this.stepsLeft > 0 && this.isFreeHole(hole);
  }

  /** 挪动一端，消耗一步；返回被理顺消除的毛线 id */
  move(ropeId: number, end: RopeEnd, hole: number): number[] {
    if (!this.canMove(ropeId, hole)) return [];
    const r = this.ropes[ropeId];
    this.occ[r[end]] = -1;
    r[end] = hole;
    this.occ[hole] = r.id;
    r.z = ++this.zCounter;
    this.stepsLeft--;
    return this.clearUntangled();
  }

  /** 剪刀道具：直接剪掉一根毛线（不耗步数），随之松开的毛线也一起消除 */
  cut(ropeId: number): number[] {
    const r = this.ropes[ropeId];
    if (!r || !r.alive) return [];
    this.removeRope(r);
    return [ropeId, ...this.clearUntangled()];
  }

  addSteps(n: number): void {
    this.stepsLeft += n;
  }

  private removeRope(r: Rope): void {
    r.alive = false;
    this.occ[r.a] = -1;
    this.occ[r.b] = -1;
  }

  /** 消除所有不再与任何毛线缠绕的毛线。移除"自由"毛线不影响其他毛线的缠绕数，所以一遍即可 */
  private clearUntangled(): number[] {
    const cleared: number[] = [];
    for (const [id, n] of this.tangleCounts()) {
      if (n === 0) {
        this.removeRope(this.ropes[id]);
        cleared.push(id);
      }
    }
    return cleared;
  }
}
