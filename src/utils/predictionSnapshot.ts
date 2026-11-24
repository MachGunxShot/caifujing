import type { BatchMatchItem, FullMatchData, PredictionSnapshot } from '../types/fortuneActuary';
import { generateActuarialRuleReport } from './actuaryEngine';
import { isPlaceholderMarket } from './euroStatistics';
import { calculateSalesDate, hasExplicitKickoffDate } from './salesDayUtils';

export function snapshotKickoff(data: FullMatchData): number | undefined {
  const raw = data.matchInfo.matchTime;
  if (!hasExplicitKickoffDate(raw) || !/\b20\d{2}/.test(raw)) return;
  const time = calculateSalesDate(raw).kickoffTimeFormatted;
  if (!/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)) return;
  const date = Date.parse(time.replace(' ', 'T') + ':00+08:00');
  return Number.isFinite(date) ? date : undefined;
}

export function hasVerifiedSnapshot(snapshot?: PredictionSnapshot): snapshot is PredictionSnapshot & { kickoffAt: number } {
  return !!snapshot?.ruleVersion && snapshot.kickoffAt !== undefined
    && [snapshot.recordedAt, snapshot.frozenAt, snapshot.kickoffAt].every(Number.isFinite)
    && snapshot.recordedAt < snapshot.kickoffAt && snapshot.recordedAt <= snapshot.frozenAt;
}

export function sealQueuePrediction(item: BatchMatchItem, now: number, manual = false): BatchMatchItem {
  if (item.predictionSnapshot || item.isReviewed || item.finalScore || isPlaceholderMarket(item.data)) return item;
  const kickoffAt = snapshotKickoff(item.data);
  const recordedAt = item.marketRecordedAt ?? (manual ? now : undefined);
  if (recordedAt === undefined || recordedAt > now || (kickoffAt !== undefined && recordedAt >= kickoffAt)) return item;
  if (!manual && kickoffAt === undefined) return item;
  const report = item.report?.ruleVersion ? item.report : manual ? generateActuarialRuleReport(item.data) : undefined;
  if (!report?.ruleVersion) return item;
  return {
    ...item,
    report,
    isLocked: true,
    lockedAt: new Date(now).toISOString(),
    predictionSnapshot: { recordedAt, frozenAt: now, kickoffAt, ruleVersion: report.ruleVersion },
  };
}
