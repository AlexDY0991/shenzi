// 拆毛衣：纯逻辑（无绘制）。
// 一幅用毛线织出来的像素画。点下方队列最前面的线轴，它会挂到线轴位上，
// 自动把露在外边（挨着空位或画布边缘）的同色针脚一针针抽走，卷满就飞走。
// 线轴位有限：挂上去的线轴都抽不到线、位置又满了，就卡死了。

import { rng } from '../common';

export const COLORS: Record<string, string> = {
  b: '#7EC3E6', // 天蓝底
  o: '#F39A3D', // 橘猫
  w: '#FFF0DA', // 奶白
  p: '#F08BB8', // 粉
  k: '#4A3A45', // 深色眼睛
  r: '#E8605A', // 红项圈
  y: '#F2C84B', // 铃铛
};

/** 第 1 关的图：一只戴铃铛的橘猫 */
export const PICTURE = [
  'bboobbbboobb',
  'boppobboppob',
  'booooooooooo',
  'boooooooooob',
  'ookkoooookko',
  'ookkoooookko',
  'oooooppooooo',
  'owwwoooowwwo',
  'bwwwwwwwwwwb',
  'bbwwwwwwwwbb',
  'bbrrrrrrrrbb',
  'bbbrryyrrbbb',
  'bbbbbyybbbbb',
];

export interface Spool {
  id: number;
  color: string;
  cap: number;
}

export class Knit {
  readonly cols: number;
  readonly rows: number;
  /** 每格的颜色键；'' 表示已经抽走 */
  readonly cells: string[];
  left: number;
  constructor(picture: string[]) {
    this.rows = picture.length;
    this.cols = picture[0].length;
    this.cells = picture.join('').split('');
    this.left = this.cells.length;
  }
  clone(): Knit {
    const k = Object.create(Knit.prototype) as Knit;
    Object.assign(k, { rows: this.rows, cols: this.cols, cells: this.cells.slice(), left: this.left });
    return k;
  }
  at(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return '';
    return this.cells[y * this.cols + x];
  }
  /** 露在外边：在画布边缘，或上下左右有一格已经抽走 */
  exposed(i: number): boolean {
    if (!this.cells[i]) return false;
    const x = i % this.cols;
    const y = Math.floor(i / this.cols);
    if (x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) return true;
    return !this.at(x + 1, y) || !this.at(x - 1, y) || !this.at(x, y + 1) || !this.at(x, y - 1);
  }
  exposedOf(color: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === color && this.exposed(i)) out.push(i);
    return out;
  }
  take(i: number): void {
    this.cells[i] = '';
    this.left--;
  }
  counts(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const k of this.cells) if (k) c[k] = (c[k] ?? 0) + 1;
    return c;
  }
}

/** 一个线轴最多卷几针 */
export const SPOOL_CAP = 9;

/**
 * 生成线轴队列：模拟一个“理想玩家”一卷一卷地拆，记下每卷的颜色和针数，
 * 再随机分到几列里（每列内部保持先后顺序）。按这个顺序拿一定能拆完，所以必有解。
 */
export function makeQueue(picture: string[], columns: number, seed: number): Spool[][] {
  const rand = rng(seed);
  const k = new Knit(picture);
  const seq: Spool[] = [];
  while (k.left > 0) {
    const counts = k.counts();
    // 每种颜色此刻最多能连续抽多少针（抽走的会露出更多同色的）
    const options: { color: string; n: number }[] = [];
    for (const color of Object.keys(counts)) {
      const t = k.clone();
      let n = 0;
      for (;;) {
        const e = t.exposedOf(color);
        if (!e.length || n >= SPOOL_CAP) break;
        t.take(e[0]);
        n++;
      }
      if (n > 0) options.push({ color, n });
    }
    // 偏向能卷满的颜色，偶尔挑小卷，节奏有变化
    let total = 0;
    for (const o of options) total += o.n * o.n;
    let r = rand() * total;
    let pick = options[0];
    for (const o of options) {
      r -= o.n * o.n;
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    for (let i = 0; i < pick.n; i++) {
      const e = k.exposedOf(pick.color);
      k.take(e[Math.floor(rand() * e.length)]);
    }
    seq.push({ id: seq.length, color: pick.color, cap: pick.n });
  }
  const cols: Spool[][] = Array.from({ length: columns }, () => []);
  for (const s of seq) cols[Math.floor(rand() * columns)].push(s);
  return cols;
}

/** 瞬时模拟：挂上线轴后把能抽的都抽完，返回卷满飞走的线轴 */
export function settle(k: Knit, slots: { color: string; need: number }[]): void {
  let moved = true;
  while (moved) {
    moved = false;
    for (const s of slots) {
      while (s.need > 0) {
        const e = k.exposedOf(s.color);
        if (!e.length) break;
        k.take(e[0]);
        s.need--;
        moved = true;
      }
    }
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i].need === 0) slots.splice(i, 1);
  }
}

/** 随机点的玩家能不能过（用来估难度） */
export function randomPlay(picture: string[], queue: Spool[][], slotCount: number, rand: () => number, smart: boolean): boolean {
  const k = new Knit(picture);
  const cols = queue.map((c) => c.slice());
  const slots: { color: string; need: number }[] = [];
  for (;;) {
    if (k.left === 0) return true;
    const avail = cols.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
    if (!avail.length || slots.length >= slotCount) return false;
    let choice = avail[Math.floor(rand() * avail.length)];
    if (smart) {
      const good = avail.filter((i) => k.exposedOf(cols[i][0].color).length > 0);
      if (good.length) choice = good[Math.floor(rand() * good.length)];
    }
    const s = cols[choice].shift()!;
    slots.push({ color: s.color, need: s.cap });
    settle(k, slots);
  }
}
