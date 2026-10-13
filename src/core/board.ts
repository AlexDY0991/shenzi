import { curvesTangled, segmentIntersection, Vec } from './geometry';

/**
 * 布片（棋盘上的装饰形状），坐标单位与孔位相同（相邻孔距约为 1）。
 * 只影响画面，不影响规则。
 */
export type Piece =
  /** 弧形布条：圆心、半径、起止角（弧度）、宽度 */
  | { kind: 'arc'; x: number; y: number; r: number; a0: number; a1: number; w: number; tint?: number }
  /** 直布条（胶囊形） */
  | { kind: 'bar'; x1: number; y1: number; x2: number; y2: number; w: number; tint?: number }
  /** 整块造型布垫：猫头 / 圆 / 爱心 / 鱼 / 云朵 / 爪垫 */
  | { kind: 'blob'; shape: BlobShape; x: number; y: number; s: number; rot?: number; tint?: number; face?: boolean };

export type BlobShape = 'catHead' | 'circle' | 'heart' | 'fish' | 'cloud' | 'pad' | 'bean';

/** 关卡数据（JSON 格式） */
export interface LevelData {
  /** 孔位坐标 */
  holes: [number, number][];
  /** 布片造型 */
  pieces: Piece[];
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
  /** 困难关 */
  hard?: boolean;
  /** 新手引导：[毛线, 端(0/1), 目标孔] */
  hint?: [number, number, number];
}

/** 棋盘几何：孔位坐标 + 缠绕判定缓存（关卡生成和求解器也复用） */
export class BoardGeo {
  readonly points: Vec[];
  /** 每个孔都存在（保留这个数组，方便规则层统一处理） */
  readonly holes: boolean[];
  private tangleCache = new Map<number, boolean>();

  constructor(points: [number, number][]) {
    this.points = points.map(([x, y]) => ({ x, y }));
    this.holes = points.map(() => true);
  }

  get holeCount(): number {
    return this.points.length;
  }

  pos(hole: number): Vec {
    return this.points[hole];
  }

  /** 毛线在规则上是两孔之间的直线 */
  curve(a: number, b: number): Vec[] {
    return [this.points[a], this.points[b]];
  }

  private pairKey(a: number, b: number): number {
    return a < b ? a * 256 + b : b * 256 + a;
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

  /** 两根毛线的交叉点（用来画"勾住"的环扣），不相交返回 null */
  crossing(a1: number, b1: number, a2: number, b2: number): Vec | null {
    return segmentIntersection(this.points[a1], this.points[b1], this.points[a2], this.points[b2]);
  }
}
