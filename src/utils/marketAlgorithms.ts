import type { EuroOutcome, FullMatchData, PostMatchReview } from '../types/fortuneActuary';
import { generateActuarialRuleReport, parseHandicapValue, parseOverUnderValue } from './actuaryEngine';
import {
  EURO_OUTCOMES, decisionOutcomes, euroBrier, isPlaceholderMarket, market1x2, readStoredScore, type EuroVector,
} from './euroStatistics';
import { hasVerifiedSnapshot, snapshotKickoff } from './predictionSnapshot';
import { calculateSalesDate } from './salesDayUtils';

export const MIN_CALIBRATION_MATCHES = 200;
export const MIN_SIMULATED_EDGE = 0.02;
const DAY_MS = 86_400_000;
const L2 = 0.02;

type Market = NonNullable<ReturnType<typeof market1x2>>;
const mapOutcomes = (value: (outcome: EuroOutcome) => number): EuroVector =>
  ({ WIN: value('WIN'), DRAW: value('DRAW'), LOSS: value('LOSS') });

function unitSum(values: EuroVector): EuroVector {
  const total = values.WIN + values.DRAW + values.LOSS;
  return mapOutcomes(key => values[key] / total);
}

// Power and Shin use different assumptions about where the overround is applied.
export function alternativeMarketProbabilities(market: Market) {
  const inverse = mapOutcomes(key => 1 / market.prices[key]);
  const sum = inverse.WIN + inverse.DRAW + inverse.LOSS;
  if (sum <= 1 + 1e-12) return { power: market.probabilities, shin: market.probabilities };

  const solve = (lower: number, upper: number, valuesAt: (value: number) => EuroVector) => {
    for (let i = 0; i < 44; i++) {
      const value = (lower + upper) / 2;
      const p = valuesAt(value);
      if (p.WIN + p.DRAW + p.LOSS > 1) lower = value;
      else upper = value;
    }
    return unitSum(valuesAt((lower + upper) / 2));
  };
  const largest = inverse[market.lowest];
  const upper = Math.log(1 / 3) / Math.log(largest);
  const power = solve(1, upper, exponent => mapOutcomes(key => inverse[key] ** exponent));
  const shin = solve(0, 1, z => mapOutcomes(key => {
    const weight = inverse[key] ** 2 / sum;
    return 2 * weight / (Math.sqrt(z ** 2 + 4 * (1 - z) * weight) + z);
  }));
  return { power, shin };
}

interface Sample {
  market: Market;
  features: number[][];
  logits: number[];
  actual: EuroOutcome;
  day: number;
  recordedAt?: number;
  resultAt?: number;
  data: FullMatchData;
}

const bounded = (x: number): number => Number.isFinite(x) ? Math.min(1, Math.max(-1, x)) : 0;

function toSample(review: PostMatchReview, verifiedOnly: boolean): Sample[] {
  const data = review.matchData;
  if (isPlaceholderMarket(data) || !data.euroOdds || !data.asianHandicap || !data.overUnder) return [];
  const market = market1x2(data.euroOdds);
  const score = readStoredScore(review);
  if (!market || !score) return [];
  const snapshot = review.predictionSnapshot;
  const verified = hasVerifiedSnapshot(snapshot) && snapshot.ruleVersion === review.priorReport?.ruleVersion
    && snapshot.kickoffAt === snapshotKickoff(data);
  if (verifiedOnly && !verified) return [];
  const salesDate = verified ? calculateSalesDate(new Date(snapshot.kickoffAt).toISOString()).salesDate : review.salesDate;
  const day = typeof salesDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(salesDate) ? Date.parse(salesDate) : NaN;
  if (!Number.isFinite(day)) return [];

  const actual = score.home > score.away ? 'WIN' : score.home < score.away ? 'LOSS' : 'DRAW';
  const resultAt = verified && Number.isFinite(review.resultRecordedAt) && review.resultRecordedAt! >= snapshot.kickoffAt
    ? review.resultRecordedAt : undefined;
  return [{ market, ...marketInputs(data, market),
    actual, day, recordedAt: verified ? snapshot.recordedAt : undefined, resultAt, data }];
}

