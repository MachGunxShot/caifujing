import type { EuroOutcome, PostMatchReview, StructuredDecision } from '../types/fortuneActuary';

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
  const picks = decisionOutcomes(review.priorReport?.decision);
  const score = readStoredScore(review);
  if (!picks.length || !score) return null;
  const outcome = score.home > score.away ? 'WIN' : score.home < score.away ? 'LOSS' : 'DRAW';
  const hit = picks.includes(outcome);
  const odds = review.matchData?.euroOdds;
  let profit: number | null = null;
  if (odds && [odds.lateWin, odds.lateDraw, odds.lateLoss].every(n => Number.isFinite(n) && n > 1)) {
    const winningPrice = { WIN: odds.lateWin, DRAW: odds.lateDraw, LOSS: odds.lateLoss }[outcome];
    profit = (hit ? winningPrice / picks.length : 0) - 1;
  }
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
