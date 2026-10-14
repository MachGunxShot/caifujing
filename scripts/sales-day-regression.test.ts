import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { FullMatchData, PostMatchReview } from '../src/types/fortuneActuary';
import { generateActuarialRuleReport } from '../src/utils/actuaryEngine';
import {
  evaluateMatchOutcomeAndExtractLesson,
  getPostMatchReviews,
  savePostMatchReview,
} from '../src/utils/experienceStore';
import { PRESET_CASES } from '../src/utils/presetCases';
import {
  calculateSalesDate,
  calibrateReviewSalesDate,
  extractKickoffTime,
  getReviewSalesInfo,
} from '../src/utils/salesDayUtils';

// A disposable browser archive: these tests never touch the user's browser data.
const archive = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return archive.size; },
  clear: () => archive.clear(),
  getItem: (key: string) => archive.get(key) ?? null,
  key: (index: number) => [...archive.keys()][index] ?? null,
  removeItem: (key: string) => { archive.delete(key); },
  setItem: (key: string, value: string) => { archive.set(key, String(value)); },
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });

const REVIEWS_KEY = 'fortune_actuary_reviews_v1';
const BACKUP_KEY = 'fortune_reviews_sales_day_backup_v1';
const historicTimestamp = Date.parse('2026-10-12T08:00:00+08:00');
beforeEach(() => archive.clear());

function match(kickoff: string): FullMatchData {
  const data = structuredClone(PRESET_CASES[0].data);
  data.matchInfo.matchTime = kickoff;
  return data;
}

function review(kickoff: string, overrides: Partial<PostMatchReview> = {}): PostMatchReview {
  const matchData = match(kickoff);
  return {
    id: `fixture-${kickoff}`,
    matchData,
    priorReport: generateActuarialRuleReport(matchData),
    actualScore: '2-0',
    actualHomeScore: 2,
    actualAwayScore: 0,
    reviewTimestamp: historicTimestamp,
    outcomeEvaluation: {
      euroHit: true, handicapHit: true, overUnderHit: false,
      scoreHit: true, modelVerified: true, summaryNote: 'fixture',
    },
    dissectionText: '', evolvedRuleTitle: '', evolvedRuleContent: '',
    ruleCategory: 'POSITIVE_CONTROL',
    ...overrides,
  };
}

test('11:00 is the inclusive sales-day boundary in Beijing time', () => {
  assert.equal(calculateSalesDate('2026-10-11 10:59').salesDate, '2026-10-10');
  assert.equal(calculateSalesDate('2026-10-11 11:00').salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('2026-10-12 00:00').salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('2026-10-12 10:59').salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('2026-10-12 11:00').salesDate, '2026-10-12');
  assert.equal(calculateSalesDate('2026-10-11 23:00').salesCycleText, '10-11 11:00 ~ 10-12 11:00');
});

test('month, leap-day and year rollovers retain the exact calendar day', () => {
  assert.equal(calculateSalesDate('2026-11-01 10:59').salesDate, '2026-10-31');
  assert.equal(calculateSalesDate('2027-01-01 03:00').salesDate, '2026-12-31');
  assert.equal(calculateSalesDate('2024-03-01 10:59').salesDate, '2024-02-29');
  assert.equal(calculateSalesDate('2026-12-31 23:00').salesCycleText, '12-31 11:00 ~ 01-01 11:00');
  assert.equal(calculateSalesDate('01-01 03:00', undefined, '2026-12-31').salesDate, '2026-12-31');
});

test('zoned ISO instants use UTC+8 at both sides of 11:00', () => {
  for (const input of ['2026-10-11T10:59:00+08:00', '2026-10-11T02:59:00Z', '2026-10-11T02:59:00.000Z']) {
    const info = calculateSalesDate(input);
    assert.equal(info.salesDate, '2026-10-10', input);
    assert.equal(info.kickoffTimeFormatted, '2026-10-11 10:59', input);
  }
  for (const input of ['2026-10-11T11:00:00+08:00', '2026-10-11T03:00:00Z']) {
    assert.equal(calculateSalesDate(input).salesDate, '2026-10-11', input);
  }
});

test('invalid calendar dates are not silently normalized into another match day', () => {
  const anchor = '2026-02-28';
  for (const input of ['2026-02-30 03:00', '2026-13-01 03:00', '2026-02-30T03:00:00+08:00']) {
    assert.equal(calculateSalesDate(input, historicTimestamp, anchor).salesDate, anchor, input);
  }
});

