import { legalMoves, Rules, settle } from './rules';

interface Node {
  pos: number[];
  score: number;
}

function key(pos: number[]): string {
  return pos.join(',');
}

/**
 * 束搜索求解：返回找到的最少步数（找不到返回 -1）。
 * 不保证绝对最优（可能偏多），用来给关卡定"参考步数"并保证有解。
 */
export function solve(R: Rules, start: number[], beamWidth = 200, maxDepth = 40): number {
  const s0 = settle(R, start);
  if (s0.alive === 0) return 0;
  let beam: Node[] = [{ pos: s0.pos, score: 0 }];
  const seen = new Set<string>([key(s0.pos)]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      for (const [k, h] of legalMoves(R, node.pos)) {
        const moved = node.pos.slice();
        moved[k] = h;
        const r = settle(R, moved);
        if (r.alive === 0) return depth;
        const kk = key(r.pos);
        if (seen.has(kk)) continue;
        seen.add(kk);
        // 剩余毛线数优先，其次缠绕对数
        next.push({ pos: r.pos, score: r.alive * 100 + r.pairs });
      }
    }
    if (next.length === 0) return -1;
    next.sort((x, y) => x.score - y.score);
    beam = next.slice(0, beamWidth);
  }
  return -1;
}
