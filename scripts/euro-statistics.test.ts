import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEuroPick, euroStatistics, settleEuroReview, displayRate } from '../src/utils/euroStatistics';
import { evaluateEuroHit } from '../src/utils/experienceStore';
import type { PostMatchReview } from '../src/types/fortuneActuary';

function review(pick: string, score: string, prices = [2, 3, 4]): PostMatchReview {
  const [lateWin, lateDraw, lateLoss] = prices;
  return {
    actualScore: score,
    matchData: { euroOdds: { lateWin, lateDraw, lateLoss } },
    priorReport: { decision: { euroPick: pick } },
    outcomeEvaluation: { euroHit: true }, // persisted flags may predate the correction
  } as PostMatchReview;
}

test('the away/draw label cannot win on a home victory', () => {
  const label = '客胜 / 平 (客队不败)';
  assert.equal(evaluateEuroHit(label, 'WIN'), false);
  assert.equal(evaluateEuroHit(label, 'DRAW'), true);
  assert.equal(evaluateEuroHit(label, 'LOSS'), true);
  assert.deepEqual(parseEuroPick('主胜独赢 (防1球小胜)'), ['WIN']);
  assert.deepEqual(parseEuroPick('平 / 客胜 (防冷首选平，客队保平争胜)'), ['DRAW','LOSS']);
  assert.deepEqual(parseEuroPick('平局 / 让球双选 (首选胆平 1-1/0-0)'), ['DRAW']);
  assert.deepEqual(parseEuroPick('让球胜 (主胜/平 杀绝上盘)'), ['WIN','DRAW']);
  assert.deepEqual(parseEuroPick('未知'), []);
});

test('single and double selections both risk exactly one unit per match', () => {
  const stats = euroStatistics([
    review('主胜', '2-1'), review('客胜 / 平', '2-1'),
    review('客胜 / 平', '1-1'), review('客胜 / 平', '0-1'),
  ]);
  assert.deepEqual(stats.single, { hits:1, total:1 });
  assert.deepEqual(stats.double, { hits:2, total:3 });
  assert.equal(stats.profit, 1.5);
  assert.equal(displayRate(stats.profit, stats.priced), '37.50%');
});

test('invalid prices exclude ROI only; unreadable scores and picks cannot settle', () => {
  const stats = euroStatistics([review('主胜','1-0',[2,1,4]), review('主胜','待定'), review('未知','2-0')]);
  assert.equal(stats.settled, 1);
  assert.equal(stats.hits, 1);
  assert.equal(stats.priced, 0);
  assert.equal(displayRate(stats.profit, stats.priced), '—');
});

test('structured selections are used for new snapshots; older reviews settle from labels', () => {
  const row = review('旧版展示文字','1:1');
  row.priorReport.decision.euroOutcomes = ['DRAW','LOSS'];
  assert.deepEqual(settleEuroReview(row), { hit:true, choices:2, profit:0.5 });
  assert.deepEqual(settleEuroReview(review('平 / 负','1:1')), settleEuroReview(row));
});

test('five selected singles return the sum of the three winning decimal prices including stake', () => {
  const selected = [
    review('主胜', '2-0', [1.60, 3, 4]), review('平', '0-0', [2, 2.10, 4]),
    review('客胜', '0-1', [2, 3, 1.80]), review('主胜', '0-1'), review('平', '1-0'),
  ];
  const { priced, profit } = euroStatistics(selected);
  assert.equal(priced, 5);
  assert.equal((priced + profit).toFixed(2), '5.50');
  assert.equal(profit.toFixed(2), '0.50');
  assert.equal(displayRate(profit, priced), '10.00%');
});
