import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateActuarialRuleReport } from '../src/utils/actuaryEngine';
import { consolidateRulesToCoreMaster, SEED_RULES } from '../src/utils/experienceStore';
import { PRESET_CASES } from '../src/utils/presetCases';
import { assessV4 } from '../src/utils/coreRulesV4';

function fixture() {
  const data = structuredClone(PRESET_CASES[0].data);
  data.euroOdds = { earlyWin: 1.75, earlyDraw: 3.5, earlyLoss: 5, lateWin: 1.45, lateDraw: 4, lateLoss: 6 };
  data.asianHandicap = { earlyHandicap: '-0.25', lateHandicap: '-0.75', earlyHomeOdds: 1.95, lateHomeOdds: 1.72, earlyAwayOdds: 1.95, lateAwayOdds: 2.05 };
  data.overUnder = { earlyLine: '2.5', lateLine: '2.5', earlyOverOdds: 1.9, lateOverOdds: 1.9, earlyUnderOdds: 1.9, lateUnderOdds: 1.9 };
  return data;
}

test('a two-step rise with a stalled total needs team evidence; explicit dominance clears that specific veto', () => {
  const data = fixture();
  for (const profile of [undefined, 'ordinary', 'challenger'] as const) {
    data.matchInfo.homeProfile = profile;
    const {decision} = generateActuarialRuleReport(data);
    assert.equal(decision.starRating, 3);
    assert.equal(decision.coreEligible, false);
    assert.match(decision.v4Assessment!, /跨档/);
  }
  data.matchInfo.homeProfile = 'dominant';
  const {decision} = generateActuarialRuleReport(data);
  assert.equal(decision.starRating, 5);
  assert.equal(decision.coreEligible, true);
});

test('away challenger veto starts at 1.25, and an unknown away profile stays pending', () => {
  const data = fixture();
  data.matchInfo.awayProfile = 'challenger';
  assert.match(assessV4(data, 1, 1.25, 2.5, 3).notes.join(''), /客场新贵/);
  assert.deepEqual(assessV4(data, 0.75, 1, 2.5, 3).notes, []);
  data.matchInfo.awayProfile = undefined;
  assert.match(assessV4(data, 1, 1.25, 2.5, 3).notes.join(''), /核实客队/);
  data.matchInfo.awayProfile = 'ordinary';
  assert.deepEqual(assessV4(data, 1, 1.25, 2.5, 3).notes, []);
});

test('falling water on a shallow unchanged line vetoes; a static short price cannot alone earn five stars', () => {
  const data = fixture();
  data.asianHandicap.earlyHandicap = '-0.75';
  const watch = generateActuarialRuleReport(data);
  assert.match(watch.finalVerdict.riskWarning, /原盘降至低水/);
  assert.equal(watch.decision.coreEligible, false);
  data.asianHandicap.earlyHomeOdds = data.asianHandicap.lateHomeOdds;
  data.euroOdds.earlyWin = data.euroOdds.lateWin;
  const steady = generateActuarialRuleReport(data);
  assert.ok(steady.decision.starRating < 5);
  assert.equal(steady.decision.coreEligible, false);
});

test('refreshing core rules preserves manual rules, examples, switches and existing counts', () => {
  const prior = { ...SEED_RULES[0], ruleContent: '旧版本', isActive: false, hitCount: 17, sourceMatch: '自有案例' };
  const manual = { ...prior, id: 'manual-test' };
  const upgraded = consolidateRulesToCoreMaster([prior, manual]);
  const refreshed = upgraded.find(rule => rule.id === prior.id)!;
  assert.equal(refreshed.ruleContent, SEED_RULES[0].ruleContent);
  assert.equal(refreshed.sourceMatch, prior.sourceMatch);
  assert.equal(refreshed.hitCount, 17);
  assert.equal(refreshed.isActive, false);
  assert.deepEqual(upgraded.find(rule => rule.id === manual.id), manual);
  assert.equal(upgraded.filter(rule => rule.id === 'rule-risk-v4-red-lines').length, 1);
  assert.deepEqual(consolidateRulesToCoreMaster(upgraded), upgraded);
});

test('an unreadable opening line cannot confirm a later market move', () => {
  const data = fixture();
  data.asianHandicap.earlyHandicap = '待补';
  const decision = generateActuarialRuleReport(data).decision;
  assert.match(decision.v4Assessment!, /行情不完整/);
  assert.equal(decision.coreEligible, false);
});
