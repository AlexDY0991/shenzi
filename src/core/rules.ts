import { BoardGeo, LevelData } from './board';

/**
 * 规则层：游戏和求解器共用同一套判定，避免两边不一致。
 *
 * 状态 State：
 * - pos：每根毛线两端的孔位 [a0, b0, a1, b1, ...]，已消除的毛线为 -1
 * - over：当前缠着的毛线对，编码 = 上层毛线 * 32 + 下层毛线（升序数组）
 *
 * 缠绕规则（上下层）：
 * - 两根毛线交叉（或一根压在另一根的纽扣上）就缠在一起，交叉处一根在上、一根在下。
 * - 挪动一根毛线时，它的纽扣是被拎起来放到新孔的：
 *   - 它压在上面的那些交叉，如果新位置不再交叉，就松开了（拎走了）；
 *   - 它被压在下面的那些交叉，无论挪到哪里都不会松开 —— 它还被勾着；
 *   - 新产生的交叉，它都在上面。
 * - 所以要从最上层的毛线开始一层层拆。一根毛线不再和任何毛线缠着时被理顺消除。
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

export interface State {
  pos: number[];
  /** 缠着的毛线对：上层 * 32 + 下层，升序 */
  over: number[];
}

export const pairCode = (top: number, bottom: number): number => top * 32 + bottom;
export const pairTop = (code: number): number => code >> 5;
export const pairBottom = (code: number): number => code & 31;

export function makeRules(level: LevelData, geo = new BoardGeo(level.holes)): Rules {
  const n = level.ropes.length;
  if (n > 32) throw new Error('一关最多 32 根毛线');
  const fixed = new Array(n * 2).fill(false);
  for (const [r, end] of level.fixed ?? []) fixed[r * 2 + end] = true;
  const sleep = new Array(n).fill(0);
  for (const [r, c] of level.sleepers ?? []) sleep[r] = c;
  const lockKey = new Array(geo.holeCount).fill(-1);
  for (const [h, r] of level.locks ?? []) lockKey[h] = r;
  return { geo, n, fixed, sleep, lockKey };
}

function geomTangled(R: Rules, pos: number[], i: number, j: number): boolean {
  return R.geo.tangled(pos[i * 2], pos[i * 2 + 1], pos[j * 2], pos[j * 2 + 1]);
}

/** 开局状态：几何上缠着的毛线对，序号大的在上（关卡数据里毛线的顺序就是叠放顺序） */
export function initialState(R: Rules, level: LevelData): State {
  const pos = level.ropes.flatMap(([, a, b]) => [a, b]);
  const over: number[] = [];
  for (let i = 0; i < R.n; i++) {
    for (let j = i + 1; j < R.n; j++) if (geomTangled(R, pos, i, j)) over.push(pairCode(j, i));
  }
  return { pos, over: over.sort((a, b) => a - b) };
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

/** 把端点 k 挪到孔 hole（不检查合法性，不消除） */
export function applyMove(R: Rules, s: State, k: number, hole: number): State {
  const r = k >> 1;
  const pos = s.pos.slice();
  pos[k] = hole;
  const over = new Set<number>();
  for (const code of s.over) {
    const top = pairTop(code);
    const bottom = pairBottom(code);
    if (top !== r && bottom !== r) over.add(code);
    // 被压在下面：拎走也挣不脱，仍然勾着
    else if (bottom === r) over.add(code);
    // 压在上面：新位置还交叉才保留
    else if (geomTangled(R, pos, r, bottom)) over.add(code);
  }
  // 新产生的交叉：挪动的这根在上面
  for (let x = 0; x < R.n; x++) {
    if (x === r || pos[x * 2] < 0) continue;
    if (over.has(pairCode(x, r)) || over.has(pairCode(r, x))) continue;
    if (geomTangled(R, pos, r, x)) over.add(pairCode(r, x));
  }
  return { pos, over: [...over].sort((a, b) => a - b) };
}

/** 每根毛线和几根毛线缠着（已消除的为 -1） */
export function tangleCounts(R: Rules, s: State): number[] {
  const counts = new Array(R.n).fill(-1);
  for (let i = 0; i < R.n; i++) if (s.pos[i * 2] >= 0) counts[i] = 0;
  for (const code of s.over) {
    counts[pairTop(code)]++;
    counts[pairBottom(code)]++;
  }
  return counts;
}

/**
 * 消除所有不再缠着的毛线。移除一根"自由"毛线不影响其他毛线的缠绕，所以一遍即可。
 * 返回新状态（不修改入参）。
 */
export function settle(R: Rules, s: State): { state: State; cleared: number[]; alive: number; pairs: number } {
  const counts = tangleCounts(R, s);
  const pos = s.pos.slice();
  const cleared: number[] = [];
  let alive = 0;
  counts.forEach((c, i) => {
    if (c < 0) return;
    if (c === 0) {
      pos[i * 2] = -1;
      pos[i * 2 + 1] = -1;
      cleared.push(i);
    } else alive++;
  });
  return { state: { pos, over: s.over }, cleared, alive, pairs: s.over.length };
}

/** 剪掉一根毛线：它和别人的缠绕全部解除 */
export function applyCut(s: State, rope: number): State {
  const pos = s.pos.slice();
  pos[rope * 2] = -1;
  pos[rope * 2 + 1] = -1;
  return { pos, over: s.over.filter((c) => pairTop(c) !== rope && pairBottom(c) !== rope) };
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
