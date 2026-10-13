// 关卡地图模板：用布条、布垫拼出造型，孔沿着布片排布。坐标单位 = 相邻孔距（约 1）
import type { BlobShape, Piece } from '../src/core/board';

export interface MapDef {
  holes: [number, number][];
  pieces: Piece[];
}

const D = Math.PI / 180;

class Builder {
  holes: [number, number][] = [];
  pieces: Piece[] = [];

  private add(x: number, y: number): number {
    this.holes.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    return this.holes.length - 1;
  }

  /** 弧形布条：以 mid 角（度）为中心，n 个孔，孔距约 gap */
  arc(x: number, y: number, r: number, midDeg: number, n: number, opts: { gap?: number; tint?: number } = {}): this {
    const gap = opts.gap ?? 1;
    const span = ((n - 1) * gap) / r;
    const a0 = midDeg * D - span / 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (n === 1 ? span / 2 : (span * i) / (n - 1));
      this.add(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    const cap = 0.5 / r;
    this.pieces.push({ kind: 'arc', x, y, r, a0: a0 - cap, a1: a0 + span + cap, w: 0.92, tint: opts.tint });
    return this;
  }

  /** 直布条，两端各一个孔，中间均分 */
  bar(x1: number, y1: number, x2: number, y2: number, n: number, tint?: number): this {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.add(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    }
    this.pieces.push({ kind: 'bar', x1, y1, x2, y2, w: 0.92, tint });
    return this;
  }

  /** 造型布垫，holes 为相对中心的偏移（单位同上） */
  blob(shape: BlobShape, x: number, y: number, s: number, holes: [number, number][], opts: { face?: boolean; tint?: number; rot?: number } = {}): this {
    this.pieces.push({ kind: 'blob', shape, x, y, s, face: opts.face, tint: opts.tint, rot: opts.rot });
    for (const [dx, dy] of holes) this.add(x + dx, y + dy);
    return this;
  }

  done(): MapDef {
    return { holes: this.holes, pieces: this.pieces };
  }
}

const B = () => new Builder();

export const MAPS = {
  /** 第 1 关：上下两条布条 + 中间一个小猫脸布垫 */
  tutorial: () =>
    B()
      .bar(0, 0, 2, 0, 3, 0)
      .bar(0, 2, 2, 2, 3, 0)
      .blob('catHead', 1, 1, 1.25, [
        [-1, 0],
        [1, 0],
      ], { face: true, tint: 2 })
      .done(),

  /** 一对括号 */
  brackets: () =>
    B()
      .arc(2.6, 1.5, 2.2, 180, 4, { tint: 1 })
      .arc(0.4, 1.5, 2.2, 0, 4, { tint: 3 })
      .blob('bean', 1, 1.5, 0.5, [[0, 0]], { tint: 2 })
      .done(),

  /** 小猫头 + 微笑布条 + 两侧胡须条 */
  kitty: () =>
    B()
      .blob('catHead', 2, 1.8, 2, [
        [-1.1, -0.9],
        [1.1, -0.9],
        [-1.2, 0.5],
        [1.2, 0.5],
      ], { face: true, tint: 0 })
      .arc(2, 2.2, 2.9, 90, 5, { tint: 1 })
      .bar(-0.6, 0.2, -0.6, 2.2, 3, 3)
      .bar(4.6, 0.2, 4.6, 2.2, 3, 3)
      .done(),

  /** 猫爪：肉垫 + 四个指豆 + 两侧弧条 */
  paw: () =>
    B()
      .blob('pad', 2, 3.3, 1.5, [
        [-0.75, 0.15],
        [0.75, 0.15],
        [0, 0.6],
      ], { tint: 4 })
      .blob('bean', 0.2, 1.6, 0.5, [[0, 0]], { tint: 4, rot: -0.4 })
      .blob('bean', 1.35, 0.8, 0.5, [[0, 0]], { tint: 4 })
      .blob('bean', 2.65, 0.8, 0.5, [[0, 0]], { tint: 4 })
      .blob('bean', 3.8, 1.6, 0.5, [[0, 0]], { tint: 4, rot: 0.4 })
      .arc(2, 2.9, 3.2, 180, 4, { tint: 1 })
      .arc(2, 2.9, 3.2, 0, 4, { tint: 1 })
      .bar(0.5, 5.6, 3.5, 5.6, 4, 2)
      .done(),

  /** 小鱼 + 泡泡 */
  fish: () =>
    B()
      .blob('fish', 2.2, 2.6, 2.3, [
        [-1.5, -0.5],
        [-0.5, -0.8],
        [0.5, -0.8],
        [-1.5, 0.5],
        [-0.5, 0.8],
        [0.5, 0.8],
        [2.1, -0.7],
        [2.1, 0.7],
      ], { tint: 5 })
      .blob('bean', 0.2, 0.4, 0.45, [[0, 0]], { tint: 4 })
      .blob('bean', 1.4, 0, 0.45, [[0, 0]], { tint: 4 })
      .blob('bean', 2.6, 0.2, 0.45, [[0, 0]], { tint: 4 })
      .bar(0.2, 5.1, 4.2, 5.1, 5, 2)
      .done(),

  /** 花环：一圈布环 + 中心猫脸 */
  wreath: () => {
    const b = B();
    for (let i = 0; i < 4; i++) b.arc(2.4, 2.6, 2.7, 45 + i * 90, 3, { tint: i % 2 ? 1 : 3, gap: 1.05 });
    return b
      .blob('catHead', 2.4, 2.6, 1.35, [
        [-0.6, 0.45],
        [0.6, 0.45],
      ], { face: true, tint: 0 })
      .done();
  },

  /** 参考原版布局：中间大猫脸，四周环绕布条 */
  capy: () =>
    B()
      .blob('catHead', 2.6, 3.3, 2.1, [
        [-1.3, 0.6],
        [1.3, 0.6],
      ], { face: true, tint: 0 })
      .arc(2.6, 0.5, 1.6, 270, 3, { tint: 3 })
      .arc(2.6, 3.4, 3.2, 210, 4, { tint: 1 })
      .arc(2.6, 3.4, 3.2, 330, 4, { tint: 1 })
      .arc(2.6, 3.0, 3.6, 127, 4, { tint: 4 })
      .arc(2.6, 3.0, 3.6, 53, 4, { tint: 4 })
      .done(),

  /** 毛线篮：U 形篮身 + 提手 + 篮里的布条 */
  basket: () =>
    B()
      .arc(2.5, 2.8, 2.9, 90, 7, { tint: 1 })
      .arc(2.5, 2.4, 2.2, 270, 5, { tint: 3 })
      .bar(1, 3.4, 4, 3.4, 4, 2)
      .blob('bean', 2.5, 2.4, 0.45, [[0, 0]], { tint: 4 })
      .done(),

  /** 鱼骨：一条脊骨 + 斜向肋骨 */
  fishbone: () =>
    B()
      .bar(0, 3, 4.6, 3, 5, 1)
      .bar(0.6, 0.6, 1.6, 2.1, 2, 3)
      .bar(2.2, 0.6, 3.2, 2.1, 2, 3)
      .bar(0.6, 5.4, 1.6, 3.9, 2, 3)
      .bar(2.2, 5.4, 3.2, 3.9, 2, 3)
      .blob('circle', 5.6, 3, 0.75, [[0, 0]], { tint: 4 })
      .blob('bean', 4.3, 1.2, 0.45, [[0, 0]], { tint: 2 })
      .blob('bean', 4.3, 4.8, 0.45, [[0, 0]], { tint: 2 })
      .done(),

  /** 双胞胎猫：两个猫头 + 上下布条 */
  twins: () =>
    B()
      .blob('catHead', 1.2, 2.5, 1.3, [
        [-0.65, 0.35],
        [0.65, 0.35],
      ], { face: true, tint: 0 })
      .blob('catHead', 4.2, 2.5, 1.3, [
        [-0.65, 0.35],
        [0.65, 0.35],
      ], { face: true, tint: 4 })
      .bar(0.2, 0.3, 5.2, 0.3, 6, 2)
      .arc(2.7, 2.2, 3.1, 90, 6, { tint: 1 })
      .blob('bean', 2.7, 2.6, 0.45, [[0, 0]], { tint: 3 })
      .done(),

  /** 大爱心 + 两侧弧条 */
  heart: () =>
    B()
      .blob('heart', 2.5, 2.6, 2.2, [
        [-1.1, -0.95],
        [1.1, -0.95],
        [-1.6, 0],
        [-0.55, 0],
        [0.55, 0],
        [1.6, 0],
        [-0.8, 0.95],
        [0.8, 0.95],
        [0, 1.8],
      ], { tint: 3 })
      .arc(2.5, 2.4, 3.4, 215, 4, { tint: 1 })
      .arc(2.5, 2.4, 3.4, 325, 4, { tint: 1 })
      .bar(1, 6, 4, 6, 4, 2)
      .done(),

  /** 月牙猫：两道同心弧 + 猫头 + 星星 */
  moon: () =>
    B()
      .arc(3.2, 3, 3.2, 180, 8, { tint: 2 })
      .arc(3.6, 3, 1.9, 180, 5, { tint: 2 })
      .blob('catHead', 3.7, 3, 1.05, [[0, 0.25]], { face: true, tint: 0 })
      .blob('bean', 4.6, 0.4, 0.42, [[0, 0]], { tint: 4 })
      .blob('bean', 5.2, 1.6, 0.42, [[0, 0]], { tint: 4 })
      .blob('bean', 5.2, 4.4, 0.42, [[0, 0]], { tint: 4 })
      .blob('bean', 4.6, 5.6, 0.42, [[0, 0]], { tint: 4 })
      .done(),

  /** 毛线卷：三道同心弧 */
  spiral: () =>
    B()
      .arc(2.8, 3, 3.1, 160, 7, { tint: 1 })
      .arc(2.8, 3, 2.05, 340, 6, { tint: 3 })
      .arc(2.8, 3, 1.0, 160, 3, { tint: 4 })
      .blob('cloud', 4.6, 6.2, 1.1, [
        [-0.7, 0],
        [0.7, 0],
      ], { tint: 2 })
      .blob('bean', 2.8, 3, 0.4, [[0, 0]], { tint: 0 })
      .done(),

  /** 拼布被：四块圆布垫 + 中间猫脸 */
  quilt: () =>
    B()
      .blob('circle', 1, 1, 1, [
        [-0.5, -0.45],
        [0.5, -0.45],
        [0, 0.5],
      ], { tint: 1 })
      .blob('circle', 4.4, 1, 1, [
        [-0.5, -0.45],
        [0.5, -0.45],
        [0, 0.5],
      ], { tint: 3 })
      .blob('circle', 1, 5.2, 1, [
        [0, -0.5],
        [-0.5, 0.45],
        [0.5, 0.45],
      ], { tint: 4 })
      .blob('circle', 4.4, 5.2, 1, [
        [0, -0.5],
        [-0.5, 0.45],
        [0.5, 0.45],
      ], { tint: 2 })
      .blob('catHead', 2.7, 3.1, 1.3, [
        [-0.65, 0.4],
        [0.65, 0.4],
      ], { face: true, tint: 0 })
      .bar(-0.3, 2.6, -0.3, 3.6, 2, 5)
      .bar(5.7, 2.6, 5.7, 3.6, 2, 5)
      .done(),

  /** 终章：大猫脸 + 四道弧 + 两条布条 */
  grand: () =>
    B()
      .blob('catHead', 2.8, 3.4, 1.9, [
        [-1.15, 0.5],
        [1.15, 0.5],
        [0, 1.15],
      ], { face: true, tint: 0 })
      .arc(2.8, 3.4, 3.3, 270, 6, { tint: 1 })
      .arc(2.8, 3.4, 3.3, 162, 4, { tint: 3 })
      .arc(2.8, 3.4, 3.3, 18, 4, { tint: 3 })
      .bar(0.3, 7.0, 2.3, 7.0, 3, 4)
      .bar(3.3, 7.0, 5.3, 7.0, 3, 4)
      .done(),
} satisfies Record<string, () => MapDef>;

export type MapName = keyof typeof MAPS;
