import { BoardGeo, LevelData } from './board';

/**
 * 规则层：游戏和求解器共用同一套判定，避免两边不一致。
 * 状态 pos：每根毛线两端的孔位 [a0, b0, a1, b1, ...]，已消除的毛线为 -1。
 *
 * 特殊机制：
 * - 缝住的纽扣（fixed）：这一端不能移动
 * - 打盹的小猫（sleep）：再理顺 N 根毛线前，这根毛线两端都不能移动
 * - 毛线锁（locks）：孔被锁住不能放纽扣，对应的毛线理顺后打开
 */
export interface Rules {
  geo: BoardGeo;
  n: number;
  /** 长度 2n，按端点索引 */
  fixed: boolean[];
  /** 每根毛线上小猫的初始计数，0 表示没有 */
  sleep: number[];
  /** 每个孔的钥匙毛线序号，-1 表示没锁 */
  lockKey: number[];
}

export function makeRules(level: LevelData, geo = new BoardGeo(level.holes)): Rules {
  const n = level.ropes.length;
  const fixed = new Array(n * 2).fill(false);
  for (const [r, end] of level.fixed ?? []) fixed[r * 2 + end] = true;
  const sleep = new Array(n).fill(0);
  for (const [r, c] of level.sleepers ?? []) sleep[r] = c;
  const lockKey = new Array(geo.holeCount).fill(-1);
  for (const [h, r] of level.locks ?? []) lockKey[h] = r;
  return { geo, n, fixed, sleep, lockKey };
}

export function deadCount(pos: number[]): number {
  let d = 0;
  for (let i = 0; i < pos.length; i += 2) if (pos[i] < 0) d++;
  return d;
}

/** 小猫还要等几根毛线理顺才醒（0 = 醒着） */
export function sleepLeft(R: Rules, pos: number[], rope: number): number {
  return R.sleep[rope] > 0 ? Math.max(0, R.sleep[rope] - deadCount(pos)) : 0;
}

export function isLocked(R: Rules, pos: number[], hole: number): boolean {
  const key = R.lockKey[hole];
  return key >= 0 && pos[key * 2] >= 0;
}

export function canPlace(R: Rules, pos: number[], hole: number): boolean {
  if (hole < 0 || hole >= R.geo.holeCount || !R.geo.holes[hole]) return false;
  if (isLocked(R, pos, hole)) return false;
  return pos.indexOf(hole) < 0;
}

/** 端点 k（= 毛线序号 * 2 + 0/1）能否被拿起 */
export function canLift(R: Rules, pos: number[], k: number): boolean {
  return pos[k] >= 0 && !R.fixed[k] && sleepLeft(R, pos, k >> 1) === 0;
}

/** 每根毛线和几根毛线缠着（已消除的为 -1），以及缠绕总对数 */
export function tangleCounts(R: Rules, pos: number[]): { counts: number[]; pairs: number } {
  const counts = new Array(R.n).fill(-1);
  let pairs = 0;
  for (let i = 0; i < R.n; i++) if (pos[i * 2] >= 0) counts[i] = 0;
  for (let i = 0; i < R.n; i++) {
    if (pos[i * 2] < 0) continue;
    for (let j = i + 1; j < R.n; j++) {
      if (pos[j * 2] < 0) continue;
      if (R.geo.tangled(pos[i * 2], pos[i * 2 + 1], pos[j * 2], pos[j * 2 + 1])) {
        counts[i]++;
        counts[j]++;
        pairs++;
      }
    }
  }
  return { counts, pairs };
}

/**
 * 消除所有不再缠绕的毛线。移除一根"自由"毛线不会改变其他毛线的缠绕数，所以一遍即可。
 * 返回新状态（不修改入参）。
 */
export function settle(R: Rules, pos: number[]): { pos: number[]; cleared: number[]; alive: number; pairs: number } {
  const { counts, pairs } = tangleCounts(R, pos);
  const out = pos.slice();
  const cleared: number[] = [];
  let alive = 0;
  counts.forEach((c, i) => {
    if (c < 0) return;
    if (c === 0) {
      out[i * 2] = -1;
      out[i * 2 + 1] = -1;
      cleared.push(i);
    } else alive++;
  });
  return { pos: out, cleared, alive, pairs };
}

/** 所有合法移动 [端点, 目标孔] */
export function legalMoves(R: Rules, pos: number[]): [number, number][] {
  const free: number[] = [];
  for (let h = 0; h < R.geo.holeCount; h++) if (canPlace(R, pos, h)) free.push(h);
  const moves: [number, number][] = [];
  for (let k = 0; k < pos.length; k++) {
    if (!canLift(R, pos, k)) continue;
    for (const h of free) moves.push([k, h]);
  }
  return moves;
}
