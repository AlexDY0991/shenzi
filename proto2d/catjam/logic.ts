// 猫咪排队出门：纯逻辑（无绘制）。
// 每只猫占 1～2 格，朝一个方向趴着。点它，它会沿脸朝的方向一直走出房间；
// 路上有别的猫就会撞头弹回来。

import { rng } from '../common';

/** 0 右 1 下 2 左 3 上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export interface Cat {
  id: number;
  /** 头所在的格子 */
  x: number;
  y: number;
  dir: Dir;
  /** 1 普通猫，2 胖猫 */
  len: number;
  fur: number;
}

export function cellsOf(c: Cat): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < c.len; i++) out.push([c.x - DX[c.dir] * i, c.y - DY[c.dir] * i]);
  return out;
}

export class Room {
  readonly grid: Int16Array;
  readonly alive = new Set<number>();
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cats: Cat[],
  ) {
    this.grid = new Int16Array(cols * rows).fill(-1);
    for (const c of cats) {
      this.alive.add(c.id);
      for (const [x, y] of cellsOf(c)) this.grid[y * cols + x] = c.id;
    }
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return this.grid[y * this.cols + x];
  }

  /** 沿脸的方向看过去，第一只挡路的猫和中间空了几格；没有挡路的返回 null */
  blocker(c: Cat): { id: number; gap: number } | null {
    let x = c.x + DX[c.dir];
    let y = c.y + DY[c.dir];
    let gap = 0;
    while (x >= 0 && y >= 0 && x < this.cols && y < this.rows) {
      const id = this.grid[y * this.cols + x];
      if (id >= 0) return { id, gap };
      gap++;
      x += DX[c.dir];
      y += DY[c.dir];
    }
    return null;
  }

  remove(c: Cat): void {
    this.alive.delete(c.id);
    for (const [x, y] of cellsOf(c)) this.grid[y * this.cols + x] = -1;
  }

  freeCats(): Cat[] {
    return this.cats.filter((c) => this.alive.has(c.id) && !this.blocker(c));
  }
}

/**
 * 倒着摆：先放最后出门的猫，每放一只都要求它面前的路此刻是空的。
 * 这样按摆放的逆序点一定能全部出门，所以每关必有解。
 */
function attempt(cols: number, rows: number, rand: () => number, fatRate: number): Cat[] {
  const grid = new Int16Array(cols * rows).fill(-1);
  const cats: Cat[] = [];
  const clearAhead = (x: number, y: number, d: Dir) => {
    x += DX[d];
    y += DY[d];
    while (x >= 0 && y >= 0 && x < cols && y < rows) {
      if (grid[y * cols + x] >= 0) return false;
      x += DX[d];
      y += DY[d];
    }
    return true;
  };
  const empties = () => {
    const out: number[] = [];
    for (let i = 0; i < grid.length; i++) if (grid[i] < 0) out.push(i);
    return out;
  };
  let fails = 0;
  while (fails < 60) {
    const e = empties();
    if (!e.length) break;
    const cell = e[Math.floor(rand() * e.length)];
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    const len = rand() < fatRate ? 2 : 1;
    const dirs: Dir[] = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let placed = false;
    for (const d of dirs) {
      const tx = x - DX[d] * (len - 1);
      const ty = y - DY[d] * (len - 1);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || grid[ty * cols + tx] >= 0) continue;
      if (!clearAhead(x, y, d)) continue;
      const c: Cat = { id: cats.length, x, y, dir: d, len, fur: Math.floor(rand() * 7) };
      cats.push(c);
      for (const [cx, cy] of cellsOf(c)) grid[cy * cols + cx] = c.id;
      placed = true;
      break;
    }
    if (placed) fails = 0;
    else fails++;
  }
  return cats;
}

/** 一层层剥：每轮把当前能出门的猫全放走，算要几轮 */
export function layers(cols: number, rows: number, cats: Cat[]): number {
  const room = new Room(cols, rows, cats);
  let n = 0;
  while (room.alive.size) {
    const free = room.freeCats();
    if (!free.length) return -1;
    for (const c of free) room.remove(c);
    n++;
  }
  return n;
}

export interface LevelSpec {
  cols: number;
  rows: number;
  seed: number;
  fatRate?: number;
  tries?: number;
  /** 开局能直接走的猫的目标数量 */
  targetFree?: number;
  climb?: number;
}

export function generate(spec: LevelSpec): Cat[] {
  const rand = rng(spec.seed);
  let best: Cat[] = [];
  let bestScore = -Infinity;
  const total = spec.cols * spec.rows;
  for (let t = 0; t < (spec.tries ?? 60); t++) {
    const cats = attempt(spec.cols, spec.rows, rand, spec.fatRate ?? 0.18);
    const filled = cats.reduce((s, c) => s + c.len, 0) / total;
    const room = new Room(spec.cols, spec.rows, cats);
    const free = room.freeCats().length;
    const depth = layers(spec.cols, spec.rows, cats);
    // 铺得满、层数多、开局能走的猫少（但不能太少，免得一开始就找不到）
    const score = filled * 40 + depth * 3 - Math.abs(free - 4) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = cats;
    }
  }
  return tighten(spec, best, rand);
}

/** 打分：开局能走的猫越少、需要剥的层数越多越难（仍保证有解） */
function hardness(cols: number, rows: number, cats: Cat[], targetFree: number): number {
  const depth = layers(cols, rows, cats);
  if (depth < 0) return -Infinity;
  const free = new Room(cols, rows, cats).freeCats().length;
  // 层数太少太简单；太多就变成一条链，每次只有一只能走，找起来累
  const want = Math.round(cats.length * 0.38);
  return -Math.abs(depth - want) * 4 - Math.abs(free - targetFree) * 3;
}

/** 爬山：随机给猫换个朝向，只要还有解且更难就留下 */
function tighten(spec: LevelSpec, cats: Cat[], rand: () => number): Cat[] {
  const { cols, rows } = spec;
  const target = spec.targetFree ?? 4;
  let cur = cats.map((c, i) => ({ ...c, id: i }));
  let score = hardness(cols, rows, cur, target);
  for (let it = 0; it < (spec.climb ?? 2500); it++) {
    const k = Math.floor(rand() * cur.length);
    const old = cur[k];
    const d = Math.floor(rand() * 4) as Dir;
    if (d === old.dir) continue;
    // 胖猫绕着身体中间转；普通猫原地转
    let nx = old.x;
    let ny = old.y;
    if (old.len === 2) {
      const tx = old.x - DX[old.dir];
      const ty = old.y - DY[old.dir];
      // 尾格保持不动，头换到尾格的另一侧
      nx = tx + DX[d];
      ny = ty + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const occupied = cur.some((c) => c.id !== old.id && cellsOf(c).some(([x, y]) => x === nx && y === ny));
      if (occupied) continue;
    }
    const next = cur.slice();
    next[k] = { ...old, x: nx, y: ny, dir: d };
    const s = hardness(cols, rows, next, target);
    if (s >= score) {
      cur = next;
      score = s;
    }
  }
  return cur;
}
