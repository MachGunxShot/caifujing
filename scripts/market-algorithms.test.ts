import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PostMatchReview } from '../src/types/fortuneActuary';
import { market1x2 } from '../src/utils/euroStatistics';
import { alternativeMarketProbabilities, compareAlgorithms, MIN_CALIBRATION_MATCHES } from '../src/utils/marketAlgorithms';
import { generateActuarialRuleReport } from '../src/utils/actuaryEngine';
import { PRESET_CASES } from '../src/utils/presetCases';

test('Shin agrees with the reference example; Power and Shin normalize positive overround', () => {
  const market = market1x2({ earlyWin: 0, earlyDraw: 0, earlyLoss: 0, lateWin: 2.6, lateDraw: 2.4, lateLoss: 4.3 })!;
  const { shin, power } = alternativeMarketProbabilities(market);
  assert.ok(Math.abs(shin.WIN - 0.3729940603) < 1e-8);
  assert.ok(Math.abs(shin.DRAW - 0.4047794109) < 1e-8);
  for (const p of [shin, power]) {
    assert.ok(Math.abs(p.WIN + p.DRAW + p.LOSS - 1) < 1e-10);
    assert.ok(Math.min(p.WIN, p.DRAW, p.LOSS) > 0);
    assert.ok(p.DRAW > p.WIN && p.WIN > p.LOSS);
  }
});

function fixture(day: string, actualScore: string): PostMatchReview {
  const matchData = structuredClone(PRESET_CASES[0].data);
  matchData.matchInfo.matchTime = day + ' 20:00';
  return {
    id: day, matchData, priorReport: generateActuarialRuleReport(matchData), actualScore,
    actualHomeScore: Number(actualScore[0]), actualAwayScore: Number(actualScore[2]), salesDate: day, reviewTimestamp: 0,
    outcomeEvaluation: { euroHit: false, handicapHit: false, overUnderHit: false, scoreHit: false, modelVerified: false, summaryNote: '' },
    dissectionText: '', evolvedRuleTitle: '', evolvedRuleContent: '', ruleCategory: 'GENERAL',
  };
}

test('rolling evaluation uses the same matches for all algorithms and leaves a calendar day between train and test', () => {
  const training = Array.from({ length: MIN_CALIBRATION_MATCHES }, () => fixture('2026-11-23', '1-0'));
  const gapDay = fixture('2026-11-24', '0-1');
  const lastDay = fixture('2026-11-25', '1-0');
  const results = compareAlgorithms([...training, gapDay, lastDay], false);
  assert.equal(results.evaluatedDays, 1);
  assert.equal(results.results.euro.n, 1);
  assert.equal(results.results.combined.n, 1);
  assert.equal(results.results.power.n, 1);
  assert.ok(Number.isFinite(results.results.euro.logLoss));
  assert.deepEqual(results.results, compareAlgorithms([...training, fixture('2026-11-24', '1-0'), lastDay], false).results);
  assert.equal(compareAlgorithms([...training, gapDay, lastDay], true).available, 0);
});
