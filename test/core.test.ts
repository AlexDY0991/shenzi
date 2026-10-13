import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardGeo, LevelData, Puzzle } from '../src/core/puzzle';
import { solve } from '../src/core/solver';
import levels from '../src/levels/levels.json';

const full3: string[] = ['###', '###', '###'];

function level(ropes: [number, number, number][], steps = 5): LevelData {
  return { cols: 3, rows: 3, mask: full3, ropes, steps, par: 1 };
}

test('交叉的两根毛线判定为缠绕，平行的不缠绕', () => {
  const geo = new BoardGeo(3, 3, full3);
  assert.equal(geo.tangled(0, 8, 2, 6), true);
  assert.equal(geo.tangled(0, 6, 2, 8), false);
});

test('毛线压在别人的纽扣上也算缠绕', () => {
  const geo = new BoardGeo(3, 3, full3);
  // 竖线 1->7 正好穿过孔 4，另一根毛线的纽扣在 4
  assert.equal(geo.tangled(1, 7, 4, 5), true);
});

test('挪动后理顺的毛线被消除，步数减一', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.equal(p.aliveRopes.length, 2);
  const cleared = p.move(1, 'a', 3); // 2 -> 3，变成左边一根竖线，不再交叉
  assert.deepEqual(cleared.sort(), [0, 1]);
  assert.equal(p.isWon, true);
  assert.equal(p.stepsLeft, 4);
});

test('不能挪到被占用或不存在的孔', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.equal(p.canMove(0, 2), false);
  assert.equal(p.canMove(0, 99), false);
  assert.deepEqual(p.move(0, 'a', 2), []);
  assert.equal(p.stepsLeft, 5);
});

test('步数用完判负', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]], 1));
  p.move(1, 'a', 5); // 2 -> 5，仍然交叉
  assert.equal(p.isWon, false);
  assert.equal(p.isLost, true);
});

test('剪刀剪掉一根后，松开的毛线也一起消除', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.deepEqual(p.cut(0).sort(), [0, 1]);
  assert.equal(p.isWon, true);
});

test('预览能算出挪动后会被消除的毛线', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.deepEqual(p.previewCleared(1, 'a', 3).sort(), [0, 1]);
  assert.deepEqual(p.previewCleared(1, 'a', 5), []);
});

test('所有内置关卡开局每根毛线都缠着，且在给定步数内可解', () => {
  (levels as LevelData[]).forEach((lv, i) => {
    const p = new Puzzle(lv);
    for (const [id, n] of p.tangleCounts()) assert.ok(n > 0, `关卡${i + 1} 毛线${id} 开局就是松的`);
    const geo = new BoardGeo(lv.cols, lv.rows, lv.mask);
    const par = solve(geo, lv.ropes.map(([, a, b]) => [a, b]), 60);
    assert.ok(par > 0 && par <= lv.steps, `关卡${i + 1} 求解 ${par} 步，给了 ${lv.steps} 步`);
  });
});
