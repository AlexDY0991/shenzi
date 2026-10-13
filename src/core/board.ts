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
  /** 缝住的纽扣：[毛线序号, 0=a端 / 1=b端] */
  fixed?: [number, number][];
  /** 打盹的小猫：[毛线序号, 再理顺几根毛线才醒] */
  sleepers?: [number, number][];
  /** 毛线锁：[孔位, 钥匙毛线序号]，钥匙毛线理顺后打开 */
  locks?: [number, number][];
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