function marketInputs(data: FullMatchData, market: Market) {
  const prices = data.euroOdds;
  const early = market1x2({ ...prices, lateWin: prices.earlyWin, lateDraw: prices.earlyDraw, lateLoss: prices.earlyLoss });
  const asian = data.asianHandicap;
  const opening = parseHandicapValue(asian.earlyHandicap, NaN);
  const closing = parseHandicapValue(asian.lateHandicap, NaN);
  const goals = parseOverUnderValue(data.overUnder.lateLine, NaN);
  const openGoals = parseOverUnderValue(data.overUnder.earlyLine, NaN);
  const features = EURO_OUTCOMES.map(outcome => {
    const sign = outcome === 'WIN' ? 1 : outcome === 'LOSS' ? -1 : 0;
    const oddsMovement = early ? Math.log(market.probabilities[outcome] / early.probabilities[outcome]) : 0;
    const waterMovement = sign === 1 ? asian.earlyHomeOdds - asian.lateHomeOdds : asian.earlyAwayOdds - asian.lateAwayOdds;
    return [
      Number(outcome === 'WIN'),
      Number(outcome === 'DRAW'),
      bounded(Math.log(market.probabilities[outcome]) / 3),
      bounded(oddsMovement),
      bounded(-sign * closing / 2),
      bounded(sign * (opening - closing)),
      outcome === 'DRAW' ? bounded(goals - 2.5) : 0,
      outcome === 'DRAW' ? bounded(goals - openGoals) : 0,
      sign !== 0 && opening === closing ? bounded(waterMovement) : 0,
    ];
  });
  return { features, logits: EURO_OUTCOMES.map(outcome => Math.log(market.probabilities[outcome])) };
}

function softmax(sample: Pick<Sample, 'features' | 'logits'>, weights: number[]): EuroVector {
  const [home, draw, away] = sample.logits.map((prior, i) =>
    weights.reduce((logit, weight, j) => logit + weight * sample.features[i][j], prior));
  const max = Math.max(home, draw, away);
  return unitSum({ WIN: Math.exp(home - max), DRAW: Math.exp(draw - max), LOSS: Math.exp(away - max) });
}

// Fit an L2-regularized multinomial correction on top of log market probabilities.
function fit(samples: Sample[], features: number): number[] {
  const weights = Array<number>(features).fill(0);
  for (let attempt = 0; attempt < 100; attempt++) {
    const gradient = weights.map(weight => L2 * weight);
    for (const row of samples) {
      const probs = softmax(row, weights);
      EURO_OUTCOMES.forEach((outcome, i) => {
        const residual = (probs[outcome] - Number(outcome === row.actual)) / samples.length;
        for (let j = 0; j < features; j++) gradient[j] += residual * row.features[i][j];
      });
    }
    for (let j = 0; j < features; j++) weights[j] -= 0.5 * gradient[j];
  }
  return weights;
}

export function fitArchivedCalibration(reviews: PostMatchReview[], throughSalesDay: string) {
  const cutoff = Date.parse(throughSalesDay);
  const train = reviews.flatMap(row => toSample(row, false)).filter(s => s.day <= cutoff);
  if (train.length < MIN_CALIBRATION_MATCHES) throw new Error('校准训练样本不足');
  return { throughSalesDay, count: train.length, euro: fit(train, 4), combined: fit(train, 9) };
}

function valueSelection(market: Market, p: EuroVector) {
  if (EURO_OUTCOMES.reduce((sum, key) => sum + 1 / market.prices[key], 0) < 1 - 1e-12) return null;
  const edge = (outcome: EuroOutcome) => p[outcome] * market.prices[outcome] - 1;
  const pick = EURO_OUTCOMES.reduce((a, b) => edge(b) > edge(a) ? b : a);
  return edge(pick) >= MIN_SIMULATED_EDGE ? pick : null;
}

