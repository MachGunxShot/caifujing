import type { EuroOutcome, PostMatchReview, StructuredDecision } from '../types/fortuneActuary';
import { assessV4, type V4RedLine } from './coreRulesV4';
import { generateActuarialRuleReport, parseHandicapValue, parseOverUnderValue } from './actuaryEngine';
import { EURO_OUTCOMES, euroBrier, type EuroVector, decisionOutcomes, readStoredScore, market1x2, isPlaceholderMarket } from './euroStatistics';
import { hasVerifiedSnapshot, snapshotKickoff } from './predictionSnapshot';
import { calculateSalesDate } from './salesDayUtils';

export const ODDS_BANDS = ['≤ 1.35', '> 1.35 至 1.50', '> 1.50 至 1.70', '> 1.70'];

function priceBand(price: number): number {
  if (price <= 1.35) return 0;
  if (price <= 1.50) return 1;
  if (price <= 1.70) return 2;
  return 3;
}

export type AuditCohort = 'five' | 'core' | 'single';

function singleInCohort(decision: StructuredDecision, cohort: AuditCohort) {
  const picks = decisionOutcomes(decision);
  if (picks.length !== 1) return null;
  if (cohort === 'five' && decision.starRating !== 5) return null;
  if (cohort === 'core' && decision.coreEligible !== true) return null;
  return picks[0];
}

type PricedMatch = NonNullable<ReturnType<typeof market1x2>>;
export type PairedStats = ReturnType<typeof emptyStats>;

function emptyStats() {
  return { total: 0, hits: 0, profit: 0, marketHits: 0, marketProfit: 0, agrees: 0 };
}

function addMatch(stats: PairedStats, market: PricedMatch, actual: EuroOutcome, pick: EuroOutcome | null) {
  if (!pick) return;
  stats.total++;
  stats.hits += Number(pick === actual);
  stats.profit += (pick === actual ? market.prices[pick] : 0) - 1;
  stats.marketHits += Number(market.lowest === actual);
  stats.marketProfit += (market.lowest === actual ? market.prices[market.lowest] : 0) - 1;
  stats.agrees += Number(market.lowest === pick);
}

interface SignalSample {
  probabilities: EuroVector;
  supported: EuroOutcome;
  actual: EuroOutcome;
  salesDay: string;
  recordedAt: number;
  resultRecordedAt: number;
}

export const MIN_SIGNAL_HISTORY = 30;

function rollingSignalComparison(samples: SignalSample[]) {
  let matchedMarket = 0;
  let candidate = 0;
  let total = 0;
  for (const current of samples) {
    const prior = samples.filter(row => row.salesDay < current.salesDay && row.resultRecordedAt <= current.recordedAt);
    if (prior.length < MIN_SIGNAL_HISTORY) continue;
    const adjustment = prior.reduce((sum, row) => sum + Number(row.actual === row.supported) - row.probabilities[row.supported], 0)
      / (prior.length + MIN_SIGNAL_HISTORY);
    const p = current.probabilities[current.supported];
    const adjusted = Math.min(0.99, Math.max(0.01, p + adjustment));
    const probabilities = { ...current.probabilities };
    for (const outcome of EURO_OUTCOMES) {
      probabilities[outcome] = outcome === current.supported ? adjusted : probabilities[outcome] * (1 - adjusted) / (1 - p);
    }
    matchedMarket += euroBrier(current.probabilities, current.actual);
    candidate += euroBrier(probabilities, current.actual);
    total++;
  }
  return { total, available: samples.length, matchedMarket, candidate };
}

