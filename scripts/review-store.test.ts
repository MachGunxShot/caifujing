import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { FullMatchData } from '../src/types/fortuneActuary';
import { generateActuarialRuleReport } from '../src/utils/actuaryEngine';
import {
  evaluateMatchOutcomeAndExtractLesson,
  getPostMatchReviews,
  savePostMatchReview,
} from '../src/utils/experienceStore';
import { PRESET_CASES } from '../src/utils/presetCases';

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
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });

const REVIEWS_KEY = 'fortune_actuary_reviews_v1';

function matchData(): FullMatchData {
  const base = structuredClone(PRESET_CASES[0].data);
  base.matchInfo = { ...base.matchInfo, homeTeam: '测试主队', awayTeam: '测试客队', matchTime: '2026-10-12 20:00' };
  return base;
}

function reviewWithScore(home: number, away: number, id?: string) {
  const data = matchData();
  const review = evaluateMatchOutcomeAndExtractLesson(data, generateActuarialRuleReport(data), home, away, '', false, undefined, Date.parse('2026-10-12T08:00:00Z'));
  return id ? { ...review, id } : review;
}

beforeEach(() => archive.clear());

test('correcting a mistyped score replaces the archived review instead of adding a duplicate', () => {
  savePostMatchReview(reviewWithScore(1, 0, 'first-entry'));
  const originalId = getPostMatchReviews()[0].id;
  savePostMatchReview(reviewWithScore(2, 0, 'second-entry'));
  const reviews = getPostMatchReviews();
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].actualScore, '2-0');
  assert.equal(reviews[0].id, originalId, 'the archived record keeps its stable ID');
});

test('repeated reads return independent copies, so mutating one cannot corrupt the cache', () => {
  savePostMatchReview(reviewWithScore(1, 1));
  const first = getPostMatchReviews();
  first[0].actualScore = 'mutated';
  assert.equal(getPostMatchReviews()[0].actualScore, '1-1');
});

test('a direct write to storage invalidates the read cache', () => {
  savePostMatchReview(reviewWithScore(3, 1));
  assert.equal(getPostMatchReviews().length, 1);
  localStorage.setItem(REVIEWS_KEY, '[]');
  assert.equal(getPostMatchReviews().length, 0);
});

test('a review with an unreadable score keeps its stored evaluation instead of being re-graded as 0-0', () => {
  const review = reviewWithScore(2, 1);
  const stored = {
    ...review,
    actualScore: '?-?',
    actualHomeScore: undefined,
    actualAwayScore: undefined,
    outcomeEvaluation: { ...review.outcomeEvaluation, euroHit: true, handicapHit: true, modelVerified: true },
  };
  localStorage.setItem(REVIEWS_KEY, JSON.stringify([stored]));
  const [loaded] = getPostMatchReviews();
  assert.equal(loaded.outcomeEvaluation.euroHit, true);
  assert.equal(loaded.outcomeEvaluation.handicapHit, true);
  assert.equal(loaded.outcomeEvaluation.modelVerified, true);
});

test('one invalid archive row does not hide or overwrite valid history on the next save', () => {
  const original = reviewWithScore(1, 0, 'original');
  const next = reviewWithScore(2, 0, 'another');
  next.matchData.matchInfo.homeTeam = '另一主队';
  const broken = { id: 'legacy-incomplete', matchData: null };
  memoryStorage.setItem(REVIEWS_KEY, JSON.stringify([null, original, broken]));
  assert.deepEqual(getPostMatchReviews().map(r => r.id), ['original']);
  assert.equal(savePostMatchReview(next), true);
  assert.deepEqual(getPostMatchReviews().map(r => r.id), ['another', 'original']);
  const rows = JSON.parse(memoryStorage.getItem(REVIEWS_KEY)!);
  assert.deepEqual(rows.slice(-2), [null, broken]);
});

test('unreadable JSON or an unexpected root cannot be replaced by a normal save', () => {
  const review = reviewWithScore(1, 0);
  for (const raw of ['{', '{}', 'null', '']) {
    memoryStorage.setItem(REVIEWS_KEY, raw);
    assert.equal(savePostMatchReview(review), false);
    assert.equal(memoryStorage.getItem(REVIEWS_KEY), raw);
  }
});

test('winning the match by two on a 2.25 line correctly describes both sides of the bet', () => {
  for (const [line, home, away] of [['两球/两球半', 3, 1], ['受两球/两球半', 1, 3]] as const) {
    const data = matchData();
    data.asianHandicap.lateHandicap = line;
    const report = generateActuarialRuleReport(data);
    report.decision.handicapPick = '上盘';
    const review = evaluateMatchOutcomeAndExtractLesson(data, report, home, away);
    assert.equal(review.outcomeEvaluation.handicapDetail, 'LOSE_HALF');
    assert.match(review.evolvedRuleContent, /净胜 2 球/);
    assert.match(review.evolvedRuleContent, /上盘输半，受让方【.+】赢半/);
    const legacy = { ...review, evolvedRuleTitle: '旧档【测试】强队赢球输盘/小胜卡盘修正法',
      evolvedRuleContent: '针对 瑞典超 让步 两球/两球半 深盘，强队仅取得 1 球微弱优势（完场 3-1），未能完成深盘穿盘，受让方【测试】赢盘守住底线。' };
    memoryStorage.setItem(REVIEWS_KEY, JSON.stringify([legacy]));
    const [repaired] = getPostMatchReviews();
    assert.equal(repaired.evolvedRuleContent, review.evolvedRuleContent);
    assert.equal(repaired.evolvedRuleTitle, review.evolvedRuleTitle);
    assert.deepEqual(repaired.priorReport, JSON.parse(JSON.stringify(report)));
    assert.equal(JSON.parse(memoryStorage.getItem(REVIEWS_KEY)!)[0].evolvedRuleContent, review.evolvedRuleContent);
    memoryStorage.setItem(REVIEWS_KEY, JSON.stringify([{ ...legacy, evolvedRuleContent: '人工复盘笔记' }]));
    assert.equal(getPostMatchReviews()[0].evolvedRuleContent, '人工复盘笔记');
  }
});