export function calibratedSelection(data: FullMatchData, weights: number[]) {
  const market = market1x2(data.euroOdds);
  if (!market) return null;
  return valueSelection(market, softmax(marketInputs(data, market), weights));
}

export const ALGORITHM_NAMES = {
  proportional: '比例去水',
  power: 'Power 去水',
  shin: 'Shin 去水',
  euro: '欧赔校准',
  combined: '欧赔＋亚盘＋大小球校准',
} as const;

type Algorithm = keyof typeof ALGORITHM_NAMES;
const algorithms = Object.keys(ALGORITHM_NAMES) as Algorithm[];
function emptyResult() {
  return { n: 0, brier: 0, logLoss: 0, hits: 0, selected: 0, selectedHits: 0, profit: 0, marketProfit: 0 };
}
type Result = ReturnType<typeof emptyResult>;
function score(rows: Record<Algorithm, Result>, sample: Sample, probabilities: Record<Algorithm, EuroVector>) {
  for (const algorithm of algorithms) {
    const result = rows[algorithm];
    const p = probabilities[algorithm];
    const { market, actual } = sample;
    const top = EURO_OUTCOMES.reduce((a, b) => p[b] > p[a] ? b : a);
    result.n++;
    result.brier += euroBrier(p, actual);
    result.logLoss -= Math.log(Math.max(p[actual], 1e-15));
    result.hits += Number(top === actual);

    // Below-booksum-1 snapshots may combine quotes from different books. They
    // still score probabilities but do not produce simulated selections.
    const pick = valueSelection(market, p);
    if (!pick) continue;
    result.selected++;
    result.selectedHits += Number(pick === actual);
    result.profit += (pick === actual ? market.prices[pick] : 0) - 1;
    result.marketProfit += (market.lowest === actual ? market.prices[market.lowest] : 0) - 1;
  }
}

const makeResults = () => Object.fromEntries(algorithms.map(a => [a, emptyResult()])) as Record<Algorithm, Result>;

export function compareAlgorithms(reviews: PostMatchReview[], verifiedOnly: boolean) {
  const samples = reviews.flatMap(review => toSample(review, verifiedOnly));
  const days = [...new Set(samples.map(sample => sample.day))].sort((a, b) => a - b);
  const results = makeResults();
  const recent = makeResults();
  const staticResults = makeResults();
  const v4 = { selected: 0, hits: 0, profit: 0 };
  let evaluatedDays = 0;
  for (const day of days) {
    const tests = samples.filter(sample => sample.day === day);
    const cutoff = Math.min(...tests.map(sample => sample.recordedAt ?? Infinity));
    const train = samples.filter(sample => sample.day <= day - 2 * DAY_MS &&
      (!verifiedOnly || (sample.resultAt !== undefined && sample.resultAt < cutoff)));
    const learned = train.length >= MIN_CALIBRATION_MATCHES;
    const baseWeights = learned ? fit(train, 4) : [];
    const combinedWeights = learned ? fit(train, 9) : [];
    if (learned) evaluatedDays++;
    for (const sample of tests) {
      const proportional = sample.market.probabilities;
      const { power, shin } = alternativeMarketProbabilities(sample.market);
      const probabilities = { proportional, power, shin, euro: softmax(sample, baseWeights), combined: softmax(sample, combinedWeights) };
      if (!learned) {
        score(staticResults, sample, probabilities);
        continue;
      }
      score(results, sample, probabilities);
      if (day >= days[Math.max(0, days.length - 10)]) score(recent, sample, probabilities);
      const report = generateActuarialRuleReport(sample.data);
      const outcomes = decisionOutcomes(report.decision);
      if (report.decision.starRating === 5 && outcomes.length === 1) {
        v4.selected++;
        v4.hits += Number(outcomes[0] === sample.actual);
        v4.profit += (outcomes[0] === sample.actual ? sample.market.prices[sample.actual] : 0) - 1;
      }
    }
  }
  return { available: samples.length, evaluatedDays, results, recent, staticResults, v4 };
}
