import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardGeo, LevelData, Puzzle } from '../src/core/puzzle';
import { makeRules } from '../src/core/rules';
import { solve } from '../src/core/solver';
import levels from '../src/levels/levels.json';

/** 网格孔位：孔号 = 行 * cols + 列 */
function grid(cols: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c, r]);
  return out;
}
const full3 = grid(3, 3);

function level(ropes: [number, number, number][], steps = 5): LevelData {
  return { holes: full3, pieces: [], ropes, steps, par: 1 };
}

test('交叉的两根毛线判定为缠绕，平行的不缠绕', () => {
  const geo = new BoardGeo(full3);
  assert.equal(geo.tangled(0, 8, 2, 6), true);
  assert.equal(geo.tangled(0, 6, 2, 8), false);
});

test('毛线压在别人的纽扣上也算缠绕', () => {
  const geo = new BoardGeo(full3);
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

test('被压在下面的毛线拉不出来，只能在上层底下滑动', () => {
  // 1 号在上、0 号在下（数组靠后的在上）
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.deepEqual(p.tangledPairs(), [{ top: 1, bottom: 0 }]);
  // 挪到最上排会从 1 号底下拉出来：不允许，也不扣步数
  assert.equal(p.canMove(0, 'b', 1), false);
  assert.equal(p.pulledOutFrom(0, 'b', 1), 1);
  assert.deepEqual(p.move(0, 'b', 1), []);
  assert.equal(p.stepsLeft, 5);
  // 仍从 1 号底下穿过的位置可以挪，依然被压着
  assert.equal(p.canMove(0, 'b', 7), true);
  p.move(0, 'b', 7);
  assert.deepEqual(p.tangledPairs(), [{ top: 1, bottom: 0 }]);
  // 把上面那根拎到最上排，两根才一起解开
  assert.deepEqual(p.move(1, 'b', 1).sort(), [0, 1]);
  assert.equal(p.isWon, true);
});

test('压在上面的毛线挪到新位置还交叉时，依然压着', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  p.move(1, 'a', 5); // (2,1)-(0,2) 仍和对角线交叉
  assert.deepEqual(p.tangledPairs(), [{ top: 1, bottom: 0 }]);
});

test('不能挪到被占用或不存在的孔', () => {
  const p = new Puzzle(level([[0, 0, 8], [1, 2, 6]]));
  assert.equal(p.canMove(0, 'a', 2), false);
  assert.equal(p.canMove(0, 'a', 99), false);
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

// 4x4 棋盘上三根毛线：0 号 (0,0)-(3,3) 对角线，1 号 (3,0)-(0,3) 反对角线，2 号 (1,0)-(1,3) 竖线
const full4 = grid(4, 4);
function level4(extra: Partial<LevelData>): LevelData {
  return { holes: full4, pieces: [], ropes: [[0, 0, 15], [1, 3, 12], [2, 1, 13]], steps: 9, par: 1, ...extra };
}

test('缝住的纽扣不能移动，另一端可以', () => {
  const p = new Puzzle(level4({ fixed: [[0, 0]] }));
  assert.equal(p.canLift(0, 'a'), false);
  assert.equal(p.canLift(0, 'b'), true);
  assert.deepEqual(p.move(0, 'a', 4), []);
  assert.equal(p.stepsLeft, 9);
});

test('打盹的小猫：理顺够数量的毛线后才醒', () => {
  const p = new Puzzle(level4({ sleepers: [[2, 1]] }));
  assert.equal(p.sleepLeft(2), 1);
  assert.equal(p.canLift(2, 'a'), false);
  p.cut(1); // 剪掉一根，计数归零
  assert.equal(p.sleepLeft(2), 0);
  assert.equal(p.canLift(2, 'a'), true);
});

test('毛线锁：钥匙毛线理顺前孔不能放，理顺后打开', () => {
  const p = new Puzzle(level4({ locks: [[5, 1]] }));
  assert.equal(p.isFreeHole(5), false);
  assert.deepEqual(p.activeLocks(), [[5, 1]]);
  p.cut(1);
  assert.equal(p.isFreeHole(5), true);
  assert.deepEqual(p.activeLocks(), []);
});

test('所有纽扣都动不了时判为卡死', () => {
  const p = new Puzzle(level4({ fixed: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] }));
  assert.equal(p.isStuck, true);
  assert.equal(p.isLost, true);
});

test('所有内置关卡开局每根毛线都缠着，且在给定步数内可解', () => {
  (levels as unknown as LevelData[]).forEach((lv, i) => {
    const p = new Puzzle(lv);
    for (const [id, n] of p.tangleCounts()) assert.ok(n > 0, `关卡${i + 1} 毛线${id} 开局就是松的`);
    const par = solve(makeRules(lv), p.state, 300);
    assert.ok(par > 0 && par <= lv.steps, `关卡${i + 1} 求解 ${par} 步，给了 ${lv.steps} 步`);
  });
});