test('time-only matches belong to their anchored sales cycle without repeated backward shifts', () => {
  assert.equal(calculateSalesDate('03:00', historicTimestamp, '2026-10-11').salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('10:59', historicTimestamp, '2026-10-11').salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('11:00', historicTimestamp, '2026-10-11').salesDate, '2026-10-11');
  assert.equal(extractKickoffTime('开赛：03:00', '# 2026-10-11 销售日'), '2026-10-12 03:00');
  assert.equal(extractKickoffTime('| 英超 | 10:59 | 曼城 | 埃弗顿 |', '销售日：2026-10-31'), '2026-11-01 10:59');
  assert.equal(extractKickoffTime('开赛：03:00', '销售日：2026-12-31'), '2027-01-01 03:00');
});

test('an early-morning import timestamp falls back to the active previous sales day', () => {
  const earlyImport = Date.parse('2026-10-12T08:00:00+08:00');
  assert.equal(calculateSalesDate(undefined, earlyImport).salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('临场', earlyImport).salesDate, '2026-10-11');
  assert.equal(calculateSalesDate('03:00', earlyImport).salesDate, '2026-10-11');
  assert.equal(calculateSalesDate(undefined, Date.parse('2026-10-12T11:00:00+08:00')).salesDate, '2026-10-12');
});

test('complete Chinese calendar dates are parsed from match labels', () => {
  assert.equal(extractKickoffTime('开赛时间：2026年10月12日 03：00'), '2026-10-12 03:00');
  assert.equal(calculateSalesDate('2026年10月12日 03：00').salesDate, '2026-10-11');
  assert.equal(extractKickoffTime('比赛时间：2026年10月11日 周日 23:00'), '2026-10-11 23:00');
});

test('ISO kickoff extraction preserves timezone information including fractional seconds', () => {
  assert.equal(extractKickoffTime('开赛时间：2026-10-11T03:00:00Z'), '2026-10-11 11:00');
  assert.equal(extractKickoffTime('开赛时间：2026-10-11T03:00:00.000Z'), '2026-10-11 11:00');
});

test('original calendar kickoff wins over an incorrect saved sales date and generated kickoff', () => {
  const old = review('2026-10-12 03:00', {
    salesDate: '2026-10-12', kickoffTime: '2026-10-13 03:00',
    salesDateLabel: 'wrong', salesCycleText: 'wrong',
  });
  assert.equal(getReviewSalesInfo(old).salesDate, '2026-10-11');
  const calibrated = calibrateReviewSalesDate(old);
  assert.equal(calibrated.salesDate, '2026-10-11');
  assert.equal(calibrated.kickoffTime, '2026-10-12 03:00');
  assert.equal(calibrated.matchData.matchInfo.matchTime, '2026-10-12 03:00');
  assert.equal(old.salesDate, '2026-10-12');
});

test('an explicit manual override survives calibration and repeated saves', () => {
  const corrected = review('2026-10-12 03:00', { salesDate: '2026-10-12', salesDateOverride: '2026-10-10' });
  assert.equal(calibrateReviewSalesDate(corrected).salesDate, '2026-10-10');
  savePostMatchReview(corrected);
  savePostMatchReview({ ...corrected, salesDateOverride: undefined });
  const saved = getPostMatchReviews();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].salesDateOverride, '2026-10-10');
  assert.equal(saved[0].salesDate, '2026-10-10');
  assert.equal(saved[0].matchData.matchInfo.matchTime, '2026-10-12 03:00');
});

test('legacy placeholder display dates do not fabricate an actual kickoff date', () => {
  const old = review('临场', { salesDate: '2026-10-11', kickoffTime: '2026-10-12 临场' });
  const calibrated = calibrateReviewSalesDate(old);
  assert.equal(calibrated.salesDate, '2026-10-11');
  assert.equal(calibrated.kickoffTime, '临场');
  assert.equal(calculateSalesDate('临场', historicTimestamp, '2026-10-11').kickoffTimeFormatted, '临场');
});

test('historical lottery weekday evidence repairs an incorrect current-date grouping', () => {
  const old = review('周六001 03:00', {
    reviewTimestamp: Date.parse('2026-10-11T12:00:00+08:00'),
    salesDate: '2026-10-11', kickoffTime: '2026-10-12 03:00',
  });
  assert.equal(calibrateReviewSalesDate(old).salesDate, '2026-10-10');
  assert.equal(calibrateReviewSalesDate(old).kickoffTime, '2026-10-11 03:00');
});

test('market-story kickoff evidence repairs placeholder records', () => {
  const old = review('临场', { salesDate: '2026-10-12', kickoffTime: '2026-10-12 临场' });
  old.matchData.matchInfo.marketStory = '开赛时间：2026-10-11 23:00；早盘走势稳定。';
  assert.equal(calibrateReviewSalesDate(old).salesDate, '2026-10-11');
  assert.equal(calibrateReviewSalesDate(old).kickoffTime, '2026-10-11 23:00');
});

