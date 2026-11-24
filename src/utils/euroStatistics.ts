import type { EuroOddsData, EuroOutcome, FullMatchData, PostMatchReview, StructuredDecision } from '../types/fortuneActuary';

export const EURO_OUTCOMES: EuroOutcome[] = ['WIN', 'DRAW', 'LOSS'];
export const EURO_LABELS = { WIN: '主胜', DRAW: '平局', LOSS: '客胜' };
export type EuroVector = Record<EuroOutcome, number>;

export function market1x2(odds: EuroOddsData) {
  const prices = { WIN: odds.lateWin, DRAW: odds.lateDraw, LOSS: odds.lateLoss };
  if (!Object.values(prices).every(price => Number.isFinite(price) && price > 1)) return null;
  const margin = EURO_OUTCOMES.reduce((total, outcome) => total + 1 / prices[outcome], 0);
  const probabilities = { WIN: 1 / prices.WIN / margin, DRAW: 1 / prices.DRAW / margin, LOSS: 1 / prices.LOSS / margin };
  const lowest = EURO_OUTCOMES.reduce((a, b) => prices[b] < prices[a] ? b : a);
  return { prices, probabilities, lowest };
}

export function euroBrier(probabilities: EuroVector, actual: EuroOutcome): number {
  return EURO_OUTCOMES.reduce((sum, outcome) => sum + (probabilities[outcome] - Number(actual === outcome)) ** 2, 0);
}

export function isPlaceholderMarket(data: FullMatchData): boolean {
  return data.matchInfo.marketStory === '批量实战赛果导入' || data.matchInfo.league === '实战复盘录入';
}

const aliases: Record<string, EuroOutcome[]> = {
  胜: ['WIN'], 主胜: ['WIN'], 主胜独赢: ['WIN'],
  平: ['DRAW'], 和: ['DRAW'], 平局: ['DRAW'], 胆平: ['DRAW'],
  负: ['LOSS'], 客胜: ['LOSS'], 客胜独赢: ['LOSS'],
  主队不败: ['WIN', 'DRAW'], 客队不败: ['DRAW', 'LOSS'],
};

export function parseEuroPick(label: string): EuroOutcome[] {
  if (typeof label !== 'string') return [];
  const main = label.split(/[（(]/, 1)[0].replace(/\s+/g, '');
  // These historical engine labels describe a handicap and spell out their
  // 1X2 cover in parentheses. A handicap alone has no fixed 1X2 outcome.
  if (main === '让球负' && /[（(]\s*客胜\s*[/／]\s*平/.test(label)) return ['DRAW', 'LOSS'];
  if (main === '让球胜' && /[（(]\s*主胜\s*[/／]\s*平/.test(label)) return ['WIN', 'DRAW'];
  if (main === '平局/让球双选' || main === '平局／让球双选') return ['DRAW'];
  const picks = new Set<EuroOutcome>();
  for (const token of main.split(/[/／、]/)) {
    if (!Object.hasOwn(aliases, token)) return [];
    for (const outcome of aliases[token]) picks.add(outcome);
  }
  return picks.size <= 2 ? [...picks] : [];
}

export function decisionOutcomes(decision?: Pick<StructuredDecision, 'euroPick' | 'euroOutcomes'>): EuroOutcome[] {
  const saved = decision?.euroOutcomes;
  if (Array.isArray(saved) && saved.length >= 1 && saved.length <= 2 &&
      saved.every(x => x === 'WIN' || x === 'DRAW' || x === 'LOSS') && new Set(saved).size === saved.length) return saved;
  return parseEuroPick(decision?.euroPick ?? '');
}

export function readStoredScore(review: Pick<PostMatchReview, 'actualHomeScore' | 'actualAwayScore' | 'actualScore'>) {
  const home = review.actualHomeScore;
  const away = review.actualAwayScore;
  if (Number.isInteger(home) && home >= 0 && Number.isInteger(away) && away >= 0) return { home, away };
  const match = typeof review.actualScore === 'string' && review.actualScore.match(/^\s*(\d{1,2})\s*[-:：]\s*(\d{1,2})\s*$/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

export function settleEuroReview(review: PostMatchReview) {
  if (review.matchData?.matchInfo && isPlaceholderMarket(review.matchData)) return null;
  const picks = decisionOutcomes(review.priorReport?.decision);
  const score = readStoredScore(review);
  if (!picks.length || !score) return null;
  const outcome = score.home > score.away ? 'WIN' : score.home < score.away ? 'LOSS' : 'DRAW';
  const hit = picks.includes(outcome);
  const odds = review.matchData?.euroOdds;
  const market = odds && market1x2(odds);
  const profit = market ? (hit ? market.prices[outcome] / picks.length : 0) - 1 : null;
  return { hit, choices: picks.length, profit };
}

export function euroStatistics(reviews: PostMatchReview[]) {
  const single = { hits: 0, total: 0 };
  const double = { hits: 0, total: 0 };
  let priced = 0;
  let profit = 0;
  for (const review of reviews) {
    const result = settleEuroReview(review);
    if (!result) continue;
    const group = result.choices === 1 ? single : double;
    group.total++;
    if (result.hit) group.hits++;
    if (result.profit !== null) {
      priced++;
      profit += result.profit;
    }
  }
  return { single, double, priced, profit, hits: single.hits + double.hits, settled: single.total + double.total };
}

export function displayRate(numerator: number, denominator: number): string {
  return denominator ? (100 * numerator / denominator).toFixed(2) + '%' : '—';
}
