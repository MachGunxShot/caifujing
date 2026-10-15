import { test } from 'node:test';
import assert from 'node:assert';
import {
  parseHandicapValue,
  parseOverUnderValue,
  computeActuarialMetrics,
  generateActuarialRuleReport,
  compareEarlyVsLateConfidence,
} from '../src/utils/actuaryEngine';
import { FullMatchData } from '../src/types/fortuneActuary';

test('Bournemouth vs Sturm Graz: cross-handicap compensation prevents false trap and affirms 5-star positive control', () => {
  // Early odds: Euro 1.22 / 6.00 / 11.00, Asian 球半 (-1.5) 1.67 / 2.20, OU 3.5
  // Late odds: Euro 1.15 / 7.50 / 15.00, Asian 两球/两球半 (-2.25) 1.91 / 1.80, OU 3.5/4 (3.75)
  const bournemouthMatch: FullMatchData = {
    matchInfo: {
      league: '欧联杯',
      homeTeam: 'AFC伯恩茅斯',
      awayTeam: '格拉茨风暴',
      matchTime: '01:56',
      marketStory: '(-2)让胜指数大幅跳水，机构全面砸盘防大胜',
    },
    asianHandicap: {
      earlyHandicap: '球半',
      earlyHomeOdds: 1.67,
      earlyAwayOdds: 2.20,
      lateHandicap: '两球/两球半',
      lateHomeOdds: 1.91,
      lateAwayOdds: 1.80,
    },
    euroOdds: {
      earlyWin: 1.22,
      earlyDraw: 6.00,
      earlyLoss: 11.00,
      lateWin: 1.15,
      lateDraw: 7.50,
      lateLoss: 15.00,
    },
    overUnder: {
      earlyLine: '3.5',
      earlyOverOdds: 1.95,
      earlyUnderOdds: 1.85,
      lateLine: '3.5/4',
      lateOverOdds: 1.92,
      lateUnderOdds: 1.88,
    },
  };

  // 1. Verify parseHandicapValue and parseOverUnderValue
  assert.strictEqual(parseHandicapValue('球半'), -1.5);
  assert.strictEqual(parseHandicapValue('两球/两球半'), -2.25);
  assert.strictEqual(parseOverUnderValue('3.5/4'), 3.75);

  // 2. Late report generation: model must be POSITIVE_CONTROL (升盘阻上) and 5 stars!
  const lateReport = generateActuarialRuleReport(bournemouthMatch);
  assert.strictEqual(lateReport.identifiedModel, 'POSITIVE_CONTROL');
  assert.strictEqual(lateReport.decision.starRating, 5);
  assert.ok(lateReport.decision.euroPick.includes('主胜'));
  assert.ok(lateReport.decision.handicapPick.includes('上盘'));
  assert.ok(!lateReport.decision.euroPick.includes('防1球小胜'), 'Must NOT say 防1球小胜');

  // 3. Early vs Late confidence comparison
  const shift = compareEarlyVsLateConfidence(bournemouthMatch, lateReport);
  assert.strictEqual(shift.shiftType, 'INCREASED');
  assert.ok(shift.summaryTitle.includes('升盘阻上穿盘稳胆') || shift.summaryTitle.includes('强化') || shift.summaryTitle.includes('增加'));
  assert.ok(!shift.summaryTitle.includes('衰减'), 'Must NOT report confidence decay');
  assert.ok(!shift.summaryTitle.includes('谨防诱盘陷阱'), 'Must NOT report fake trap alarm');

  // 4. Verify text template does not contradict
  assert.ok(!shift.detailedExplanation.includes('不降反升'), 'Must not say 不降反升 when odds dropped');
  assert.ok(shift.detailedExplanation.includes('升盘阻上') || shift.detailedExplanation.includes('正向控赔'));
  assert.ok(shift.detailedExplanation.includes('0.07') || shift.detailedExplanation.includes('下调'));

  console.log('Test passed successfully: Bournemouth correctly identified as 5-star positive control with increased confidence!');
});
