import { BoardGeo } from './puzzle';

/** 求解状态：每根毛线两端孔位，-1 表示已消除 */
type State = number[];

interface Node {
  s: State;
  depth: number;
  score: number;
}

function tangleInfo(geo: BoardGeo, s: State): { counts: number[]; pairs: number } {
  const n = s.length / 2;
  const counts = new Array(n).fill(0);
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    if (s[i * 2] < 0) continue;
    for (let j = i + 1; j < n; j++) {
      if (s[j * 2] < 0) continue;
      if (geo.tangled(s[i * 2], s[i * 2 + 1], s[j * 2], s[j * 2 + 1])) {
        counts[i]++;
        counts[j]++;
        pairs++;
      }
    }
  }
  return { counts, pairs };
}

/** 消除不再缠绕的毛线，返回新状态 */
function settle(geo: BoardGeo, s: State): { s: State; alive: number; pairs: number } {
  const { counts, pairs } = tangleInfo(geo, s);
  const out = s.slice();
  let alive = 0;
  for (let i = 0; i < counts.length; i++) {
    if (out[i * 2] < 0) continue;
    if (counts[i] === 0) {
      out[i * 2] = -1;
      out[i * 2 + 1] = -1;
    } else alive++;
  }
  return { s: out, alive, pairs };
}

/**
 * 束搜索求解：返回找到的最少步数（找不到返回 -1）。
 * 不保证绝对最优，但足够给关卡定"参考步数"。
 */
export function solve(geo: BoardGeo, ropes: [number, number][], beamWidth = 200, maxDepth = 40): number {
  const start = settle(geo, ropes.flat());
  if (start.alive === 0) return 0;
  let beam: Node[] = [{ s: start.s, depth: 0, score: 0 }];
  const seen = new Set<string>();
  const holes: number[] = [];
  for (let h = 0; h < geo.holeCount; h++) if (geo.holes[h]) holes.push(h);

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      const occupied = new Set(node.s.filter((h) => h >= 0));
      for (let k = 0; k < node.s.length; k++) {
        if (node.s[k] < 0) continue;
        for (const h of holes) {
          if (occupied.has(h)) continue;
          const moved = node.s.slice();
          moved[k] = h;
          const r = settle(geo, moved);
          if (r.alive === 0) return depth;
          const key = canonicalKey(r.s);
          if (seen.has(key)) continue;
          seen.add(key);
          // 剩余毛线数优先，其次缠绕对数
          next.push({ s: r.s, depth, score: r.alive * 100 + r.pairs });
        }
      }
    }
    if (next.length === 0) return -1;
    next.sort((x, y) => x.score - y.score);
    beam = next.slice(0, beamWidth);
  }
  return -1;
}

function canonicalKey(s: State): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += 2) {
    if (s[i] < 0) continue;
    parts.push(s[i] < s[i + 1] ? `${s[i]}-${s[i + 1]}` : `${s[i + 1]}-${s[i]}`);
  }
  return parts.join(',');
}

/** 当前缠绕对数（生成器用来衡量"乱"的程度） */
export function tanglePairs(geo: BoardGeo, ropes: [number, number][]): { pairs: number; free: number } {
  const { counts, pairs } = tangleInfo(geo, ropes.flat());
  return { pairs, free: counts.filter((c) => c === 0).length };
}