export function auditRules(reviews: PostMatchReview[], cohort: AuditCohort, omittedRule: V4RedLine, verifiedOnly: boolean) {
  const archived = emptyStats();
  const baseline = emptyStats();
  const candidate = emptyStats();
  const bands = ODDS_BANDS.map(() => ({ baseline: emptyStats(), candidate: emptyStats(), added: emptyStats() }));
  const samples: SignalSample[] = [];
  const daily = new Map<string, { baseline: PairedStats; candidate: PairedStats; added: PairedStats }>();
  let qualifying = 0;
  let verified = 0;
  let placeholders = 0;
  let priced = 0;
  let marketBrier = 0;
  let triggered = 0;
  let pending = 0;
  let added = 0;
  let changed = 0;

  for (const review of reviews) {
    const data = review.matchData;
    if (isPlaceholderMarket(data)) {
      placeholders++;
      continue;
    }
    const score = readStoredScore(review);
    const market = data.euroOdds && market1x2(data.euroOdds);
    if (!score || !market || !data.asianHandicap || !data.overUnder || !review.priorReport?.decision) continue;
    qualifying++;
    const snapshot = review.predictionSnapshot;
    const isVerified = hasVerifiedSnapshot(snapshot) && review.priorReport.ruleVersion === snapshot?.ruleVersion
      && snapshot.kickoffAt === snapshotKickoff(data);
    verified += Number(isVerified);
    if (verifiedOnly && !isVerified) continue;
    priced++;

    const actual = score.home > score.away ? 'WIN' : score.home < score.away ? 'LOSS' : 'DRAW';
    const late = parseHandicapValue(data.asianHandicap.lateHandicap, NaN);
    const signal = assessV4(data, parseHandicapValue(data.asianHandicap.earlyHandicap, NaN), late,
      parseOverUnderValue(data.overUnder.earlyLine, NaN), parseOverUnderValue(data.overUnder.lateLine, NaN));
    const baseReport = generateActuarialRuleReport(data);
    const activeRedLine = signal.triggered.includes(omittedRule);
    const trialReport = activeRedLine ? generateActuarialRuleReport(data, omittedRule) : baseReport;
    const originalPick = singleInCohort(review.priorReport.decision, cohort);
    const basePick = singleInCohort(baseReport.decision, cohort);
    const trialPick = singleInCohort(trialReport.decision, cohort);
    triggered += Number(activeRedLine);
    pending += Number(signal.pending.includes(omittedRule));
    changed += Number(basePick !== trialPick);
    added += Number(trialPick != null && basePick == null);

    const band = bands[priceBand(market.prices[market.lowest])];
    addMatch(archived, market, actual, originalPick);
    addMatch(baseline, market, actual, basePick);
    addMatch(candidate, market, actual, trialPick);
    addMatch(band.baseline, market, actual, basePick);
    addMatch(band.candidate, market, actual, trialPick);
    if (!basePick) addMatch(band.added, market, actual, trialPick);

    const day = review.salesDate;
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const stats = daily.get(day) || { baseline: emptyStats(), candidate: emptyStats(), added: emptyStats() };
      addMatch(stats.baseline, market, actual, basePick);
      addMatch(stats.candidate, market, actual, trialPick);
      if (!basePick) addMatch(stats.added, market, actual, trialPick);
      daily.set(day, stats);
    }

    marketBrier += euroBrier(market.probabilities, actual);
    const resultTime = review.resultRecordedAt;
    if (signal.confirmed && isVerified && snapshot && resultTime !== undefined && Number.isFinite(resultTime) && resultTime >= snapshot.kickoffAt!) {
      samples.push({
        probabilities: market.probabilities,
        supported: late < 0 ? 'WIN' : 'LOSS',
        actual,
        salesDay: calculateSalesDate(new Date(snapshot.kickoffAt!).toISOString()).salesDate,
        recordedAt: snapshot.recordedAt,
        resultRecordedAt: resultTime,
      });
    }
  }

  return { archived, baseline, candidate, bands, qualifying, verified, placeholders, priced, marketBrier, triggered, pending, added, changed,
    daily: [...daily].sort(([left], [right]) => left.localeCompare(right)),
    rolling: rollingSignalComparison(samples) };
}
