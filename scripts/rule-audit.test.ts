import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BatchMatchItem, FullMatchData, PostMatchReview } from '../src/types/fortuneActuary';
import { PRESET_CASES } from '../src/utils/presetCases';
import { generateActuarialRuleReport } from '../src/utils/actuaryEngine';
import { auditRules, MIN_SIGNAL_HISTORY } from '../src/utils/ruleAudit';
import { hasVerifiedSnapshot, sealQueuePrediction, snapshotKickoff } from '../src/utils/predictionSnapshot';
import { market1x2 } from '../src/utils/euroStatistics';
import { evaluateMatchOutcomeAndExtractLesson, getPostMatchReviews, savePostMatchReview } from '../src/utils/experienceStore';

function fixture(): FullMatchData {
  const data = structuredClone(PRESET_CASES[0].data);
  data.matchInfo = { league: '测试', homeTeam: '主队', awayTeam: '客队', matchTime: '2026-11-26 20:00', marketStory: '', homeProfile: 'ordinary', awayProfile: 'ordinary' };
  data.euroOdds = { earlyWin: 1.75, earlyDraw: 3.5, earlyLoss: 5, lateWin: 1.45, lateDraw: 4, lateLoss: 6 };
  data.asianHandicap = { earlyHandicap: '-0.25', lateHandicap: '-0.75', earlyHomeOdds: 1.95, lateHomeOdds: 1.72, earlyAwayOdds: 1.95, lateAwayOdds: 2.05 };
  data.overUnder = { earlyLine: '2.5', lateLine: '2.5', earlyOverOdds: 1.9, lateOverOdds: 1.9, earlyUnderOdds: 1.9, lateUnderOdds: 1.9 };
  return data;
}

function review(data: FullMatchData, result = '1-0', verified = false): PostMatchReview {
  const report = generateActuarialRuleReport(data);
  const kickoffAt = snapshotKickoff(data);
  const snapshot = verified ? { kickoffAt, recordedAt: kickoffAt! - 3_600_000, frozenAt: kickoffAt! - 3_600_000, ruleVersion: 'v4' } : undefined;
  return {
    id: 'test',
    matchData: data,
    priorReport: report,
    predictionSnapshot: snapshot,
    actualScore: result,
    actualHomeScore: Number(result[0]),
    actualAwayScore: Number(result[2]),
    reviewTimestamp: (kickoffAt ?? 0) + 3_600_000,
    resultRecordedAt: (kickoffAt ?? 0) + 3_600_000,
    salesDate: data.matchInfo.matchTime.slice(0, 10),
    outcomeEvaluation: { euroHit: false, handicapHit: false, overUnderHit: false, scoreHit: false, modelVerified: false, summaryNote: '' },
    dissectionText: '', evolvedRuleTitle: '', evolvedRuleContent: '', ruleCategory: 'GENERAL',
  };
}

test('a saved market snapshot requires genuine market time and a complete kickoff to verify', () => {
  const data = fixture();
  const kickoff = Date.parse('2026-11-26T12:00:00Z');
  const queue = { id: 'test', data, timestamp: kickoff - 1, status: 'done' } satisfies BatchMatchItem;
  const sealed = sealQueuePrediction(queue, kickoff - 1, true);
  assert.equal(snapshotKickoff(data), kickoff);
  assert.equal(hasVerifiedSnapshot(sealed.predictionSnapshot), true);
  assert.equal(sealed.report?.ruleVersion, 'v4');
  assert.equal(sealQueuePrediction(sealed, kickoff + 1, true), sealed);
  assert.equal(sealQueuePrediction(queue, kickoff + 1, true).predictionSnapshot, undefined);
  assert.equal(sealQueuePrediction(queue, kickoff + 1).predictionSnapshot, undefined);
  const timely = { ...queue, report: generateActuarialRuleReport(data), marketRecordedAt: kickoff - 1 };
  assert.equal(hasVerifiedSnapshot(sealQueuePrediction(timely, kickoff + 1).predictionSnapshot), true);
  const missing = { ...queue, data: { ...data, matchInfo: { ...data.matchInfo, matchTime: '20:00' } } };
  assert.equal(hasVerifiedSnapshot(sealQueuePrediction(missing, kickoff - 1, true).predictionSnapshot), false);
});

test('paired market stats and isolated red-line trial leave archived predictions intact', () => {
  const data = fixture();
  const row = review(data);
  const unknown = fixture();
  delete unknown.matchInfo.homeProfile;
  const placeholder = fixture();
  placeholder.matchInfo.league = '实战复盘录入';
  const audits = [row, review(unknown), review(placeholder)];
  const serialized = JSON.stringify(audits);
  const result = auditRules(audits, 'five', 'crossLine', false);
  assert.equal(result.qualifying, 2);
  assert.equal(result.placeholders, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.baseline.total, 0);
  assert.equal(result.candidate.total, 1);
  assert.equal(result.candidate.marketHits, 1);
  assert.equal(result.candidate.profit, result.candidate.marketProfit);
  assert.equal(result.bands[1].added.total, 1);
  assert.equal(result.daily[0][1].added.total, 1);
  assert.equal(JSON.stringify(audits), serialized);
});

test('probability correction uses only earlier sales days with a result available before the snapshot', () => {
  const odds = market1x2(fixture().euroOdds)!;
  assert.ok(Math.abs(Object.values(odds.probabilities).reduce((sum, prob) => sum + prob, 0) - 1) < 1e-12);
  const sampleOn = (day: string) => {
    const data = fixture();
    data.matchInfo.matchTime = day + ' 20:00';
    data.overUnder.lateLine = '3';
    return review(data, '1-0', true);
  };
  const prior = Array.from({ length: MIN_SIGNAL_HISTORY }, () => sampleOn('2026-11-24'));
  const current = sampleOn('2026-11-25');
  const sameDayData = structuredClone(current.matchData);
  sameDayData.matchInfo.matchTime = '2026-11-25 13:00';
  const sameDay = review(sameDayData, '1-0', true);
  const inTime = auditRules([...prior, current, sameDay], 'single', 'shallowWater', true);
  assert.equal(inTime.rolling.total, 2);
  assert.ok(inTime.rolling.candidate < inTime.rolling.matchedMarket);
  prior[0].resultRecordedAt = current.predictionSnapshot!.recordedAt + 1;
  assert.equal(auditRules([...prior, current, sameDay], 'single', 'shallowWater', true).rolling.total, 0);
});


test('correcting a score keeps the saved prediction and market data', () => {
  const memory = new Map<string, string>();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  } });
  try {
    const original = review(fixture(), '1-0', true);
    assert.equal(savePostMatchReview(original), true);
    const newer = fixture();
    newer.euroOdds.lateWin = 2;
    const saved = evaluateMatchOutcomeAndExtractLesson(newer, generateActuarialRuleReport(newer), 0, 1,
      '', false, original.salesDate, original.reviewTimestamp, original);
    assert.equal(saved.actualScore, '0-1');
    assert.equal(saved.matchData.euroOdds.lateWin, original.matchData.euroOdds.lateWin);
    assert.deepEqual(getPostMatchReviews()[0].predictionSnapshot, original.predictionSnapshot);
    assert.deepEqual(getPostMatchReviews()[0].priorReport.decision, original.priorReport.decision);
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