test('a full original market-story date wins over an old generated kickoff date', () => {
  const old = review('临场', { salesDate: '2026-10-12', kickoffTime: '2026-10-12 23:00' });
  old.matchData.matchInfo.marketStory = '开赛时间：2026-10-11 23:00；早盘走势稳定。';
  const calibrated = calibrateReviewSalesDate(old);
  assert.equal(calibrated.salesDate, '2026-10-11');
  assert.equal(calibrated.kickoffTime, '2026-10-11 23:00');
});

test('calibration is idempotent for full dates, time-only entries, placeholders and overrides', () => {
  const records = [
    review('2026-10-12 03:00', { salesDate: '2026-10-12' }),
    review('03:00', { salesDate: '2026-10-11' }),
    review('临场', { salesDate: '2026-10-11', kickoffTime: '2026-10-12 临场' }),
    review('2026-10-12 03:00', { salesDateOverride: '2026-10-10' }),
  ];
  for (const item of records) {
    const once = calibrateReviewSalesDate(item);
    assert.deepEqual(calibrateReviewSalesDate(once), once, item.matchData.matchInfo.matchTime);
  }
});

test('historical archive migration keeps distinct sales days and backs up original records exactly once', () => {
  const original = JSON.stringify([
    review('2026-10-11 23:00', { id: 'old-one', salesDate: '2026-10-12' }),
    review('2026-10-12 23:00', { id: 'old-two', salesDate: '2026-10-12' }),
  ]);
  memoryStorage.setItem(REVIEWS_KEY, original);
  const migrated = getPostMatchReviews();
  assert.equal(migrated.length, 2);
  assert.deepEqual(migrated.map(item => item.salesDate), ['2026-10-11', '2026-10-12']);
  assert.equal(memoryStorage.getItem(BACKUP_KEY), original);
  const firstSaved = memoryStorage.getItem(REVIEWS_KEY);
  assert.deepEqual(getPostMatchReviews(), migrated);
  assert.equal(memoryStorage.getItem(REVIEWS_KEY), firstSaved);
  assert.equal(memoryStorage.getItem(BACKUP_KEY), original);
});

test('saving the same teams and score on another sales day keeps both games', () => {
  savePostMatchReview(review('2026-10-11 23:00', { id: 'day-one' }));
  const firstArchive = memoryStorage.getItem(REVIEWS_KEY);
  savePostMatchReview(review('2026-10-12 23:00', { id: 'day-two' }));
  const saved = getPostMatchReviews();
  assert.equal(saved.length, 2);
  assert.deepEqual(new Set(saved.map(item => item.salesDate)), new Set(['2026-10-11', '2026-10-12']));
  assert.equal(memoryStorage.getItem(BACKUP_KEY), firstArchive);
  savePostMatchReview(review('2026-10-12 23:00', { id: 'new-id-for-existing-game' }));
  assert.equal(getPostMatchReviews().length, 2);
  assert.equal(getPostMatchReviews().find(item => item.salesDate === '2026-10-12')?.id, 'day-two');
});

test('offline outcome evaluation saves original kickoff under its correct sales day', () => {
  const matchData = match('2026-10-12 03:00');
  const report = generateActuarialRuleReport(matchData);
  const result = evaluateMatchOutcomeAndExtractLesson(matchData, report, 2, 0, '', false, '2026-10-12', historicTimestamp);
  assert.equal(result.salesDate, '2026-10-11');
  assert.equal(result.kickoffTime, '2026-10-12 03:00');
  assert.equal(result.matchData.matchInfo.matchTime, '2026-10-12 03:00');
  assert.equal(getPostMatchReviews().length, 1);
  assert.equal(getPostMatchReviews()[0].salesDate, '2026-10-11');
});

test('re-evaluating a legacy review preserves its ID, manual sales-day override and single archive record', () => {
  const old = review('03:00', { id: 'old-legacy-review-id', salesDate: '2026-10-11', salesDateOverride: '2026-10-09' });
  savePostMatchReview(old);
  const existing = getPostMatchReviews()[0];
  assert.equal(existing.salesDate, '2026-10-09');
  const recalculated = evaluateMatchOutcomeAndExtractLesson(
    existing.matchData, existing.priorReport, 2, 0, '', false,
    '2026-10-11', Date.now(), existing,
  );
  assert.equal(recalculated.id, 'old-legacy-review-id');
  assert.equal(recalculated.salesDate, '2026-10-09');
  assert.equal(recalculated.salesDateOverride, '2026-10-09');
  const saved = getPostMatchReviews();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'old-legacy-review-id');
  assert.equal(saved[0].salesDate, '2026-10-09');
  assert.equal(saved[0].salesDateOverride, '2026-10-09');
});
