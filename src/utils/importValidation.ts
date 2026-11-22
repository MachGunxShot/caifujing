import type { BatchMatchItem, FullMatchData } from '../types/fortuneActuary';

type Scalar = 'text' | 'nonempty' | 'number' | 'positive' | 'boolean';
type Shape = Scalar | [Shape] | { [key: string]: Shape };

function fields(type: Scalar, names: string): Record<string, Scalar> {
  return Object.fromEntries(names.split(' ').map(name => [name, type]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validate(value: unknown, shape: Shape, path: string): void {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error(path + ' 应为数组');
    value.forEach((item, index) => validate(item, shape[0], path + '[' + index + ']'));
  } else if (typeof shape === 'object') {
    if (!isObject(value)) throw new Error(path + ' 缺失或格式错误');
    for (const [key, child] of Object.entries(shape)) {
      const name = key.replace(/\?$/, '');
      if (key !== name && value[name] === undefined) continue;
      validate(value[name], child, path + '.' + name);
    }
  } else {
    const valid = shape === 'number' ? Number.isFinite(value)
      : shape === 'positive' ? typeof value === 'number' && Number.isFinite(value) && value > 0
      : shape === 'boolean' ? typeof value === 'boolean'
      : typeof value === 'string' && (shape === 'text' || value.trim().length > 0);
    if (!valid) throw new Error(path + ' 缺失或格式错误');
  }
}

const matchShape: Shape = {
  matchInfo: { ...fields('text', 'league matchTime marketStory homeProfile? awayProfile?'), ...fields('nonempty', 'homeTeam awayTeam') },
  asianHandicap: { ...fields('nonempty', 'earlyHandicap lateHandicap'), ...fields('positive', 'earlyHomeOdds earlyAwayOdds lateHomeOdds lateAwayOdds') },
  euroOdds: fields('positive', 'earlyWin earlyDraw earlyLoss lateWin lateDraw lateLoss'),
  overUnder: { ...fields('nonempty', 'earlyLine lateLine'), ...fields('positive', 'earlyOverOdds earlyUnderOdds lateOverOdds lateUnderOdds') },
  'additionalNotes?': 'text',
};

export function parseImageMatch(value: unknown): FullMatchData {
  if (!isObject(value)) throw new Error('截图中没有可用的结构化赛事数据');
  // Older prompts returned the five matchInfo fields at the top level.
  const {league, homeTeam, awayTeam, matchTime, marketStory} = value;
  const match = { ...value, matchInfo: value.matchInfo ?? {league, homeTeam, awayTeam, matchTime, marketStory} };
  validate(match, matchShape, '截图');
  return match as unknown as FullMatchData;
}

const reportShape: Shape = {
  ...fields('text', 'firstImpression threeDimLieDetection identifiedModel modelTitle source'),
  finalVerdict: fields('text', 'direction directionDetail riskWarning'),
  decision: { ...fields('text', 'euroPick handicapPick overUnderPick confidenceReason'), 'euroOutcomes?': ['text'], 'coreEligible?': 'boolean', 'v4Assessment?': 'text', starRating: 'number', predictedScores: ['text'] },
  metrics: {
    ...fields('number', 'earlyReturnRate lateReturnRate earlyHomeProb earlyDrawProb earlyAwayProb lateHomeProb lateDrawProb lateAwayProb'),
    ...fields('text', 'winTrend drawTrend lossTrend asianTrend homeWaterTrend overUnderVerdict handicapDiscrepancy'),
    detectedModels: [{ ...fields('text', 'model title description riskLevel'), confidence: 'number' }],
  },
};

const oddsSummary: Shape = { ...fields('number', 'homeOdds awayOdds win draw loss'), ...fields('text', 'handicap overUnderLine?') };
const shiftShape: Shape = {
  ...fields('text', 'shiftType earlyEuroPick lateEuroPick earlyHandicapPick lateHandicapPick earlyOverUnderPick? lateOverUnderPick? earlyModel lateModel earlyModelTitle lateModelTitle summaryTitle detailedExplanation'),
  ...fields('number', 'starChange earlyStars lateStars'), keyReasons: ['text'],
  waterDiff: fields('number', 'home away giving'), euroDiff: fields('number', 'win draw loss giving'),
  probDiff: fields('number', 'win draw loss'), earlyOddsSummary: oddsSummary, lateOddsSummary: oddsSummary,
};

const reviewShape: Shape = {
  id: 'nonempty', matchData: matchShape, priorReport: reportShape,
  ...fields('text', 'actualScore matchIncidents? salesDate? salesDateOverride? salesDateLabel? salesCycleText? kickoffTime? dissectionText evolvedRuleTitle evolvedRuleContent ruleCategory'),
  ...fields('number', 'actualHomeScore? actualAwayScore? reviewTimestamp'),
  outcomeEvaluation: {
    ...fields('boolean', 'euroHit handicapHit overUnderHit scoreHit? modelVerified'),
    ...fields('text', 'summaryNote handicapDetail? handicapDetailLabel?'),
  },
};

const itemShape: Shape = {
  id: 'nonempty', data: matchShape, status: 'text', timestamp: 'number',
  ...fields('text', 'sourceName? rawAiText? lockedAt? lockedReason? finalScore?'),
  ...fields('boolean', 'isLocked? isReviewed?'), 'report?': reportShape, 'review?': reviewShape,
  'earlyDataSnapshot?': matchShape, 'earlyReportSnapshot?': reportShape, 'confidenceShift?': shiftShape,
};

export function parseQueueBackup(input: string): BatchMatchItem[] {
  const items: unknown = JSON.parse(input);
  if (!Array.isArray(items) || !items.length) throw new Error('备份应包含至少一场赛事');
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = '第 ' + (index + 1) + ' 场';
    validate(item, itemShape, path);
    if (!['idle', 'analyzing', 'done', 'error'].includes(item.status)) throw new Error(path + '.status 无效');
    if (ids.has(item.id)) throw new Error(path + '.id 重复');
    ids.add(item.id);
  });
  return items;
}
